#!/usr/bin/env node
/**
 * gen-code.mjs — 生成激活码（支持 M30 月卡 / PERM 永久）
 *
 * 用途：作者根据买家的「思源账号名 (userName)」生成专属激活码。
 *       码绑定该账号，转给别人无效。
 *
 * 套餐：
 *   PERM  永久激活（默认）
 *   M30   月卡 30 天（deadline = issueDate + 30 + 5 宽限期）
 *
 * 运行：
 *   node scripts/gen-code.mjs                          # 交互式（默认选 PERM）
 *   node scripts/gen-code.mjs --plan M30               # 交互式，但默认选 M30
 *   node scripts/gen-code.mjs --batch users.txt        # 批量（一行一个账号名）
 *   node scripts/gen-code.mjs --batch users.txt --plan M30
 *   或：
 *   pnpm gencode
 *   pnpm gencode -- --plan M30   # 注意 pnpm 需加 -- 透传参数
 *
 * 安全说明：
 * - 需要读取本机 scripts/private-key.json（由 gen-keypair.mjs 生成）。
 * - 生成的码会追加记录到 scripts/issued-codes.log（已被 .gitignore 忽略）。
 *
 * 注意：TRIAL 试用码（WHALE-FREE-TRIAL-6688）是硬编码的，无需通过本工具生成。
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

// ===== 套餐配置（与 src/utils/licenseManager.ts 保持一致）=====
const M30_DAYS = 30;
const GRACE_DAYS = 5;
const PLAN_PERM = "PERM";
const PLAN_M30 = "M30";

const pad2 = (n) => String(n).padStart(2, "0");
function fmtYYYYMMDD(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function addDays(dateStr, days) {
  const d = new Date(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(4, 6), 10) - 1,
    parseInt(dateStr.slice(6, 8), 10)
  );
  d.setDate(d.getDate() + days);
  return fmtYYYYMMDD(d);
}
function accountHash(userName) {
  const bytes = sha256(new TextEncoder().encode(userName));
  return Buffer.from(bytes).toString("hex").slice(0, 8);
}

/**
 * 生成一张激活码
 * @param {string} userName 思源账号名
 * @param {string} plan PLAN_M30 或 PLAN_PERM
 * @param {Buffer} privateKey Ed25519 私钥
 */
function generateCode(userName, plan, privateKey) {
  const now = new Date();
  const issueDate = fmtYYYYMMDD(now);
  const hash = accountHash(userName);

  let deadline;
  let humanDuration;
  if (plan === PLAN_M30) {
    // deadline = issueDate + 5 天宽限（与验证端 addDaysStr(issueDate, GRACE_DAYS) 完全一致）
    deadline = addDays(issueDate, GRACE_DAYS);
    humanDuration = `${M30_DAYS} 天（含 ${GRACE_DAYS} 天宽限）`;
  } else {
    // PERM：deadline 字段固定为字面量 "PERM"
    deadline = PLAN_PERM;
    humanDuration = "永久";
  }

  const message = `${plan}|${hash}|${issueDate}|${deadline}`;
  const signature = ed.sign(new TextEncoder().encode(message), privateKey);
  const sigB58 = base58Encode(signature);
  return {
    code: `WHALE-${plan}-${hash}-${issueDate}-${deadline}-${sigB58}`,
    plan,
    accountHash: hash,
    issueDate,
    deadline,
    humanDuration,
  };
}

function appendLog(record) {
  const line =
    `[${new Date().toISOString()}] ` +
    `plan=${record.plan} account=${record.account} code=${record.code}\n`;
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
  console.log("  套餐:       " + (r.plan === PLAN_PERM ? "永久" : "月卡 30 天"));
  console.log("  有效期:     " + r.humanDuration);
  console.log("  生成日:     " + r.issueDate);
  if (r.plan === PLAN_M30) {
    console.log("  到期日:     " + r.deadline + "（含宽限期，实际可用至该日）");
  }
  console.log("");
}

/**
 * 让用户在交互式模式下选择套餐。
 * @param {string} defaultPlan 默认高亮的套餐
 * @returns {Promise<string>} PLAN_M30 或 PLAN_PERM
 */
async function choosePlan(rl, defaultPlan) {
  console.log("\n━━━━━━ 请选择套餐 ━━━━━━");
  console.log("  1) 月卡 30 天（12 元）       [M30]");
  console.log("  2) 永久激活（45 元）          [PERM]");
  const defaultNum = defaultPlan === PLAN_M30 ? "1" : "2";
  const ans = (await rl.question(`? 选择套餐（1/2，回车默认 ${defaultNum}）: `)).trim();
  if (ans === "1") return PLAN_M30;
  if (ans === "2") return PLAN_PERM;
  return defaultPlan;
}

async function interactive(privateKey, defaultPlan) {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      const account = (await rl.question("? 买家思源账号名 (userName), 留空退出: ")).trim();
      if (!account) { console.log("已退出。"); break; }

      const plan = await choosePlan(rl, defaultPlan);
      const r = generateCode(account, plan, privateKey);
      printCode(account, r);
      appendLog({ ...r, account });
      console.log("📦 已记录到 scripts/issued-codes.log");
    }
  } finally { rl.close(); }
}

function batch(privateKey, usersFile, plan) {
  if (!existsSync(usersFile)) {
    console.error(`❌ 找不到用户列表文件: ${usersFile}`);
    process.exit(1);
  }
  const lines = readFileSync(usersFile, "utf8")
    .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
  const planLabel = plan === PLAN_M30 ? "月卡 30 天" : "永久";
  console.log(`\n批量发码：共 ${lines.length} 个账号，套餐 = ${planLabel}\n`);
  lines.forEach(account => {
    const r = generateCode(account, plan, privateKey);
    printCode(account, r);
    appendLog({ ...r, account });
  });
  console.log(`✅ 完成，共生成 ${lines.length} 张码`);
}

// ===== 参数解析 =====
const args = { batch: null, plan: PLAN_PERM };
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--batch") args.batch = process.argv[++i];
  else if (process.argv[i] === "--plan") {
    const v = String(process.argv[++i] || "").toUpperCase();
    if (v === "M30") args.plan = PLAN_M30;
    else if (v === "PERM") args.plan = PLAN_PERM;
    else {
      console.error(`❌ 未知 --plan 值: ${v}（只支持 M30 / PERM，TRIAL 是硬编码无需生成）`);
      process.exit(1);
    }
  }
}

const privateKey = loadPrivateKey();
if (args.batch) batch(privateKey, args.batch, args.plan);
else interactive(privateKey, args.plan).catch(e => { console.error("发码失败:", e); process.exit(1); });
