#!/usr/bin/env node
/**
 * gen-keypair.mjs — 生成 Ed25519 密钥对
 *
 * 运行：node scripts/gen-keypair.mjs
 * 输出：
 *   - scripts/private-key.json  （私钥，仅作者本机保留，已 .gitignore）
 *   - 终端打印公钥 hex，需手动填入 src/utils/activationCodeValidator.ts
 *
 * 使用 pnpm keygen 也可运行
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";

ed.etc.sha512Sync = sha512;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const privKey = ed.utils.randomPrivateKey();
  const pubKey = await ed.getPublicKeyAsync(privKey);

  const privHex = Buffer.from(privKey).toString("hex");
  const pubHex = Buffer.from(pubKey).toString("hex");

  const keyFile = resolve(__dirname, "private-key.json");
  if (existsSync(keyFile)) {
    console.log("⚠️  已存在 private-key.json，跳过生成。如要重新生成请先删除该文件。");
    console.log(`   当前公钥: ${pubHex}`);
    return;
  }

  writeFileSync(keyFile, JSON.stringify({ privateKey: privHex }, null, 2), "utf8");
  console.log("\n✅ 密钥对已生成！");
  console.log("   私钥已保存到: scripts/private-key.json（请勿泄露）\n");
  console.log("   请把下面的公钥粘贴到 src/utils/activationCodeValidator.ts 中：");
  console.log("   ─────────────────────────────────────────────");
  console.log(`   ${pubHex}`);
  console.log("   ─────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("生成失败:", e);
  process.exit(1);
});
