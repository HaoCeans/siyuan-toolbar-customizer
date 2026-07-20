/**
 * 激活码验证模块（Ed25519 离线签名 + 账号绑定 + 多套餐）
 *
 * ===== 支持的套餐 =====
 * | plan  | 含义     | 码格式举例（截断签名）                          |
 * |-------|---------|------------------------------------------------|
 * | TRIAL | 免费试用 | 硬编码：WHALE-FREE-TRIAL-6688（无签名）         |
 * | M30   | 月卡     | WHALE-M30-{hash}-{issueDate}-{deadline}-{sig}  |
 * | PERM  | 永久     | WHALE-PERM-{hash}-{issueDate}-PERM-{sig}       |
 *
 * ===== 激活码格式（M30 / PERM）=====
 *   WHALE-{plan}-{accountHash}-{issueDate}-{deadline}-{signature}
 *   accountHash : sha256(userName) 前 8 位 hex，绑定账号
 *   issueDate   : 生成日 YYYYMMDD
 *   deadline    : 最后到期日 YYYYMMDD（PERM 时为字面量 'PERM'）
 *                 M30 时 = issueDate + 30 天 + 5 天宽限期
 *   signature   : Ed25519 签名 "plan|accountHash|issueDate|deadline"，Base58
 *
 * ===== 安全边界 =====
 *   ✅ 防造码（无私钥造不出 M30/PERM 签名）
 *   ✅ 防一码多用（绑定 userName）
 *   ✅ 防过期使用（deadline 已过则拒绝激活）
 *   ⚠️ 前端通病，需反编译（TRIAL 码硬编码可被穷举，但试用价值有限）
 */

import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2";
import { base58Decode } from "./base58";
import {
  TRIAL_CODE,
  M30_DAYS,
  GRACE_DAYS,
  TRIAL_DAYS,
  startTrial,
  isTrialAvailable,
  fmtYYYYMMDD,
  parseYYYYMMDD,
} from "./licenseManager";

// Ed25519 需要 SHA-512 后端
ed.etc.sha512Sync = sha512;
ed.etc.sha512Async = sha512;

/**
 * 作者公钥（hex）。由 scripts/gen-keypair.mjs 生成，填到这里。
 * 私钥只存在作者本机 scripts/private-key.json，绝不会进插件。
 */
const PUBLIC_KEY_HEX = "13d3085547fcfb7b306ad7f908a5593445fd99f2b42dd5475346c979231dda40";

// ===== 类型 =====

export type Plan = "TRIAL" | "M30" | "PERM";

export type FailureReason =
  | "format"        // 格式错误
  | "plan"          // 不支持的套餐
  | "date"          // 日期格式错误
  | "signature"     // 签名验证失败
  | "account"       // 账号绑定不匹配
  | "expired"       // 激活码已过期（deadline 已过）
  | "trial_used";   // 试用已使用过

export interface ValidationResult {
  ok: boolean;
  /** 套餐（仅 ok=true 时有值） */
  plan?: Plan;
  /** 生成日期 YYYYMMDD */
  issueDate?: string;
  /** 码中携带的 deadline（YYYYMMDD 或 'PERM'） */
  deadline?: string;
  /** 实际到期日 YYYYMMDD 或 'PERM'（不含宽限期） */
  expiryDate?: string;
  /** 宽限期结束日 YYYYMMDD（PERM 时为空） */
  graceEnd?: string;
  /** 失败原因（仅 ok=false 时有值） */
  reason?: FailureReason;
}

// ===== 账号哈希 =====

/** 计算 accountHash = sha256(userName) 前 8 位 hex（小写） */
export function computeAccountHash(userName: string): string {
  const bytes = sha256(new TextEncoder().encode(userName));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.slice(0, 8);
}

// ===== 主验证入口 =====

/**
 * 验证激活码（支持 TRIAL / M30 / PERM）。
 *
 * @param code 用户输入的完整激活码
 * @param userName 当前思源登录账号名
 * @returns 结构化验证结果
 */
export function validateActivationCode(code: string, userName: string): ValidationResult {
  if (!userName || !userName.trim()) {
    return { ok: false, reason: "account" };
  }

  const trimmedCode = code.trim();

  // ===== 分支 1：试用码（硬编码，无签名）=====
  if (trimmedCode === TRIAL_CODE) {
    return validateTrialCode();
  }

  // ===== 分支 2：付费码（M30 / PERM，Ed25519 签名）=====
  return validatePaidCode(trimmedCode, userName.trim());
}

/** 验证试用码：检查 localStorage，写入试用开始日 */
function validateTrialCode(): ValidationResult {
  if (!isTrialAvailable()) {
    return { ok: false, reason: "trial_used" };
  }
  const result = startTrial();
  if (!result.ok) {
    return { ok: false, reason: "trial_used" };
  }
  return {
    ok: true,
    plan: "TRIAL",
    issueDate: fmtYYYYMMDD(new Date()),
    deadline: result.graceEnd,
    expiryDate: result.expiryDate,
    graceEnd: result.graceEnd,
  };
}

/** 验证付费激活码（M30 / PERM） */
function validatePaidCode(code: string, userName: string): ValidationResult {
  // 1. 基本格式：WHALE-PLAN-HASH-DATE-DEADLINE-SIG（6 段）
  const parts = code.split("-");
  if (parts.length !== 6 || parts[0] !== "WHALE") {
    return { ok: false, reason: "format" };
  }
  const [, planStr, accountHash, issueDate, deadline, sigB58] = parts;

  // 2. 套餐校验：只支持 M30 / PERM（TRIAL 走硬编码分支）
  if (planStr !== "M30" && planStr !== "PERM") {
    return { ok: false, reason: "plan" };
  }

  // 3. deadline 与 plan 必须一致
  if (planStr === "PERM" && deadline !== "PERM") {
    return { ok: false, reason: "format" };
  }
  if (planStr === "M30" && !/^\d{8}$/.test(deadline)) {
    return { ok: false, reason: "format" };
  }

  // 4. 日期格式校验
  if (!/^\d{8}$/.test(issueDate)) {
    return { ok: false, reason: "date" };
  }
  if (!parseYYYYMMDD(issueDate)) {
    return { ok: false, reason: "date" };
  }

  // 5. 还原签名消息（必须与发码端完全一致）
  const message = `${planStr}|${accountHash}|${issueDate}|${deadline}`;

  // 6. 解码签名并验签
  let signature: Uint8Array;
  try {
    signature = base58Decode(sigB58);
  } catch {
    return { ok: false, reason: "signature" };
  }
  let pubkey: Uint8Array;
  try {
    pubkey = hexToBytes(PUBLIC_KEY_HEX);
  } catch {
    return { ok: false, reason: "signature" };
  }

  try {
    const sigOk = ed.verify(signature, new TextEncoder().encode(message), pubkey);
    if (!sigOk) return { ok: false, reason: "signature" };
  } catch {
    return { ok: false, reason: "signature" };
  }

  // 7. 账号绑定校验
  const expectedHash = computeAccountHash(userName);
  if (accountHash !== expectedHash) return { ok: false, reason: "account" };

  // 8. 套餐特定校验：M30 检查 deadline 是否合理（issueDate + GRACE_DAYS 宽限）
  //    deadline 已过则拒绝激活（防止使用旧码）
  const today = fmtYYYYMMDD(new Date());
  if (planStr === "M30") {
    // 校验 deadline 是否 = issueDate + 5 天宽限（匹配生成器只加 GRACE_DAYS）
    const expectedDeadline = addDaysStr(issueDate, GRACE_DAYS);
    if (deadline !== expectedDeadline) {
      return { ok: false, reason: "format" };
    }
    // 激活码本身已过期（超过 deadline）→ 拒绝
    if (compareDateStr(today, deadline) > 0) {
      return { ok: false, reason: "expired" };
    }
    return {
      ok: true,
      plan: "M30",
      issueDate,
      deadline,
      expiryDate: addDaysStr(issueDate, M30_DAYS),    // 实际到期日（不含宽限）
      graceEnd: deadline,                              // 宽限期 = deadline
    };
  }

  // planStr === "PERM"
  return {
    ok: true,
    plan: "PERM",
    issueDate,
    deadline: "PERM",
    expiryDate: "PERM",
    graceEnd: "",
  };
}

// ===== 工具 =====

/** hex 字符串 → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex length must be even");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** YYYYMMDD + N 天 → YYYYMMDD */
function addDaysStr(dateStr: string, days: number): string {
  const d = parseYYYYMMDD(dateStr);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return fmtYYYYMMDD(d);
}

/** 比较两个 YYYYMMDD 字符串：>0 表示 a 晚于 b，=0 相等，<0 a 早于 b */
function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b);
}

export default { validateActivationCode, computeAccountHash };

// 兼容性别名（仅供开发期外部测试脚本使用，runtime 不要调用）
export { TRIAL_DAYS };
