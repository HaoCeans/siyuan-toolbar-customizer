#!/usr/bin/env node
/**
 * setup.mjs — 一键配置：生成密钥对 + 写入公钥到验证器
 *
 * 运行：node scripts/setup.mjs   或   pnpm setup
 *
 * 步骤：
 *   1. 如果 scripts/private-key.json 不存在，则生成密钥对
 *   2. 将公钥写入 src/utils/activationCodeValidator.ts（替换 <PUBKEY/> 标记）
 *   3. 打包插件
 */
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { execSync } from "node:child_process";

ed.etc.sha512Sync = sha512;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function main() {
  // 1. 生成密钥对（如果不存在）
  const keyFile = resolve(__dirname, "private-key.json");
  let pubHex;
  if (existsSync(keyFile)) {
    const data = JSON.parse(readFileSync(keyFile, "utf8"));
    const priv = Buffer.from(data.privateKey, "hex");
    const pub = await ed.getPublicKeyAsync(priv);
    pubHex = Buffer.from(pub).toString("hex");
    console.log("✅ 已存在密钥对，当前公钥:", pubHex);
  } else {
    const privKey = ed.utils.randomPrivateKey();
    const pubKey = await ed.getPublicKeyAsync(privKey);
    const privHex = Buffer.from(privKey).toString("hex");
    pubHex = Buffer.from(pubKey).toString("hex");
    writeFileSync(keyFile, JSON.stringify({ privateKey: privHex }, null, 2), "utf8");
    console.log("✅ 已生成新密钥对，公钥:", pubHex);
    console.log("   私钥已保存到 scripts/private-key.json（请勿泄露）");
  }

  // 2. 写入公钥到验证器
  const validatorFile = resolve(ROOT, "src/utils/activationCodeValidator.ts");
  let content = readFileSync(validatorFile, "utf8");
  const marker = "<PUBKEY/>";
  if (content.includes(marker)) {
    content = content.replace(marker, pubHex);
    writeFileSync(validatorFile, content, "utf8");
    console.log("✅ 公钥已写入 src/utils/activationCodeValidator.ts");
  } else {
    console.log("⚠️  未找到公钥标记 <PUBKEY/>，需手动粘贴公钥");
    console.log("   公钥:", pubHex);
  }

  console.log("\n🎉 配置完成！可以运行 pnpm gencode 生成激活码了。");
}

main().catch(e => { console.error("setup 失败:", e); process.exit(1); });
