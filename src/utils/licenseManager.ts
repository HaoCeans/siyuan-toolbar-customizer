/**
 * 授权管理中枢（License Manager）
 *
 * 统一管理"免费试用 / 月卡 / 永久"三种授权方案的判定逻辑。
 * 供 index.ts、toolbarManager.ts、quickNote/resolveFormat.ts、UI 共用。
 *
 * ===== 方案表 =====
 * | 方案     | plan   | 时长            | 价格     | 存储              |
 * |---------|--------|----------------|---------|-------------------|
 * | 免费试用 | trial  | 3 天（+5 天宽限）| 免费     | localStorage      |
 * | 月卡     | m30    | 30 天（+5 天宽限）| 12 元    | 思源 saveData     |
 * | 永久     | perm   | 永久             | 45 元    | 思源 saveData     |
 *
 * 试用码硬编码为 WHALE-FREE-TRIAL-6688（全局共享、无签名），每设备限一次。
 * 月卡 / 永久走 Ed25519 签名验证（详见 activationCodeValidator.ts）。
 *
 * 注意：此模块与 toolbarManager.ts 有循环引用（licenseManager → toolbarManager ← licenseManager），
 * 但所有引用 toolbarManager 的代码仅在运行时函数体内执行，ESM 的 live binding 可以正确解析。
 */

// ===== 常量 =====

/** 试用期天数（不含宽限期） */
export const TRIAL_DAYS = 3
/** 月卡有效期天数（不含宽限期） */
export const M30_DAYS = 30
/** 宽限期天数（到期后宽限天数，期间仍可用） */
export const GRACE_DAYS = 5
/** 即将到期提醒阈值（剩余天数 ≤ 此值时弹通知） */
export const EXPIRING_SOON_DAYS = 3
/** 全局共享的硬编码试用激活码 */
export const TRIAL_CODE = 'WHALE-FREE-TRIAL-6688'
/** localStorage 中保存试用开始日期的 key */
const TRIAL_LS_KEY = 'whaleToolbarTrialStart'
/** 每天最多提示一次"即将到期"的 sessionStorage key 前缀 */
const EXPIRING_NOTIFY_KEY = 'whaleToolbarExpiringNotified'

// ===== 类型 =====

export type Plan = 'none' | 'trial' | 'm30' | 'perm'

export interface LicenseStatus {
  /** 当前是否有效（包含宽限期） */
  active: boolean
  /** 当前套餐 */
  plan: Plan
  /** 到期日 YYYYMMDD 或 'PERM'（不含宽限期） */
  expiryDate: string
  /** 宽限期结束日 YYYYMMDD（永久为空） */
  graceEnd: string
  /** 是否处于宽限期内（已过 expiryDate 但未过 graceEnd） */
  inGracePeriod: boolean
  /** 是否已彻底过期（宽限期也过完） */
  expired: boolean
  /** 剩余可用天数（含宽限期；永久 = Infinity；已过期 = 0） */
  daysLeft: number
  /** 状态描述文案（供 UI 直接显示） */
  statusText: string
}

export interface TrialStartResult {
  ok: boolean
  reason?: 'trial_used' | 'unknown'
  /** 试用到期日（YYYYMMDD，不含宽限期） */
  expiryDate?: string
  /** 试用宽限结束日（YYYYMMDD） */
  graceEnd?: string
}

// ===== 日期工具 =====

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Date → YYYYMMDD（本地时区） */
export function fmtYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** YYYYMMDD → Date（本地 00:00:00） */
export function parseYYYYMMDD(s: string): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null
  const y = parseInt(s.slice(0, 4), 10)
  const m = parseInt(s.slice(4, 6), 10)
  const d = parseInt(s.slice(6, 8), 10)
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0)
  if (isNaN(dt.getTime())) return null
  return dt
}

/** 起算日 + N 天 → YYYYMMDD */
export function addDays(baseDateStr: string, days: number): string {
  const base = parseYYYYMMDD(baseDateStr)
  if (!base) return ''
  base.setDate(base.getDate() + days)
  return fmtYYYYMMDD(base)
}

/** 今天 0 点的 YYYYMMDD */
function todayStr(): string {
  return fmtYYYYMMDD(new Date())
}

/**
 * 计算从今天到目标日的剩余天数。
 * 同一天返回 0；目标日在未来返回正数；已过返回负数。
 */
function daysBetween(todayStr_: string, targetStr: string): number {
  const a = parseYYYYMMDD(todayStr_)
  const b = parseYYYYMMDD(targetStr)
  if (!a || !b) return 0
  // 用 UTC 日差避免夏令时干扰
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUtc - aUtc) / 86400000)
}

// ===== 试用（localStorage）=====

/** 读取试用开始日；未开始返回 null */
export function getTrialStartDate(): string | null {
  try {
    return localStorage.getItem(TRIAL_LS_KEY) || null
  } catch {
    return null
  }
}

/** 是否还可试用（localStorage 无 trialStartDate） */
export function isTrialAvailable(): boolean {
  return getTrialStartDate() === null
}

/**
 * 开始试用：写入 localStorage 并返回到期日。
 * 如果已试用过则失败。
 */
export function startTrial(): TrialStartResult {
  if (!isTrialAvailable()) {
    return { ok: false, reason: 'trial_used' }
  }
  const today = todayStr()
  try {
    localStorage.setItem(TRIAL_LS_KEY, today)
  } catch {
    return { ok: false, reason: 'unknown' }
  }
  return {
    ok: true,
    expiryDate: addDays(today, TRIAL_DAYS),
    graceEnd: addDays(today, TRIAL_DAYS + GRACE_DAYS),
  }
}

/** 清除试用标记（调试/重置用；正常运行不应调用） */
export function clearTrial(): void {
  try {
    localStorage.removeItem(TRIAL_LS_KEY)
  } catch {
    /* ignore */
  }
}

// ===== 配置读取（延迟加载 toolbarManager 避免循环引用死锁）=====

interface LicenseFields {
  licensePlan?: Plan
  licenseExpiry?: string  // YYYYMMDD 或 'PERM'
  licenseGraceEnd?: string
  // 兼容老版本字段（迁移用）
  authorActivated?: boolean
  authorCode?: string
  authorAccount?: string
}

/**
 * 读取当前生效的授权字段（desktop / mobile 取其一）。
 * 优先返回 plan !== 'none' 的一端；都没有时返回空对象。
 *
 * 通过 window.__pluginInstance 获取插件实例（由 toolbarManager.setPluginInstance 设置），
 * 避免与 toolbarManager.ts 循环依赖。
 */
function readActiveLicense(): { fields: LicenseFields; fromWhere: 'desktop' | 'mobile' | 'none' } {
  const pluginInst = (window as any).__pluginInstance
  if (!pluginInst) return { fields: {}, fromWhere: 'none' }

  const desktop = pluginInst.desktopFeatureConfig as LicenseFields | undefined
  const mobile = pluginInst.mobileFeatureConfig as LicenseFields | undefined

  // 两端任一已激活即视为生效
  if (desktop && desktop.licensePlan && desktop.licensePlan !== 'none') {
    return { fields: desktop, fromWhere: 'desktop' }
  }
  if (mobile && mobile.licensePlan && mobile.licensePlan !== 'none') {
    return { fields: mobile, fromWhere: 'mobile' }
  }
  // 老版本兼容：authorActivated=true 但无 license 字段（迁移前的状态）
  if (desktop && desktop.authorActivated) {
    return { fields: desktop, fromWhere: 'desktop' }
  }
  if (mobile && mobile.authorActivated) {
    return { fields: mobile, fromWhere: 'mobile' }
  }
  return { fields: {}, fromWhere: 'none' }
}

// ===== 核心：计算当前授权状态 =====

/**
 * 获取当前授权状态（综合 saveData 配置 + localStorage 试用标记）。
 *
 * 优先级：
 *   1. saveData 中有效的月卡/永久（>= 试用期，且未过期）
 *   2. localStorage 中有效的试用
 *   3. saveData 中已过期的月卡/永久（宽限期内 → active=true，宽限期外 → expired=true）
 *   4. 无任何授权
 */
export function getLicenseStatus(): LicenseStatus {
  const today = todayStr()
  const { fields } = readActiveLicense()
  const plan: Plan = fields.licensePlan || 'none'

  // === 永久授权 ===
  if (plan === 'perm' || (fields.authorActivated && (!fields.licensePlan || fields.licensePlan === 'none') && isLegacyPermCode(fields.authorCode))) {
    return {
      active: true,
      plan: 'perm',
      expiryDate: 'PERM',
      graceEnd: '',
      inGracePeriod: false,
      expired: false,
      daysLeft: Infinity,
      statusText: '永久激活',
    }
  }

  // === 月卡 ===
  if (plan === 'm30' && fields.licenseExpiry) {
    const expiry = fields.licenseExpiry
    const graceEnd = fields.licenseGraceEnd || addDays(expiry, GRACE_DAYS)
    return buildTimeBasedStatus('m30', expiry, graceEnd, today)
  }

  // === 试用（saveData 已记录的）===
  if (plan === 'trial' && fields.licenseExpiry) {
    const expiry = fields.licenseExpiry
    const graceEnd = fields.licenseGraceEnd || addDays(expiry, GRACE_DAYS)
    return buildTimeBasedStatus('trial', expiry, graceEnd, today)
  }

  // === localStorage 试用（未走完整激活流程，兜底识别）===
  const trialStart = getTrialStartDate()
  if (trialStart) {
    const expiry = addDays(trialStart, TRIAL_DAYS)
    const graceEnd = addDays(trialStart, TRIAL_DAYS + GRACE_DAYS)
    return buildTimeBasedStatus('trial', expiry, graceEnd, today)
  }

  // === 无授权 ===
  return {
    active: false,
    plan: 'none',
    expiryDate: '',
    graceEnd: '',
    inGracePeriod: false,
    expired: false,
    daysLeft: 0,
    statusText: '未激活',
  }
}

/** 构建基于时间的授权状态（月卡/试用） */
function buildTimeBasedStatus(plan: 'm30' | 'trial', expiry: string, graceEnd: string, today: string): LicenseStatus {
  const daysToExpiry = daysBetween(today, expiry)
  const daysToGraceEnd = daysBetween(today, graceEnd)

  if (daysToExpiry >= 0) {
    // 有效期内
    const planLabel = plan === 'm30' ? '月卡' : '试用'
    return {
      active: true,
      plan,
      expiryDate: expiry,
      graceEnd,
      inGracePeriod: false,
      expired: false,
      daysLeft: daysToExpiry,
      statusText: `${planLabel}（剩 ${daysToExpiry} 天）`,
    }
  }

  if (daysToGraceEnd >= 0) {
    // 宽限期内（仍可用，但提示即将到期）
    const planLabel = plan === 'm30' ? '月卡' : '试用'
    return {
      active: true,
      plan,
      expiryDate: expiry,
      graceEnd,
      inGracePeriod: true,
      expired: false,
      daysLeft: daysToGraceEnd,
      statusText: `${planLabel}（宽限期剩 ${daysToGraceEnd} 天）`,
    }
  }

  // 已彻底过期
  const planLabel = plan === 'm30' ? '月卡' : '试用'
  return {
    active: false,
    plan,
    expiryDate: expiry,
    graceEnd,
    inGracePeriod: false,
    expired: true,
    daysLeft: 0,
    statusText: `${planLabel}已过期`,
  }
}

/** 判断是否为旧版 PERM 激活码（WHALE-PERM-...） */
function isLegacyPermCode(code?: string): boolean {
  return !!(code && code.startsWith('WHALE-PERM-'))
}

// ===== 简易判定（替换原 isAuthorToolActivated 语义）=====

/**
 * 付费功能是否解锁（含试用期、宽限期）。
 * 等价于 `getLicenseStatus().active`，但更便宜——直接判断，不构造完整对象。
 */
export function isPaidFeatureUnlocked(): boolean {
  return getLicenseStatus().active
}

// ===== 老用户迁移 =====

/**
 * 老用户迁移：旧版本只有 authorActivated + authorCode(WHALE-PERM-...) 字段，
 * 新版本（v3.8+）需补全 licensePlan/licenseExpiry/licenseGraceEnd 字段。
 *
 * 调用时机：onload() 加载配置后立即调用一次。
 * 返回 true 表示执行了迁移（需 saveData）。
 *
 * 注意：此函数通过 window.__pluginInstance 访问插件实例（由 index.ts 的 setPluginInstance 设置）。
 */
export function migrateLegacyPerm(): boolean {
  const pluginInst = (window as any).__pluginInstance
  if (!pluginInst) return false

  let migrated = false
  const migrateOne = (config: any, saveKey: string) => {
    if (!config) return
    const hasNewField = config.licensePlan && config.licensePlan !== 'none'
    const isLegacyActivated = config.authorActivated && !hasNewField
    const isLegacyPermCode = config.authorCode && String(config.authorCode).startsWith('WHALE-PERM-')
    if (isLegacyActivated || isLegacyPermCode) {
      config.licensePlan = 'perm'
      config.licenseExpiry = 'PERM'
      config.licenseGraceEnd = ''
      config.authorActivated = true
      migrated = true
    }
  }

  migrateOne(pluginInst.desktopFeatureConfig, 'desktopFeatureConfig')
  migrateOne(pluginInst.mobileFeatureConfig, 'mobileFeatureConfig')
  return migrated
}

// ===== "即将到期"通知去重（每天最多一次）=====

/**
 * 检查今天是否已提示过"即将到期"。如未提示，标记为已提示并返回 true。
 * 用于避免每次按钮点击都弹通知。
 */
export function shouldNotifyExpiring(plan: Plan, daysLeft: number): boolean {
  if (daysLeft > EXPIRING_SOON_DAYS) return false  // 未到提醒阈值
  const key = `${EXPIRING_NOTIFY_KEY}_${plan}_${daysLeft}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    return true  // sessionStorage 不可用时降级为每次都提示
  }
}

export default {
  TRIAL_DAYS,
  M30_DAYS,
  GRACE_DAYS,
  TRIAL_CODE,
  getLicenseStatus,
  isPaidFeatureUnlocked,
  isTrialAvailable,
  startTrial,
  getTrialStartDate,
  clearTrial,
  migrateLegacyPerm,
  shouldNotifyExpiring,
  fmtYYYYMMDD,
  addDays,
  parseYYYYMMDD,
}
