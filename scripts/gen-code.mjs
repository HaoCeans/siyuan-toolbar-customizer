#!/usr/bin/env node
/**
 * gen-code.mjs — 生成永久激活码（仅 PERM）
 *
 * 用途：作者根据买家的「思源账号名 (userName)」生成专属激活码。
 *       码绑定该账号，转给别人无效。
 *
 * 运行：
 *   node scripts/gen-code.mjs                    # 交互式
 *   node scripts/gen-code.mjs --batch users.txt  # 批量（一行一个账号名）
 *   或：
 *   pnpm gencode
 *   pnpm gencode --batch users.txt
 *
 * 安全说明：
 * - 需要读取本机 scripts/private-key.json（由 gen-keypair.mjs 生成）。
 * - 生成的码会追加记录到 scripts/issued-codes.log（已被 .gitignore 忽略）。
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2";

// Base58 编码
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  const digits = [];
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (let i = 0; i < zeros; i++) out += B58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

ed.etc.sha512Sync = sha512;
ed.etc.sha512Async = sha512;

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = resolve(__dirname, "private-key.json");
const LOG_FILE = resolve(__dirname, "issued-codes.log");

const pad2 = (n) => String(n).padStart(2, "0");
function fmtYYYYMMDD(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function accountHash(userName) {
  const bytes = sha256(new TextEncoder().encode(userName));
  return Buffer.from(bytes).toString("hex").slice(0, 8);
}

/** 生成一张永久激活码 */
function generateCode(userName, privateKey) {
  const now = new Date();
  const issueDate = fmtYYYYMMDD(now);
  const plan = "PERM";
  const deadline = "PERM";
  const hash = accountHash(userName);
  const message = `${plan}|${hash}|${issueDate}|${deadline}`;
  const signature = ed.sign(new TextEncoder().encode(message), privateKey);
  const sigB58 = base58Encode(signature);
  return {
    code: `WHALE-${plan}-${hash}-${issueDate}-${deadline}-${sigB58}`,
    plan,
    accountHash: hash,
    issueDate,
    deadline,
  };
}

function appendLog(record) {
  const line =
    `[${new Date().toISOString()}] ` +
    `account=${record.account} code=${record.code}\n`;
  appendFileSync(LOG_FILE, line, "utf8");
}

function loadPrivateKey() {
  if (!existsSync(KEY_FILE)) {
    console.error("❌ 找不到 scripts/private-key.json");
    console.error("   请先运行： node scripts/gen-keypair.mjs");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(KEY_FILE, "utf8"));
  if (!data.privateKey) {
    console.error("❌ private-key.json 格式异常");
    process.exit(1);
  }
  return Buffer.from(data.privateKey, "hex");
}

function printCode(account, r) {
  console.log("\n✅ 生成成功，请把下面这串码发给买家：\n");
  console.log("  " + r.code);
  console.log("");
  console.log("  绑定账号:   " + account);
  console.log("  套餐:       永久");
  console.log("  有效期:     永久");
  console.log("");
}

async function interactive(privateKey) {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      const account = (await rl.question("? 买家思源账号名 (userName), 留空退出: ")).trim();
      if (!account) { console.log("已退出。"); break; }
      const r = generateCode(account, privateKey);
      printCode(account, r);
      appendLog({ ...r, account });
      console.log("📦 已记录到 scripts/issued-codes.log");
    }
  } finally { rl.close(); }
}

function batch(privateKey, usersFile) {
  if (!existsSync(usersFile)) {
    console.error(`❌ 找不到用户列表文件: ${usersFile}`);
    process.exit(1);
  }
  const lines = readFileSync(usersFile, "utf8")
    .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
  console.log(`\n批量发码：共 ${lines.length} 个账号，套餐 = 永久\n`);
  lines.forEach(account => {
    const r = generateCode(account, privateKey);
    printCode(account, r);
    appendLog({ ...r, account });
  });
  console.log(`✅ 完成，共生成 ${lines.length} 张码`);
}

const args = { batch: null };
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--batch") args.batch = process.argv[++i];
}
const privateKey = loadPrivateKey();
if (args.batch) batch(privateKey, args.batch);
else interactive(privateKey).catch(e => { console.error("发码失败:", e); process.exit(1); });
