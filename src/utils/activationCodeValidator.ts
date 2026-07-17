/**
 * 激活码验证模块（Ed25519 离线签名 + 账号绑定）
 *
 * 激活码格式：WHALE-PERM-{accountHash}-{issueDate}-PERM-{signature}
 *   accountHash : sha256(userName) 前 8 位 hex，绑定账号
 *   issueDate   : 生成日 YYYYMMDD
 *   signature   : Ed25519 签名 "PERM|accountHash|issueDate|PERM"，Base58
 *
 * 安全边界：
 *   ✅ 防造码（无私钥造不出签名）
 *   ✅ 防一码多用（绑定 userName）
 *   ⚠️ 前端通病，需反编译
 */

import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2";
import { base58Decode } from "./base58";

// Ed25519 需要 SHA-512 后端
ed.etc.sha512Sync = sha512;
ed.etc.sha512Async = sha512;

/**
 * 作者公钥（hex）。由 scripts/gen-keypair.mjs 生成，填到这里。
 * 私钥只存在作者本机 scripts/private-key.json，绝不会进插件。
 */
const PUBLIC_KEY_HEX = "13d3085547fcfb7b306ad7f908a5593445fd99f2b42dd5475346c979231dda40";

/** 计算 accountHash = sha256(userName) 前 8 位 hex（小写） */
export function computeAccountHash(userName: string): string {
  const bytes = sha256(new TextEncoder().encode(userName));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.slice(0, 8);
}

/**
 * 验证永久激活码：解析格式 → 验签 → 校验账号绑定
 * @param code 用户输入的完整激活码
 * @param userName 当前思源登录账号名
 */
export function validateActivationCode(code: string, userName: string): boolean {
  if (!PUBLIC_KEY_HEX) return false;
  if (!userName || !userName.trim()) return false;

  // 1. 基本格式：WHALE-PERM-HASH-DATE-PERM-SIG（6 段）
  const parts = code.trim().split("-");
  if (parts.length !== 6 || parts[0] !== "WHALE") return false;
  const [, planStr, accountHash, issueDate, deadline, sigB58] = parts;

  // 2. 只支持 PERM
  if (planStr !== "PERM") return false;
  if (deadline !== "PERM") return false;

  // 3. 日期格式校验
  if (!/^\d{8}$/.test(issueDate)) return false;

  // 4. 还原签名消息（必须与发码端完全一致）
  const message = `${planStr}|${accountHash}|${issueDate}|${deadline}`;

  // 5. 解码签名并验签
  let signature: Uint8Array;
  try {
    signature = base58Decode(sigB58);
  } catch {
    return false;
  }
  let pubkey: Uint8Array;
  try {
    pubkey = hexToBytes(PUBLIC_KEY_HEX);
  } catch {
    return false;
  }

  try {
    const sigOk = ed.verify(signature, new TextEncoder().encode(message), pubkey);
    if (!sigOk) return false;
  } catch {
    return false;
  }

  // 6. 账号绑定校验
  const expectedHash = computeAccountHash(userName.trim());
  if (accountHash !== expectedHash) return false;

  return true;
}

/** hex 字符串 → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex length must be even");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export default { validateActivationCode, computeAccountHash };
