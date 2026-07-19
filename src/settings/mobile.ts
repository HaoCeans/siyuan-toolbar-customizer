/**
 * 手机端设置模块
 * 处理手机端思源手机端增强的设置界面
 */

import { validateActivationCode } from '../utils/activationCodeValidator'

import type { Setting } from 'siyuan'
import type { GlobalButtonConfig } from '../toolbarManager'
import type { ButtonConfig } from '../toolbarManager'
import { showMessage } from 'siyuan'
import * as Notify from '../notification'
import { createMobileButtonItem, type MobileButtonContext } from '../ui/buttonItems/mobile'
import { createToolbarPreview } from '../ui/toolbarPreview'
import { createMobileQuickNoteFormatField } from '../ui/quickNoteFormatField'
import { calculateButtonOverflow, getToolbarAvailableWidth, getButtonWidth } from '../toolbarManager'
import { lucideToSvg } from '../utils/lucideHelper'

/**
 * 活跃的滑杆拖拽清理函数集合。
 * 滑杆拖拽时向 document 注册 pointermove/pointerup/pointercancel 监听器，
 * 如果在拖拽过程中触发重渲染（innerHTML=''），这些监听器会残留。
 * 此集合存储每个活跃拖拽的 upHandler，重渲染前强制执行清理。
 */
const _activeSliderDrags = new Set<() => void>()

function flushSliderDrags(): void {
  for (const fn of _activeSliderDrags) {
    try { fn() } catch { /* ignore */ }
  }
  _activeSliderDrags.clear()
}

/**
 * 从 "12px" / "12" 解析滑杆初始整数值。0 为合法值，禁止写成 parseInt(x) || fallback（会把 0 当成缺省）。
 */
function parseLengthSliderInt(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? '').trim(), 10)
  return Number.isNaN(n) ? fallback : n
}

/**
 * 注入收款码弹窗样式（与电脑端 desktop.ts 共用同一套 class 名，id 检查避免重复注入）。
 */
function ensurePayStyle(): void {
  if (document.getElementById('toolbar-customizer-pay-style')) return
  const payStyle = document.createElement('style')
  payStyle.id = 'toolbar-customizer-pay-style'
  payStyle.textContent = `
    .toolbar-customizer-pay-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
    }
    .toolbar-customizer-pay-dialog {
      position: relative;
      background: var(--b3-theme-background);
      border-radius: 14px;
      padding: 20px;
      max-width: 300px; width: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .toolbar-customizer-pay-close {
      position: absolute; top: 8px; right: 12px;
      background: transparent; border: none; font-size: 22px;
      color: var(--b3-theme-on-surface); cursor: pointer; line-height: 1;
    }
    .toolbar-customizer-pay-title {
      font-size: 14px; font-weight: 600; text-align: center;
      margin-bottom: 14px; color: var(--b3-theme-on-background);
    }
    .toolbar-customizer-pay-current {
      display: flex; justify-content: center; margin-bottom: 14px;
    }
    .toolbar-customizer-pay-qr {
      width: 240px; height: auto; aspect-ratio: 1; border-radius: 8px;
      border: 1px solid var(--b3-border-color); object-fit: contain;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: var(--b3-theme-on-surface); text-align: center;
      background: var(--b3-theme-surface);
    }
    .toolbar-customizer-pay-tabs {
      display: flex; gap: 8px; justify-content: center; margin-bottom: 14px;
    }
    .toolbar-customizer-pay-tab {
      padding: 6px 22px; font-size: 13px; cursor: pointer;
      background: transparent; color: var(--b3-theme-on-surface);
      border: 1px solid var(--b3-border-color); border-radius: 20px;
      transition: all 0.15s;
    }
    .toolbar-customizer-pay-tab.active {
      background: var(--b3-theme-primary); color: var(--b3-theme-on-primary);
      border-color: var(--b3-theme-primary);
    }
    .toolbar-customizer-pay-tip {
      font-size: 11px; color: var(--b3-theme-on-surface);
      text-align: center; line-height: 1.5;
    }
  `
  document.head.appendChild(payStyle)
}

/**
 * 弹出收款码弹窗（手机端，逻辑与电脑端 showPayModal 一致，复用同一套 class 名）。
 */
function showPayModalMobile(planName: string, userName: string): void {
  ensurePayStyle()
  const overlay = document.createElement('div')
  overlay.className = 'toolbar-customizer-pay-overlay'
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove() }

  const dialog = document.createElement('div')
  dialog.className = 'toolbar-customizer-pay-dialog'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'toolbar-customizer-pay-close'
  closeBtn.textContent = '×'
  closeBtn.onclick = () => overlay.remove()

  const titleEl = document.createElement('div')
  titleEl.className = 'toolbar-customizer-pay-title'
  titleEl.textContent = planName

  const qrCurrent = document.createElement('div')
  qrCurrent.className = 'toolbar-customizer-pay-current'

  const tabContainer = document.createElement('div')
  tabContainer.className = 'toolbar-customizer-pay-tabs'

  const wechatTab = document.createElement('button')
  wechatTab.className = 'toolbar-customizer-pay-tab active'
  wechatTab.textContent = '微信'

  const alipayTab = document.createElement('button')
  alipayTab.className = 'toolbar-customizer-pay-tab'
  alipayTab.textContent = '支付宝'

  const loadQr = (tab: 'wechat' | 'alipay') => {
    qrCurrent.innerHTML = ''
    const fileName = tab === 'wechat' ? 'pay-wechat.png' : 'pay-alipay.png'
    const url = `/plugins/siyuan-toolbar-customizer/${fileName}?_t=${Date.now()}`
    const img = document.createElement('img')
    img.className = 'toolbar-customizer-pay-qr'
    img.alt = '收款码'
    img.onload = () => { qrCurrent.appendChild(img) }
    img.onerror = () => {
      const placeholder = document.createElement('div')
      placeholder.className = 'toolbar-customizer-pay-qr'
      placeholder.textContent = '收款码占位'
      qrCurrent.appendChild(placeholder)
    }
    img.src = url
  }

  wechatTab.onclick = () => {
    wechatTab.classList.add('active')
    alipayTab.classList.remove('active')
    loadQr('wechat')
  }
  alipayTab.onclick = () => {
    alipayTab.classList.add('active')
    wechatTab.classList.remove('active')
    loadQr('alipay')
  }

  tabContainer.appendChild(wechatTab)
  tabContainer.appendChild(alipayTab)

  const tip = document.createElement('div')
  tip.className = 'toolbar-customizer-pay-tip'
  tip.innerHTML = `付款后请将用户名<strong>${userName}</strong>和付款截图发至 17114555244@qq.com 邮箱或<a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入QQ群</a>联系群主。`

  dialog.appendChild(closeBtn)
  dialog.appendChild(titleEl)
  dialog.appendChild(qrCurrent)
  dialog.appendChild(tabContainer)
  dialog.appendChild(tip)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  loadQr('wechat')
}

/**
 * 弹出"激活方式说明"弹窗（手机端）。
 * 内容与电脑端激活说明一致：定价原则 + 激活码方案 + 付款账号（含复制）+ 付款发码流程。
 * 布局针对手机窄屏适配：宽度铺满、字号略小、间距收紧、内容可滚动。
 *
 * 复用项目通用的"全屏遮罩 + 居中面板"弹窗模式（与 showIconPicker/showPayModal 一致）。
 */
function showActivationInfoModal(isActivated: boolean): void {
  // 获取当前思源账号用户名（与电脑端 currentUserName 一致）
  const currentUserName = (): string => {
    const u = (window as any).siyuan?.user
    return (u && typeof u.userName === 'string' && u.userName) || ''
  }

  // 遮罩
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    padding: 16px; box-sizing: border-box;
  `

  // 弹窗面板（手机端：宽度铺满，最大 420px，最大高度 85vh，内容滚动）
  const panel = document.createElement('div')
  panel.style.cssText = `
    background: var(--b3-theme-background);
    border-radius: 12px;
    width: 100%; max-width: 420px;
    max-height: 85vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  `

  // 标题栏（含关闭按钮）
  const header = document.createElement('div')
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--b3-border-color);
    flex-shrink: 0;
  `
  const title = document.createElement('div')
  title.style.cssText = 'font-size: 16px; font-weight: 700; color: #722ed1;'
  title.textContent = '🔐 激活方式说明'
  const closeBtn = document.createElement('button')
  closeBtn.className = 'b3-button b3-button--text'
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'font-size: 18px; padding: 2px 8px; color: var(--b3-theme-on-surface);'
  closeBtn.onclick = () => overlay.remove()
  header.appendChild(title)
  header.appendChild(closeBtn)
  panel.appendChild(header)

  // 内容区（可滚动）
  const content = document.createElement('div')
  content.style.cssText = 'padding: 14px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px;'

  // ===== 区块1：定价原则 =====
  const pricingBox = document.createElement('div')
  pricingBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-surface);'

  const pricingTitle = document.createElement('div')
  pricingTitle.style.cssText = 'font-size: 14px; font-weight: bold; color: var(--b3-theme-on-background); margin-bottom: 10px;'
  pricingTitle.textContent = '📐 激活方案定价原则'
  pricingBox.appendChild(pricingTitle)

  const principles = [
    { text: '免费功能已经占据80%，通常免费功能已经可以满足需求', highlight: false },
    { text: '鲸鱼定制工具箱功能均为定制，每项功能，作者均额外花费大量时间制作，并调整适配', highlight: false },
    { text: '目前鲸鱼定制工具箱有17项定制功能，其中2项免费，共15项付费功能', highlight: false },
    { text: '基于花费的时间和精力，以及前期的定制均为免费，作者决定每项定制定价为3元，进而决定永久价格', highlight: true },
    { text: '后续将继续增加定制功能，价格也会适当上涨', highlight: false },
    { text: '同时适当增加部分免费定制功能，不大幅调整价格', highlight: false },
  ]
  principles.forEach((item, idx) => {
    const row = document.createElement('div')
    row.style.cssText = `display: flex; gap: 6px; font-size: 12px; line-height: 1.55; margin-bottom: 5px; padding: ${item.highlight ? '7px 8px' : '0'}; border-radius: ${item.highlight ? '6px' : '0'}; background: ${item.highlight ? 'color-mix(in srgb, var(--b3-theme-primary) 10%, transparent)' : 'transparent'};`
    const num = document.createElement('span')
    num.style.cssText = `flex: none; font-weight: 600; color: ${item.highlight ? '#d4380d' : 'var(--b3-theme-primary)'};`
    num.textContent = `${idx + 1}.`
    const txt = document.createElement('span')
    txt.style.cssText = `flex: 1; color: var(--b3-theme-on-background); font-weight: ${item.highlight ? '600' : '400'};`
    txt.textContent = item.text
    row.appendChild(num)
    row.appendChild(txt)
    pricingBox.appendChild(row)
  })
  content.appendChild(pricingBox)

  // ===== 区块2：激活码方案（4 卡片，手机端单列） =====
  const plansBox = document.createElement('div')
  plansBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px;'

  const plansTitle = document.createElement('div')
  plansTitle.style.cssText = 'font-size: 15px; font-weight: bold; color: #722ed1; margin-bottom: 12px; text-align: center;'
  plansTitle.textContent = '📦 激活码方案'
  plansBox.appendChild(plansTitle)

  // 手机端单列排列（与电脑端 2×2 网格不同）
  const plansWrapper = document.createElement('div')
  plansWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

  const planCards = [
    { name: '永久正价', price: '45', unit: '元', duration: '永久', badge: '', hot: false, desc: '鲸鱼定制工具箱永久激活码（电脑+手机），解锁全部15项付费功能', features: ['永久激活码（电脑+手机）', '15项付费功能全解锁'] },
    { name: '普通优惠', price: '36', unit: '元', duration: '8折', badge: '推荐', hot: true, desc: '鲸鱼定制工具箱永久激活码（电脑+手机），限时优惠 10 个，送完即止', features: ['永久激活码（电脑+手机）', '限时8折优惠'] },
    { name: '学生优惠', price: '22.5', unit: '元', duration: '5折', badge: '', hot: false, desc: '需提供可证明在读学生身份的信息', features: ['永久激活码（电脑+手机）', '限时5折优惠', '需学生身份证明'] },
    { name: '定制开发', price: '100', unit: '元起', duration: '手工费', badge: '', hot: false, desc: '有专门需求的可联系作者开发专属功能，只展示给你自己使用，也可决定是否纳入工具箱', features: ['专属功能定制', '仅自己可见/纳入工具箱', '作者评估实现'] },
  ]

  planCards.forEach(card => {
    const cardEl = document.createElement('div')
    const borderClr = card.hot ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
    const bgClr = card.hot ? 'color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-background))' : 'var(--b3-theme-background)'
    cardEl.style.cssText = `position: relative; border: 1px solid ${borderClr}; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 3px; background: ${bgClr};`

    if (card.badge) {
      const badge = document.createElement('div')
      badge.textContent = card.badge
      badge.style.cssText = 'position: absolute; top: -8px; right: 10px; background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); font-size: 10px; padding: 2px 8px; border-radius: 10px;'
      cardEl.appendChild(badge)
    }

    const nameEl = document.createElement('div')
    nameEl.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--b3-theme-on-background);'
    nameEl.textContent = card.name
    cardEl.appendChild(nameEl)

    const durationEl = document.createElement('div')
    durationEl.style.cssText = 'font-size: 10px; color: var(--b3-theme-on-surface);'
    durationEl.textContent = card.duration
    cardEl.appendChild(durationEl)

    const priceRow = document.createElement('div')
    priceRow.style.cssText = 'margin: 2px 0;'
    const priceNum = document.createElement('span')
    priceNum.style.cssText = 'font-size: 20px; font-weight: 700; color: var(--b3-theme-primary);'
    priceNum.textContent = card.price
    priceRow.appendChild(priceNum)
    if (card.unit) {
      const priceUnit = document.createElement('span')
      priceUnit.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-left: 2px;'
      priceUnit.textContent = card.unit
      priceRow.appendChild(priceUnit)
    }
    cardEl.appendChild(priceRow)

    const descEl = document.createElement('div')
    descEl.style.cssText = 'font-size: 10px; color: var(--b3-theme-on-surface); line-height: 1.5; margin: 2px 0 6px;'
    descEl.textContent = card.desc
    cardEl.appendChild(descEl)

    card.features.forEach(f => {
      const feat = document.createElement('div')
      feat.style.cssText = 'font-size: 9px; color: var(--b3-theme-on-surface); line-height: 1.4; padding-left: 6px;'
      feat.textContent = '• ' + f
      cardEl.appendChild(feat)
    })

    const buyBtn = document.createElement('button')
    const btnBg = card.hot ? 'var(--b3-theme-primary)' : 'transparent'
    const btnClr = card.hot ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
    const btnBdr = card.hot ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
    buyBtn.style.cssText = `margin-top: 8px; padding: 6px 0; font-size: 11px; cursor: pointer; background: ${btnBg}; color: ${btnClr}; border: 1px solid ${btnBdr}; border-radius: 6px;`
    buyBtn.textContent = '扫码购买'
    buyBtn.onclick = () => showPayModalMobile(card.name, currentUserName())
    cardEl.appendChild(buyBtn)

    plansWrapper.appendChild(cardEl)
  })

  plansBox.appendChild(plansWrapper)
  content.appendChild(plansBox)

  // ===== 区块3：付款账号（含复制） =====
  const accountBox = document.createElement('div')
  accountBox.style.cssText = 'padding: 10px 12px; background: var(--b3-theme-surface); border-radius: 10px;'

  const accountHint = document.createElement('div')
  accountHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-bottom: 6px;'
  accountHint.textContent = '付款时请提供以下用户名'
  accountBox.appendChild(accountHint)

  const accountRow = document.createElement('div')
  accountRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'
  const accountName = document.createElement('span')
  accountName.style.cssText = 'font-size: 15px; font-weight: 700; color: var(--b3-theme-on-background);'
  accountName.textContent = currentUserName() || '未登录思源账号'
  accountRow.appendChild(accountName)

  const copyBtn = document.createElement('button')
  copyBtn.style.cssText = 'padding: 2px 10px; font-size: 12px; color: var(--b3-theme-primary); background: transparent; border: 1px solid var(--b3-theme-primary); border-radius: 4px; cursor: pointer;'
  copyBtn.textContent = '复制'
  copyBtn.onclick = async () => {
    const name = currentUserName()
    if (!name) {
      copyBtn.textContent = '未登录'
      setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(name)
      } else {
        const ta = document.createElement('textarea')
        ta.value = name
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      copyBtn.textContent = '已复制！'
      setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
    } catch {
      copyBtn.textContent = '复制失败'
      setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
    }
  }
  accountRow.appendChild(copyBtn)
  accountBox.appendChild(accountRow)

  const accountNotice = document.createElement('div')
  accountNotice.style.cssText = 'font-size: 11px; color: #d4380d; margin-top: 6px; padding: 6px 8px; background: color-mix(in srgb, #ff4d4f 8%, transparent); border-radius: 4px; line-height: 1.5; font-weight: 500;'
  accountNotice.textContent = '激活码将根据该用户名直接绑定你的思源账号，请务必发送'
  accountBox.appendChild(accountNotice)

  const accountTip = document.createElement('div')
  accountTip.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-top: 6px; line-height: 1.5;'
  accountTip.innerHTML = '无法在付款备注提供时，可将用户名和付款截图发送至 17114555244@qq.com，或 <a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入 QQ 群</a>联系群主。'
  accountBox.appendChild(accountTip)
  content.appendChild(accountBox)

  // ===== 区块4：付款发码流程 =====
  const flowBox = document.createElement('div')
  flowBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px;'

  const flowTitle = document.createElement('div')
  flowTitle.style.cssText = 'font-size: 14px; font-weight: bold; color: #722ed1; margin-bottom: 12px;'
  flowTitle.textContent = '📋 付款发码流程'
  flowBox.appendChild(flowTitle)

  const flowSteps = document.createElement('div')
  flowSteps.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'
  const steps = [
    { title: '选择方案', desc: '选择适合你的套餐方案，点击「扫码购买」' },
    { title: '扫码转账', desc: '使用微信或支付宝扫码付款，付款备注请提供用户名「<strong>' + (currentUserName() || (isActivated ? '已激活用户' : '你的思源账号用户名')) + '</strong>」' },
    { title: '提供信息', desc: '将付款截图和用户名<strong>' + (currentUserName() || '（你的思源账号）') + '</strong>发送至 17114555244@qq.com 邮箱，或<a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入 QQ 群</a>联系群主' },
    { title: '获取激活码', desc: '群主核实后发放激活码，回到本页粘贴激活即可解锁全部功能' },
  ]
  steps.forEach((step, i) => {
    const stepRow = document.createElement('div')
    stepRow.style.cssText = 'display: flex; gap: 8px;'
    const stepNum = document.createElement('span')
    stepNum.textContent = String(i + 1)
    stepNum.style.cssText = 'flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;'
    stepRow.appendChild(stepNum)
    const stepContent = document.createElement('div')
    stepContent.style.cssText = 'flex: 1;'
    const stepH = document.createElement('div')
    stepH.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--b3-theme-on-background);'
    stepH.textContent = step.title
    stepContent.appendChild(stepH)
    const stepD = document.createElement('div')
    stepD.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); line-height: 1.5; margin-top: 2px;'
    stepD.innerHTML = step.desc
    stepContent.appendChild(stepD)
    stepRow.appendChild(stepContent)
    flowSteps.appendChild(stepRow)
  })
  flowBox.appendChild(flowSteps)
  content.appendChild(flowBox)

  panel.appendChild(content)
  overlay.appendChild(panel)

  // 点击遮罩外部关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove()
  }

  document.body.appendChild(overlay)
}

/**
 * 手机端工具栏配置接口
 */
export interface MobileToolbarConfig {
  // 底部工具栏配置
  enableBottomToolbar: boolean
  closeInputOffset?: string
  openInputOffset?: string
  heightThreshold?: number
  overflowToolbarDistanceBottom?: string  // 扩展工具栏距离底部工具栏的距离
  overflowToolbarHeightBottom?: string    // 底部模式扩展工具栏高度
  bottomToolbarRetryDelay?: number;      // 底部工具栏重试延迟（毫秒，0=无重试）

  // 共享样式配置
  toolbarHeight: string
  toolbarBackgroundColor?: string
  toolbarBackgroundColorDark?: string
  useThemeColor?: boolean
  toolbarOpacity?: number
  toolbarZIndex?: number

  // 顶部工具栏配置
  enableTopToolbar?: boolean
  topToolbarOffset?: string
  overflowToolbarDistanceTop?: string  // 扩展工具栏距离顶部工具栏的距离
  overflowToolbarHeightTop?: string     // 顶部模式扩展工具栏高度
  topToolbarRetryDelay?: number;        // 顶部工具栏重试延迟（毫秒，0=无重试）

  // 底部胶囊工具栏配置
  enableFloatingToolbar?: boolean;  // 是否启用底部胶囊工具栏
  floatingToolbarMargin?: string;   // 胶囊距底部距离
  floatingToolbarBorderRadius?: string; // 胶囊圆角
  floatingToolbarHeight?: string;   // 胶囊自身高度
  floatingToolbarScrollHide?: boolean; // 胶囊滚动隐藏
}

/**
 * 手机端功能配置接口
 */
export interface MobileFeatureConfig {
  hideBreadcrumbIcon: boolean
  hideReadonlyButton: boolean
  hideDocMenuButton: boolean
  hideMoreButton: boolean
  /** 顶部工具栏云同步位置左侧显示 H，点击硬换行 */
  showMobileLineBreakButton?: boolean
  disableCustomButtons: boolean
  disableMobileSwipe?: boolean
  authorCode?: string
  authorActivated?: boolean
  authorAccount?: string  // 绑定的思源账号（与电脑端一致，重启后用于校验激活态是否仍属于当前账号）
  popupConfig?: 'disabled' | 'smallWindowOnly' | 'bothModes'
  quickNoteNotebookId?: string
  quickNoteDocumentId?: string  // 新增：一键记事目标文档ID
  quickNoteInsertPosition?: 'top' | 'bottom'  // 一键记事插入位置：顶部/底部
  quickNoteInputFormat?: 'plain' | 'block'  // 一键记事输入格式：plain=纯文本, block=思源块格式
  // 一键记事按钮样式配置
  useCustomButtonStyle?: boolean    // 是否使用自定义按钮样式
  quickNoteButtonMinWidth?: number  // 按钮自身宽度
  quickNoteButtonMargin?: number    // 按钮自身外边距
  quickNoteButtonPadding?: number   // 按钮内容的内边距
  quickNoteButtonGap?: number       // 按钮之间的间距
  quickNoteButtonIds?: string[]     // 一键记事弹窗显示的按钮ID（空或undefined=显示全部）
  // 一键记事弹窗输入法自动弹出开关
  quickNoteAutoFocusButton?: boolean    // 按钮触发时自动弹出输入法
  quickNoteAutoFocusFirstPopup?: boolean // 自动触发首次弹出时弹出输入法
  quickNoteAutoFocusRestore?: boolean   // 切后台前有输入法则切回后恢复
  // 工具栏样式配置
  toolbarStyle?: 'default' | 'divider'  // 工具栏样式：默认或带分割线
}

/**
 * 手机端设置上下文接口
 * 用于依赖注入，将插件实例的方法和数据传递给设置创建函数
 */
export interface MobileSettingsContext {
  buttonConfigs: ButtonConfig[]
  mobileButtonConfigs: ButtonConfig[]
  mobileGlobalButtonConfig: GlobalButtonConfig
  mobileFeatureConfig: MobileFeatureConfig
  mobileConfig: MobileToolbarConfig
  desktopFeatureConfig: MobileFeatureConfig
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void
  showButtonIdPicker: (currentValue: string, onSelect: (result: any) => void) => void
  saveData: (key: string, value: any) => Promise<void>
  applyFeatures: () => void
  applyMobileToolbarStyle: () => void
  updateMobileToolbar: () => void
  recalculateOverflow: () => void
}

/**
 * 创建手机端全局按钮配置项（单个）
 * @param title - 设置项标题
 * @param description - 设置项描述
 * @param config - 当前全局按钮配置
 * @param onUpdate - 配置更新回调
 * @returns 设置项创建函数
 */
export function createMobileGlobalConfigItem(
  title: string,
  description: string,
  config: GlobalButtonConfig,
  onUpdate: (newConfig: GlobalButtonConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title,
    description,
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = config.iconSize.toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = () => {
        const newValue = parseInt(input.value) || 16
        onUpdate({ ...config, iconSize: newValue })
      }
      return input
    }
  }
}

/**
 * 创建手机端工具栏配置项
 * @param title - 设置项标题
 * @param description - 设置项描述
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createMobileToolbarConfigItem(
  title: string,
  description: string,
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title,
    description,
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'text'
      input.value = config.toolbarHeight
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = () => {
        onSave({ ...config, toolbarHeight: input.value })
      }
      return input
    }
  }
}

/**
 * 创建手机端工具栏背景颜色配置项
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createMobileToolbarColorConfigItem(
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title: '②工具栏背景颜色',
    description: '💡点击色块选择颜色，或直接输入颜色值，或跟随主题',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

      // 明亮模式颜色行
      const lightRow = document.createElement('div')
      lightRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const lightLabel = document.createElement('span')
      lightLabel.textContent = '☀️ 明亮模式：'
      lightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 明亮模式颜色选择器
      const lightColorPicker = document.createElement('input')
      lightColorPicker.type = 'color'
      lightColorPicker.value = config.toolbarBackgroundColor || '#f8f9fa'
      lightColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 明亮模式文本输入框
      const lightTextInput = document.createElement('input')
      lightTextInput.className = 'b3-text-field'
      lightTextInput.type = 'text'
      lightTextInput.value = config.toolbarBackgroundColor || '#f8f9fa'
      lightTextInput.placeholder = '#f8f9fa'
      lightTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      lightColorPicker.onchange = () => {
        onSave({ ...config, toolbarBackgroundColor: lightColorPicker.value })
        lightTextInput.value = lightColorPicker.value
      }

      lightTextInput.onchange = () => {
        const colorValue = lightTextInput.value.trim()
        if (colorValue) {
          onSave({ ...config, toolbarBackgroundColor: colorValue })
          lightColorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
        }
      }

      lightRow.appendChild(lightLabel)
      lightRow.appendChild(lightColorPicker)
      lightRow.appendChild(lightTextInput)

      // 黑暗模式颜色行
      const darkRow = document.createElement('div')
      darkRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const darkLabel = document.createElement('span')
      darkLabel.textContent = '🌙 黑暗模式：'
      darkLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 黑暗模式颜色选择器
      const darkColorPicker = document.createElement('input')
      darkColorPicker.type = 'color'
      darkColorPicker.value = config.toolbarBackgroundColorDark || '#1e1e1e'
      darkColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 黑暗模式文本输入框
      const darkTextInput = document.createElement('input')
      darkTextInput.className = 'b3-text-field'
      darkTextInput.type = 'text'
      darkTextInput.value = config.toolbarBackgroundColorDark || '#1e1e1e'
      darkTextInput.placeholder = '#1e1e1e'
      darkTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      darkColorPicker.onchange = () => {
        onSave({ ...config, toolbarBackgroundColorDark: darkColorPicker.value })
        darkTextInput.value = darkColorPicker.value
      }

      darkTextInput.onchange = () => {
        const colorValue = darkTextInput.value.trim()
        if (colorValue) {
          onSave({ ...config, toolbarBackgroundColorDark: colorValue })
          darkColorPicker.value = colorValue.startsWith('#') ? colorValue : '#1e1e1e'
        }
      }

      darkRow.appendChild(darkLabel)
      darkRow.appendChild(darkColorPicker)
      darkRow.appendChild(darkTextInput)

      // 跟随主题选项
      const followThemeRow = document.createElement('div')
      followThemeRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;'

      const followThemeCheckbox = document.createElement('input')
      followThemeCheckbox.type = 'checkbox'
      followThemeCheckbox.className = 'b3-switch'
      followThemeCheckbox.checked = !config.toolbarBackgroundColor && !config.toolbarBackgroundColorDark
      followThemeCheckbox.style.cssText = 'transform: scale(1.2);'
      followThemeCheckbox.onchange = () => {
        if (followThemeCheckbox.checked) {
          onSave({
            ...config,
            toolbarBackgroundColor: undefined,
            toolbarBackgroundColorDark: undefined
          })
          lightTextInput.value = ''
          darkTextInput.value = ''
        }
      }

      const followThemeLabel = document.createElement('label')
      followThemeLabel.textContent = '跟随主题（默认）'
      followThemeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      followThemeRow.appendChild(followThemeCheckbox)
      followThemeRow.appendChild(followThemeLabel)

      container.appendChild(lightRow)
      container.appendChild(darkRow)
      container.appendChild(followThemeRow)

      return container
    }
  }
}

/**
 * 创建底部工具栏配置项
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createBottomToolbarConfigItem(
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title: '📱 底部工具栏配置',
    description: '💡 开启后才能调整输入法位置相关设置',
    createActionElement: () => {
      const container = document.createElement('div')
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'mobile'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100% !important; max-width: 100% !important;'

      // 是否将工具栏置底
      const toggleRow = document.createElement('div')
      toggleRow.style.cssText = `
        width:100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: var(--b3-theme-surface);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
      `

      const toggleLabel = document.createElement('span')
      toggleLabel.textContent = '是否将工具栏置底'
      toggleLabel.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-surface); font-weight: 500;'

      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = config.enableBottomToolbar
      toggle.onchange = () => {
        onSave({ ...config, enableBottomToolbar: toggle.checked })
      }

      toggleRow.appendChild(toggleLabel)
      toggleRow.appendChild(toggle)
      container.appendChild(toggleRow)

      return container
    }
  }
}

/**
 * 创建手机端设置布局
 * 这是手机端设置界面创建的主入口函数
 * @param setting - SiYuan Setting 对象
 * @param context - 手机端设置上下文（依赖注入）
 */
export function createMobileSettingLayout(
  setting: Setting,
  context: MobileSettingsContext
): void {
	  // === v3.7 适配：手机端设置面板 ===
	  // 默认所有设置项改为纵向堆叠（标题上、内容下铺满居中），解决手机端整体偏左。
	  // 两项例外保持横向一行：① 裸开关（input.b3-switch）② 标记了 whale-row-layout 的项。
	  if (!document.getElementById('toolbar-customizer-mobile-center')) {
	    const style = document.createElement('style')
	    style.id = 'toolbar-customizer-mobile-center'
	    style.textContent = `
	      [data-plugin-dialog="toolbar-customizer"] .b3-dialog__container {
	        max-width: 100% !important;
	      }
      /* 默认全部纵向堆叠（裸 input 除外，如 b3-switch 保持原生外观） */
      [data-plugin-dialog="toolbar-customizer"] .config-item {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      [data-plugin-dialog="toolbar-customizer"] .config-item > .fn__flex-1 {
        width: 100% !important;
        flex: none !important;
      }
      [data-plugin-dialog="toolbar-customizer"] .config-item > .fn__space {
        display: none !important;
      }
      [data-plugin-dialog="toolbar-customizer"] .config-item > .fn__flex-center:not(input),
      [data-plugin-dialog="toolbar-customizer"] .config-item > .fn__flex-center.fn__size200:not(input) {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        justify-content: flex-start !important;
        align-items: stretch !important;
        margin-top: 8px;
      }
      /* 例外①：裸开关保持横向一行（不覆写宽度，让 b3-switch 原生样式生效） */
      [data-plugin-dialog="toolbar-customizer"] .config-item:has(> input.b3-switch) {
        flex-direction: row !important;
        align-items: center !important;
      }
      [data-plugin-dialog="toolbar-customizer"] .config-item:has(> input.b3-switch) > .fn__space {
        display: block !important;
        flex: none !important;
        width: 12px !important;
        min-width: 12px !important;
      }
	      /* 例外②：标记项保持横向一行 */
	      [data-plugin-dialog="toolbar-customizer"] .config-item:has(.whale-row-layout) {
	        flex-direction: row !important;
	        align-items: center !important;
	      }
	      [data-plugin-dialog="toolbar-customizer"] .config-item:has(.whale-row-layout) > .fn__space {
	        display: block !important;
	      }
	      [data-plugin-dialog="toolbar-customizer"] .config-item:has(.whale-row-layout) > .fn__flex-center,
	      [data-plugin-dialog="toolbar-customizer"] .config-item:has(.whale-row-layout) > .fn__flex-center.fn__size200 {
	        width: auto !important;
	        margin-top: 0 !important;
	      }
	    `
	    document.head.appendChild(style)
	  }

  // === 自定义滑杆组件 ===
  const createCustomSlider = (
    labelText: string,
    initialValue: number,
    min: number,
    max: number,
    unit: string,
    onSave: (value: number) => Promise<void>
  ): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'whale-slider-row';
    container.style.cssText = 'display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 0;';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 70px;';

    // 滑杆容器 - 更大以容纳滑块
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      flex: 1;
      height: 20px;
      display: flex;
      align-items: center;
    `;

    // 轨道背景
    const track = document.createElement('div');
    track.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-theme-border);
      border-radius: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    `;

    // 进度条（已填充部分）
    const progress = document.createElement('div');
    const percent = ((initialValue - min) / (max - min)) * 100;
    progress.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: ${percent}%;
      background: linear-gradient(to bottom, var(--b3-theme-primary) 0%, var(--b3-theme-primary) 100%);
      border-radius: 3px 0 0 3px;
    `;

    // 滑块圆圈
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: ${percent}%;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
      border: 2px solid var(--b3-theme-primary);
      border-radius: 50%;
      cursor: grab;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
      touch-action: none;
      z-index: 10;
    `;

    // 值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${initialValue}${unit}`;
    valueDisplay.style.cssText = 'min-width: 50px; text-align: right; font-size: 13px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; font-weight: 500;';

    // 拖动逻辑
    let isDragging = false;
    let sliderRect = null;
    let currentValue = initialValue;

    const updateSlider = (clientX: number) => {
      if (!sliderRect) return;

      const newPercent = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
      const newValue = Math.round(min + newPercent * (max - min));

      thumb.style.left = `${newPercent * 100}%`;
      progress.style.width = `${newPercent * 100}%`;
      valueDisplay.textContent = `${newValue}${unit}`;
      currentValue = newValue;

      return newValue;
    };

	    const handlePointerDown = (e: PointerEvent) => {
	      isDragging = true;
	      sliderRect = sliderContainer.getBoundingClientRect();
	      thumb.style.cursor = 'grabbing';
	      thumb.style.transform = 'translate(-50%, -50%) scale(1.15)';
	      thumb.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)';
	      e.preventDefault();

	      const moveHandler = (e: PointerEvent) => {
	        if (isDragging) {
	          updateSlider(e.clientX);
	        }
	      };

	      const upHandler = async () => {
	        if (isDragging) {
	          isDragging = false;
	          thumb.style.cursor = 'grab';
	          thumb.style.transform = 'translate(-50%, -50%)';
	          thumb.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)';
	          try {
	            await onSave(currentValue);
	          } catch (e) {
	            console.warn('[Slider] onSave failed:', e);
	          }
	        }
	        _activeSliderDrags.delete(upHandler)
	        document.removeEventListener('pointermove', moveHandler);
	        document.removeEventListener('pointerup', upHandler);
	        document.removeEventListener('pointercancel', upHandler);
	      };

	      _activeSliderDrags.add(upHandler)
	      document.addEventListener('pointermove', moveHandler);
	      document.addEventListener('pointerup', upHandler);
	      document.addEventListener('pointercancel', upHandler);
	    };

    thumb.addEventListener('pointerdown', handlePointerDown);

    // 触摸支持
    thumb.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(new PointerEvent('pointerdown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      }));
    });

    // 添加元素到容器
    sliderContainer.appendChild(track);
    sliderContainer.appendChild(progress);
    sliderContainer.appendChild(thumb);
    container.appendChild(label);
    container.appendChild(sliderContainer);
    container.appendChild(valueDisplay);

    return container;
  };



  // === 无标签滑杆创建函数 ===
  const createCustomSliderWithoutLabel = (
    initialValue: number,
    min: number,
    max: number,
    unit: string,
    onSave: (value: number) => Promise<void>
  ): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'whale-slider-row';
    container.style.cssText = 'display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 0;';

    // 滑杆容器 - 更大以容纳滑块
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      flex: 1;
      height: 20px;
      display: flex;
      align-items: center;
    `;

    // 轨道背景
    const track = document.createElement('div');
    track.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-theme-border);
      border-radius: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    `;

    // 进度条（已填充部分）
    const progress = document.createElement('div');
    const percent = ((initialValue - min) / (max - min)) * 100;
    progress.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: ${percent}%;
      background: linear-gradient(to bottom, var(--b3-theme-primary) 0%, var(--b3-theme-primary) 100%);
      border-radius: 3px 0 0 3px;
    `;

    // 滑块圆圈
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: ${percent}%;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
      border: 2px solid var(--b3-theme-primary);
      border-radius: 50%;
      cursor: grab;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
      touch-action: none;
      z-index: 10;
    `;

    // 值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${initialValue}${unit}`;
    valueDisplay.style.cssText = 'min-width: 50px; text-align: right; font-size: 13px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; font-weight: 500;';

    // 拖动逻辑
    let isDragging = false;
    let sliderRect = null;
    let currentValue = initialValue;

    const updateSlider = (clientX: number) => {
      if (!sliderRect) return;

      const newPercent = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
      const newValue = Math.round(min + newPercent * (max - min));

      thumb.style.left = `${newPercent * 100}%`;
      progress.style.width = `${newPercent * 100}%`;
      valueDisplay.textContent = `${newValue}${unit}`;
      currentValue = newValue;

      return newValue;
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      sliderRect = sliderContainer.getBoundingClientRect();
      thumb.style.cursor = 'grabbing';
      thumb.style.transform = 'translate(-50%, -50%) scale(1.15)';
      thumb.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)';
      e.preventDefault();
      // 点击轨道时立即更新一次
      updateSlider(e.clientX);

      const moveHandler = (e: PointerEvent) => {
        if (isDragging) {
          updateSlider(e.clientX);
        }
      };

      const upHandler = async () => {
        if (isDragging) {
          isDragging = false;
          thumb.style.cursor = 'grab';
          thumb.style.transform = 'translate(-50%, -50%)';
          thumb.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)';
          try {
            await onSave(currentValue);
          } catch (e) {
            console.warn('[Slider] onSave failed:', e);
          }
        }
        _activeSliderDrags.delete(upHandler)
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
        document.removeEventListener('pointercancel', upHandler);
      };

      _activeSliderDrags.add(upHandler)
      document.addEventListener('pointermove', moveHandler);
      document.addEventListener('pointerup', upHandler);
      document.addEventListener('pointercancel', upHandler);
    };

    // 允许点/拖拽滑块与轨道任意位置
    thumb.addEventListener('pointerdown', handlePointerDown);
    sliderContainer.addEventListener('pointerdown', handlePointerDown);

    // 触摸支持
    thumb.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(new PointerEvent('pointerdown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      }));
    });

    sliderContainer.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(new PointerEvent('pointerdown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      }));
    });

    // 添加元素到容器
    sliderContainer.appendChild(track);
    sliderContainer.appendChild(progress);
    sliderContainer.appendChild(thumb);
    container.appendChild(sliderContainer);
    container.appendChild(valueDisplay);

    return container;
  };

  // === 分组标题样式 ===
  const createGroupTitle = (icon: string, title: string, id?: string) => {
    setting.addItem({
      title: '',
      description: '',
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.style.cssText = `
          margin: 0 -16px;
          width: calc(100% + 32px);
        `
        const titleEl = document.createElement('div')
        if (id) {
          titleEl.id = id
        }
        titleEl.style.cssText = `
          padding: 16px;
          font-size: 16px;
          font-weight: 700;
          color: #6a1b9a;
          background: #f3e5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 8px;
        `
        titleEl.innerHTML = `<span style="font-size: 20px;">${icon}</span><span style="font-size: 17px;">${title}</span>`
        wrapper.appendChild(titleEl)
        return wrapper
      }
    })
  }

  // === 说明文字样式 ===
  const createNotice = (content: string) => {
    setting.addItem({
      title: '',
      description: '',
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.style.cssText = `
          margin: 0 -16px;
          width: calc(100% + 32px);
        `
        const container = document.createElement('div')
        container.style.cssText = `
          padding: 14px 18px;
          background: #ffebee;
          border: 1px solid #ffcdd2;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          color: var(--b3-theme-on-surface);
          line-height: 1.6;
        `
        container.textContent = content
        wrapper.appendChild(container)
        return wrapper
      }
    })
  }

  // === 自定义按钮 ===
  createGroupTitle('📱','手机端自定义按钮')

  // 说明文字
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `
      const container = document.createElement('div')
      container.style.cssText = `
        padding: 10px 14px;
        background: #ffebee;
        border: 1px solid #ffcdd2;
        border-radius: 6px;
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        line-height: 1.5;
      `
      container.innerHTML = '💡使用说明:<br>①点击+添加新按钮<br>②在按钮内选择6种功能<br>③点击右下角保存到工具栏<br>④按钮列表（长按拖动排序）'
      wrapper.appendChild(container)
      return wrapper
    }
  })

  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'width: 100%; padding: 8px 0;'

      // 按钮计数（动态更新，放在预览框内部下方）
      const countHint = document.createElement('div')
      countHint.style.cssText = 'font-size:12px;color:var(--b3-theme-on-surface-light);margin-bottom:8px;'
      const updateCountHint = () => {
        countHint.textContent = `已配置 ${context.buttonConfigs.length} 个按钮，点击展开编辑`
      }
      updateCountHint()

      // 添加按钮
      const addBtn = document.createElement('button')
      addBtn.className = 'b3-button b3-button--outline'
      addBtn.style.cssText = `
        width: 100%;
        margin-bottom: 12px;
        padding: 10px;
        font-size: 14px;
        border-radius: 6px;
      `
      addBtn.textContent = '+ 添加新按钮'

      const listContainer = document.createElement('div')
      listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

      let lastAddedButtonId: string | null = null

	      const renderList = () => {
	        flushSliderDrags()
	        // 保存 dialog 滚动位置，防止全量重建后跳到顶部
	        const dialogContent = listContainer.closest('.b3-dialog__content') as HTMLElement | null
	        const savedScrollTop = dialogContent?.scrollTop ?? 0

	        listContainer.innerHTML = ''
	        const sortedButtons = [...context.buttonConfigs].sort((a, b) => a.sort - b.sort)

        sortedButtons.forEach((button, index) => {
          const mobileButtonContext: MobileButtonContext = {
            isAuthorToolActivated: context.isAuthorToolActivated,
            showConfirmDialog: context.showConfirmDialog,
            showIconPicker: context.showIconPicker,
            showButtonIdPicker: context.showButtonIdPicker,
            buttonConfigs: context.buttonConfigs,
            mobileButtonConfigs: context.mobileButtonConfigs,
            recalculateOverflow: () => {
              // 获取扩展工具栏按钮的层数配置
              const overflowBtn = context.buttonConfigs.find(btn => btn.id === 'overflow-button-mobile')
              const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0
              // 重新计算溢出层级
              const updatedButtons = calculateButtonOverflow(
                context.buttonConfigs,
                overflowLayers,
                context.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
              )
              // 更新配置中的 overflowLevel
              updatedButtons.forEach(btn => {
                const original = context.buttonConfigs.find(b => b.id === btn.id)
                if (original) {
                  original.overflowLevel = btn.overflowLevel
                }
              })
            },
            saveData: context.saveData,
            updateMobileToolbar: context.updateMobileToolbar,
            mobileConfig: context.mobileConfig
          }
          const item = createMobileButtonItem(button, index, renderList, context.buttonConfigs, mobileButtonContext)
          listContainer.appendChild(item)

          // 只有在是刚添加的按钮时才自动展开
          if (lastAddedButtonId && button.id === lastAddedButtonId) {
            // 使用 setTimeout 确保 DOM 已渲染
            setTimeout(() => {
              const header = item.querySelector('[style*="cursor: pointer"]') as HTMLElement
              if (header) {
                header.click()
                // 滚动到该按钮
                item.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
              // 清除标记
              lastAddedButtonId = null
            }, 100)
          }
	        })
	        // 恢复 dialog 滚动位置（防止新增按钮时的 scrollIntoView 干扰，用 RAF 确保在所有布局变化后执行）
	        if (dialogContent && savedScrollTop > 0) {
	          requestAnimationFrame(() => {
	            dialogContent.scrollTop = savedScrollTop
	          })
	        }
	        // 同步刷新工具栏预览（反映卡片列表里的删除/启用禁用/图标改动）
        previewEl?.refresh()
        updateCountHint()
      }

      addBtn.onclick = () => {
        const newButtonIndex = context.buttonConfigs.length + 1
        const newButton: ButtonConfig = {
          id: `button_${Date.now()}`,
          name: `新按钮${newButtonIndex}`,
          type: 'builtin',
          builtinId: 'menuSearch',
          icon: '♥️',
          iconSize: context.mobileGlobalButtonConfig.iconSize,
          minWidth: context.mobileGlobalButtonConfig.minWidth,
          marginRight: context.mobileGlobalButtonConfig.marginRight,
          sort: newButtonIndex,
          platform: 'both',
          showNotification: context.mobileGlobalButtonConfig.showNotification,
          overflowLevel: 0 // 初始为可见，稍后重新计算
        }
        context.buttonConfigs.push(newButton)

        // 获取扩展工具栏按钮的层数配置
        const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
        const overflowLayers = (overflowBtn?.enabled !== false) ? (overflowBtn.layers || 1) : 0

        // 如果启用了扩展工具栏，重新计算溢出层级
        if (overflowLayers > 0) {
          const updated = calculateButtonOverflow(
            context.buttonConfigs,
            overflowLayers,
            context.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
          )
          // 更新所有按钮的溢出层级
          updated.forEach(btn => {
            const original = context.buttonConfigs.find(b => b.id === btn.id)
            if (original) {
              original.overflowLevel = btn.overflowLevel
            }
          })
        }

        lastAddedButtonId = newButton.id
        renderList()
      }

      // 手机端工具栏所见即所得预览（放在最上方，便于一眼看清布局 + 直接拖动排序）
      let previewEl: any = null
      try {
        previewEl = createToolbarPreview({
          getButtons: () => context.buttonConfigs,
          isMobile: true,
          isTopMode: context.mobileConfig?.enableTopToolbar,
          onChanged: renderList,
        })
      } catch (e) {
        console.error('[MobilePreview] 创建预览失败:', e)
        const errEl = document.createElement('div')
        errEl.style.cssText = 'color:var(--b3-card-error-color);font-size:12px;padding:8px;'
        errEl.textContent = '⚠️ 工具栏预览加载失败，请检查控制台错误'
        container.appendChild(errEl)
      }

      renderList()

      if (previewEl) {
        container.appendChild(previewEl)
        // previewEl 已挂载到 DOM，刷新一次使缩放计算（依赖 clientWidth）生效
        previewEl.refresh()
      }
      container.appendChild(countHint)
      container.appendChild(addBtn)
      container.appendChild(listContainer)
      return container
    }
  })

  // === 手机端全局按钮配置 ===
  createGroupTitle('1️⃣ ','全局按钮配置')

  // 存储所有配置项的 input 元素，用于统一控制禁用状态
  const mobileConfigInputs: HTMLInputElement[] = []

  // 更新配置项禁用状态的函数
  const updateMobileConfigItemsDisabled = (disabled: boolean) => {
    mobileConfigInputs.forEach(input => {
      input.disabled = disabled
      if (disabled) {
        input.style.opacity = '0.5'
        input.style.cursor = 'not-allowed'
      } else {
        input.style.opacity = ''
        input.style.cursor = ''
      }
    })
  }

// 说明文字
  createNotice('📱手机端配置调整，修改后会批量应用到每个按钮配置值，单个按钮的独立配置优先级更高')

  // 全局配置启用开关（放在最前面）
  setting.addItem({
    title: '①启用全局按钮配置',
    description: '💡 关闭后，修改全局配置不会影响已有按钮，仅作为新建按钮的默认值',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileGlobalButtonConfig.enabled ?? true
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileGlobalButtonConfig.enabled = toggle.checked
        // 打开开关时，立即应用全局配置到所有按钮
        if (toggle.checked) {
          context.mobileButtonConfigs.forEach(btn => {
            btn.iconSize = context.mobileGlobalButtonConfig.iconSize
            btn.minWidth = context.mobileGlobalButtonConfig.minWidth
            btn.marginRight = context.mobileGlobalButtonConfig.marginRight
            btn.showNotification = context.mobileGlobalButtonConfig.showNotification
          })
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          // 重新计算溢出层级（按钮宽度可能变化）
          context.recalculateOverflow()
          // 刷新按钮以应用新配置
          context.updateMobileToolbar()
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        Notify.showGlobalConfigEnabledStatus(toggle.checked)
        // 更新配置项的禁用状态
        updateMobileConfigItemsDisabled(!toggle.checked)
      }
      return toggle
    }
  })

  // 图标大小
  setting.addItem({
    title: '②图标大小 (px)',
    description: '💡 所有按钮的图标大小，建议与【按钮宽度】设置相同',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.iconSize || 16;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        8,    // 最小值
        50,   // 最大值，改为50px
        'px',
        async (value) => {
          config.iconSize = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.iconSize = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度可能变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoIconSizeModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 按钮宽度
  setting.addItem({
    title: '③按钮宽度 (px)📏',
    description: '💡 所有按钮的最小宽度，建议与【图标大小】设置相同，效果更好',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.minWidth || 32;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        16,   // 最小值
        50,   // 最大值，改为50px
        'px',
        async (value) => {
          config.minWidth = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.minWidth = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoButtonWidthModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 右边距
  setting.addItem({
    title: '④右边距 (px)➡️',
    description: '💡 所有按钮的右侧边距',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.marginRight || 8;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        20,   // 最大值
        'px',
        async (value) => {
          config.marginRight = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.marginRight = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoMarginRightModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 右上角提示
  setting.addItem({
    title: '⑤右上角提示📢',
    description: '💡 所有按钮是否显示右上角提示',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileGlobalButtonConfig.showNotification
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileGlobalButtonConfig.showNotification = toggle.checked
        // 只有启用全局配置时才批量应用到按钮
        if (context.mobileGlobalButtonConfig.enabled ?? true) {
          context.mobileButtonConfigs.forEach(btn => btn.showNotification = toggle.checked)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        // 刷新按钮以应用新配置
        context.updateMobileToolbar()
        Notify.showNotificationToggleStatus(toggle.checked)
      }
      // 存储引用并设置初始禁用状态
      mobileConfigInputs.push(toggle)
      if (!(context.mobileGlobalButtonConfig.enabled ?? true)) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
        toggle.style.cursor = 'not-allowed'
      }
      return toggle
    }
  })

  // 其他插件按钮预留宽度
  setting.addItem({
    title: '⑥其他插件按钮预留宽度',
    description: '💡 仅影响主工具栏溢出计算：额外预留右侧空间给其他插件按钮（扩展工具栏不受影响）',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig
      const currentValue = config.externalButtonsReserveWidth ?? 0

      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,
        200,
        'px',
        async (value) => {
          config.externalButtonsReserveWidth = value
          await context.saveData('mobileGlobalButtonConfig', config)
          context.recalculateOverflow()
          Notify.showInfoExternalButtonsReserveWidthModified()
        }
      )

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5'
        slider.style.pointerEvents = 'none'
      }

      return slider
    }
  })

  // === 移动端工具栏设置 ===

  // === 全局工具栏配置 ===
  createGroupTitle('2️⃣ ','全局工具栏配置')

  // 说明文字
  createNotice('📱手机端工具栏样式调整，推荐配置：40px高、分割线、跟随主题、100%')

  // 工具栏自身高度
  setting.addItem({
    title: '①工具栏自身高度',
    description: '💡设置工具栏自身的高度',
    createActionElement: () => {
      // 解析当前值，如果当前值不是数字则使用默认值
      const currentValue = parseLengthSliderInt(context.mobileConfig.toolbarHeight, 40)
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          // 必须带 CSS 长度单位；纯数字如 "45" 会导致 height/min-height 声明被浏览器忽略
          context.mobileConfig.toolbarHeight = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );

      return slider;
    }
  })

  // 工具栏样式选择
  setting.addItem({
    title: '②工具栏样式选择',
    description: '💡选择工具栏的显示样式',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const config = context.mobileFeatureConfig as any
      const currentStyle = config.toolbarStyle || 'divider'

      // 默认样式选项
      const defaultOption = document.createElement('div')
      defaultOption.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid ${currentStyle === 'default' ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        border-radius: 6px;
        cursor: pointer;
        background: ${currentStyle === 'default' ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
      `

      const defaultRadio = document.createElement('input')
      defaultRadio.type = 'radio'
      defaultRadio.name = 'toolbar-style'
      defaultRadio.checked = currentStyle === 'default'
      defaultRadio.style.cssText = 'cursor: pointer;'

      const defaultLabel = document.createElement('span')
      defaultLabel.textContent = '默认样式'
      defaultLabel.style.cssText = 'font-size: 13px; flex: 1;'

      defaultOption.appendChild(defaultRadio)
      defaultOption.appendChild(defaultLabel)

      // 分割线样式选项
      const dividerOption = document.createElement('div')
      dividerOption.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid ${currentStyle === 'divider' ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        border-radius: 6px;
        cursor: pointer;
        background: ${currentStyle === 'divider' ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
      `

      const dividerRadio = document.createElement('input')
      dividerRadio.type = 'radio'
      dividerRadio.name = 'toolbar-style'
      dividerRadio.checked = currentStyle === 'divider'
      dividerRadio.style.cssText = 'cursor: pointer;'

      const dividerLabel = document.createElement('span')
      dividerLabel.textContent = '加分割线'
      dividerLabel.style.cssText = 'font-size: 13px; flex: 1;'

      dividerOption.appendChild(dividerRadio)
      dividerOption.appendChild(dividerLabel)

      // 更新选中样式
      const updateSelection = () => {
        defaultOption.style.borderColor = defaultRadio.checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
        defaultOption.style.background = defaultRadio.checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
        dividerOption.style.borderColor = dividerRadio.checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
        dividerOption.style.background = dividerRadio.checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
      }

      // 点击事件
      defaultOption.onclick = async () => {
        defaultRadio.checked = true
        config.toolbarStyle = 'default'
        updateSelection()
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'default' }))
      }

      dividerOption.onclick = async () => {
        dividerRadio.checked = true
        config.toolbarStyle = 'divider'
        updateSelection()
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'divider' }))
      }

      container.appendChild(defaultOption)
      container.appendChild(dividerOption)

      return container
    }
  })

  // 工具栏背景颜色（明亮模式 + 黑暗模式）
  setting.addItem({
    title: '③工具栏背景颜色',
    description: '💡点击色块选择颜色，或直接输入颜色值，或跟随主题',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

      // 明亮模式颜色行
      const lightRow = document.createElement('div')
      lightRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const lightLabel = document.createElement('span')
      lightLabel.textContent = '☀️ 明亮模式：'
      lightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 明亮模式颜色选择器
      const lightColorPicker = document.createElement('input')
      lightColorPicker.type = 'color'
      lightColorPicker.value = context.mobileConfig.toolbarBackgroundColor || '#f8f9fa'
      lightColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 明亮模式文本输入框
      const lightTextInput = document.createElement('input')
      lightTextInput.className = 'b3-text-field'
      lightTextInput.type = 'text'
      lightTextInput.value = context.mobileConfig.toolbarBackgroundColor || '#f8f9fa'
      lightTextInput.placeholder = '#f8f9fa'
      lightTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      lightColorPicker.onchange = async () => {
        context.mobileConfig.toolbarBackgroundColor = lightColorPicker.value
        lightTextInput.value = lightColorPicker.value
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      lightTextInput.onchange = async () => {
        const colorValue = lightTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColor = colorValue
          lightColorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
          await context.saveData('mobileToolbarConfig', context.mobileConfig)
          context.applyMobileToolbarStyle()
        }
      }

      lightRow.appendChild(lightLabel)
      lightRow.appendChild(lightColorPicker)
      lightRow.appendChild(lightTextInput)

      // 黑暗模式颜色行
      const darkRow = document.createElement('div')
      darkRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const darkLabel = document.createElement('span')
      darkLabel.textContent = '🌙 黑暗模式：'
      darkLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 黑暗模式颜色选择器
      const darkColorPicker = document.createElement('input')
      darkColorPicker.type = 'color'
      darkColorPicker.value = context.mobileConfig.toolbarBackgroundColorDark || '#1a1a1a'
      darkColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 黑暗模式文本输入框
      const darkTextInput = document.createElement('input')
      darkTextInput.className = 'b3-text-field'
      darkTextInput.type = 'text'
      darkTextInput.value = context.mobileConfig.toolbarBackgroundColorDark || '#1a1a1a'
      darkTextInput.placeholder = '#1a1a1a'
      darkTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      darkColorPicker.onchange = async () => {
        context.mobileConfig.toolbarBackgroundColorDark = darkColorPicker.value
        darkTextInput.value = darkColorPicker.value
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      darkTextInput.onchange = async () => {
        const colorValue = darkTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColorDark = colorValue
          darkColorPicker.value = colorValue.startsWith('#') ? colorValue : '#1a1a1a'
          await context.saveData('mobileToolbarConfig', context.mobileConfig)
          context.applyMobileToolbarStyle()
        }
      }

      darkRow.appendChild(darkLabel)
      darkRow.appendChild(darkColorPicker)
      darkRow.appendChild(darkTextInput)

      // 跟随主题开关行
      const themeRow = document.createElement('div')
      themeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      // 跟随主题颜色开关
      const themeCheckbox = document.createElement('input')
      themeCheckbox.type = 'checkbox'
      themeCheckbox.className = 'b3-switch'
      themeCheckbox.checked = context.mobileConfig.useThemeColor || false
      themeCheckbox.style.cssText = 'transform: scale(0.8);'

      // 主题色标签
      const themeLabel = document.createElement('span')
      themeLabel.textContent = '🎨 跟随主题颜色（自动适应明暗模式）'
      themeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      // 更新禁用状态
      const updateDisabledState = () => {
        const isTheme = themeCheckbox.checked
        lightColorPicker.disabled = isTheme
        lightTextInput.disabled = isTheme
        darkColorPicker.disabled = isTheme
        darkTextInput.disabled = isTheme
        lightColorPicker.style.opacity = isTheme ? '0.4' : ''
        lightTextInput.style.opacity = isTheme ? '0.4' : ''
        darkColorPicker.style.opacity = isTheme ? '0.4' : ''
        darkTextInput.style.opacity = isTheme ? '0.4' : ''
      }

      // 初始化禁用状态
      updateDisabledState()

      // 主题色开关变化
      themeCheckbox.onchange = async () => {
        context.mobileConfig.useThemeColor = themeCheckbox.checked
        updateDisabledState()
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      themeRow.appendChild(themeCheckbox)
      themeRow.appendChild(themeLabel)

      container.appendChild(lightRow)
      container.appendChild(darkRow)
      container.appendChild(themeRow)

      return container
    }
  })

  // 工具栏透明度
  setting.addItem({
    title: '④工具栏透明度',
    description: '💡(0=完全透明，100=完全不透明)',
    createActionElement: () => {
      const currentValue = Math.round((context.mobileConfig.toolbarOpacity ?? 1) * 100);
      return createCustomSlider(
        '透明度：',
        currentValue,
        0,
        100,
        '%',
        async (value) => {
          context.mobileConfig.toolbarOpacity = value / 100;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
    }
  })

  // 工具栏层级（共享配置）
  setting.addItem({
    title: '⑤工具栏层级',
    description: '💡值越大，越不容易被遮挡。默认5，显示在设置上层为512（顶部和底部通用）',
    createActionElement: () => {
      const currentValue = context.mobileConfig.toolbarZIndex ?? 5;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        512,  // 最大值，按要求设置为512
        '',   // 层级不需要单位
        async (value) => {
          context.mobileConfig.toolbarZIndex = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );

      return slider;
    }
  })

  // === 工具栏位置配置（整合顶部和底部配置） ===
  createGroupTitle('3️⃣ ','工具栏位置配置')

  // 说明文字
  createNotice('📍选择📱工具栏显示位置，下方会显示对应的配置选项；默认配置已经调好，若修改，请认真阅读和理解')

  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; gap: 24px; align-items: center; justify-content: center;'

      const options = [
        { value: 'top', label: '顶部固定' },
        { value: 'bottom', label: '底部固定' },
        { value: 'floating', label: '底部胶囊' }
      ]

      // 确定当前选中的值
      const getCurrentValue = () => {
        if (context.mobileConfig.enableTopToolbar) return 'top'
        if (context.mobileConfig.enableBottomToolbar) return 'bottom'
        return 'floating'  // 默认底部胶囊
      }

      options.forEach(option => {
        const label = document.createElement('label')
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 16px; font-weight: 600;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'toolbar-position'
        radio.value = option.value
        radio.checked = getCurrentValue() === option.value
        radio.style.cssText = 'cursor: pointer;'

        radio.onchange = async () => {
          // 更新配置（互斥，只启用一个）
          context.mobileConfig.enableTopToolbar = option.value === 'top'
          context.mobileConfig.enableBottomToolbar = option.value === 'bottom'
          context.mobileConfig.enableFloatingToolbar = option.value === 'floating'

          await context.saveData('mobileToolbarConfig', context.mobileConfig)

          // 动态更新底部/顶部/悬浮专用设置的禁用状态
          const isBottom = option.value === 'bottom'
          const isTop = option.value === 'top'
          const isFloating = option.value === 'floating'

          document.querySelectorAll('.bottom-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !isBottom
            ;(el as HTMLInputElement).style.opacity = isBottom ? '' : '0.5'
          })

          document.querySelectorAll('.top-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !isTop
            ;(el as HTMLInputElement).style.opacity = isTop ? '' : '0.5'
          })

          document.querySelectorAll('.floating-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !isFloating
            ;(el as HTMLInputElement).style.opacity = isFloating ? '' : '0.5'
          })

          // 动态显示/隐藏整个配置分区
          document.querySelectorAll('.top-toolbar-section').forEach(el => {
            const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
            if (parent) {
              parent.style.display = isTop ? '' : 'none'
            }
          })

          document.querySelectorAll('.bottom-toolbar-section').forEach(el => {
            const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
            if (parent) {
              parent.style.display = isBottom ? '' : 'none'
            }
          })

          document.querySelectorAll('.floating-toolbar-section').forEach(el => {
            const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
            if (parent) {
              parent.style.display = isFloating ? '' : 'none'
            }
          })

          // 同时显示/隐藏分区下的所有配置项
          const updateSectionVisibility = (className: string, show: boolean) => {
            document.querySelectorAll(className).forEach(el => {
              const input = el as HTMLInputElement
              const item = input.closest('.b3-dialog__content .config-item') as HTMLElement
              if (item) {
                item.style.display = show ? '' : 'none'
              }
            })
          }

          updateSectionVisibility('.top-toolbar-setting', isTop)
          updateSectionVisibility('.bottom-toolbar-setting', isBottom)
          updateSectionVisibility('.floating-toolbar-setting', isFloating)

          // 重新初始化工具栏
          context.updateMobileToolbar()
        }

	        const text = document.createElement('span')
	        text.textContent = option.label
	        text.style.whiteSpace = 'nowrap'  // 避免文字在中间断开换行

        label.appendChild(radio)
        label.appendChild(text)
        container.appendChild(label)
      })

      // 初始化时根据当前配置设置显示状态（使用setTimeout确保DOM已渲染）
      setTimeout(() => {
        const isTop = context.mobileConfig.enableTopToolbar
        const isBottom = context.mobileConfig.enableBottomToolbar
        const isFloating = !!context.mobileConfig.enableFloatingToolbar

        document.querySelectorAll('.top-toolbar-section').forEach(el => {
          const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
          if (parent) {
            parent.style.display = isTop ? '' : 'none'
          }
        })

        document.querySelectorAll('.bottom-toolbar-section').forEach(el => {
          const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
          if (parent) {
            parent.style.display = isBottom ? '' : 'none'
          }
        })

        document.querySelectorAll('.floating-toolbar-section').forEach(el => {
          const parent = el.closest('.b3-dialog__content .config-item') as HTMLElement
          if (parent) {
            parent.style.display = isFloating ? '' : 'none'
          }
        })

        const updateSectionVisibility = (className: string, show: boolean) => {
          document.querySelectorAll(className).forEach(el => {
            const input = el as HTMLInputElement
            const item = input.closest('.b3-dialog__content .config-item') as HTMLElement
            if (item) {
              item.style.display = show ? '' : 'none'
            }
          })
        }

        updateSectionVisibility('.top-toolbar-setting', isTop)
        updateSectionVisibility('.bottom-toolbar-setting', isBottom)
        updateSectionVisibility('.floating-toolbar-setting', isFloating)
      }, 100)

      wrapper.appendChild(container)
      return wrapper
    }
  })

  // === 顶部工具栏专用配置（作为子分区） ===
  // 子分区标题项，使用思源原生的 config-item 结构
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const div = document.createElement('div')
      div.className = 'top-toolbar-section'
      div.innerHTML = '<span style="font-size: 14px; font-weight: 600; color: #3b82f6; display: flex; align-items: center; gap: 6px;"><span>⬆️</span><span>顶部工具栏配置</span></span>'
      return div
    }
  })

  setting.addItem({
    title: '①距离顶部高度',
    description: '💡顶部工具栏距离屏幕顶部的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.topToolbarOffset ?? '50px';
      const currentValue = parseLengthSliderInt(currentValueStr, 50);
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.topToolbarOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '②扩展工具栏距离顶部工具栏',
    description: '💡扩展工具栏第1层距离顶部主工具栏的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarDistanceTop ?? '8px';
      const currentValue = parseLengthSliderInt(currentValueStr, 8);
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        50,   // 最大值，按要求设置为50px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarDistanceTop = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '③扩展工具栏自身高度',
    description: '💡顶部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarHeightTop ?? '40px';
      const currentValue = parseLengthSliderInt(currentValueStr, 40);
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarHeightTop = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '④重试加载机制',
    description: '💡防止加载失效，延迟后重试（0=无重试）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValue = context.mobileConfig.topToolbarRetryDelay ?? 0;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,      // 最小值
        5000,   // 最大值 5000ms
        'ms',   // 单位
        async (value) => {
          context.mobileConfig.topToolbarRetryDelay = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 重新初始化工具栏以应用新配置
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // === 底部工具栏专用配置（作为子分区） ===
  // 子分区标题项，使用思源原生的 config-item 结构
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const div = document.createElement('div')
      div.className = 'bottom-toolbar-section'
      div.innerHTML = '<span style="font-size: 14px; font-weight: 600; color: #22c55e; display: flex; align-items: center; gap: 6px;"><span>⬇️</span><span>底部工具栏配置</span></span>'
      return div
    }
  })

  setting.addItem({
    title: '①输入法关闭时底部高度',
    description: '💡输入法关闭时，工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.closeInputOffset ?? '0';
      const currentValue = parseInt(currentValueStr) || 0;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        20,   // 最大值，按要求设置为 20px
        'px',
        async (value) => {
          context.mobileConfig.closeInputOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 重新初始化工具栏以应用新配置
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })


  setting.addItem({
    title: '②输入法打开时底部高度',
    description: '💡输入法弹出时，底部工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.openInputOffset ?? '0';
      const currentValue = parseInt(currentValueStr) || 0;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为 100px
        'px',
        async (value) => {
          context.mobileConfig.openInputOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 重新初始化工具栏以应用新配置
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '③输入法灵敏度检查',
    description: '💡不建议修改：窗口高度变化超过此百分比触发：30-90（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValue = context.mobileConfig.heightThreshold ?? 70;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100
        '',   // 无单位
        async (value) => {
          context.mobileConfig.heightThreshold = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 需要重新初始化工具栏检测器以应用新阈值
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '④扩展工具栏距离底部工具栏',
    description: '💡扩展工具栏第 1 层距离底部主工具栏的距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarDistanceBottom ?? '8px';
      const currentValue = parseLengthSliderInt(currentValueStr, 8);
        
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        50,   // 最大值 50px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarDistanceBottom = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
        
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');
  
      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
  
      return slider;
    }
  })
  
  setting.addItem({
    title: '⑤扩展工具栏自身高度',
    description: '💡底部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarHeightBottom ?? '40px';
      const currentValue = parseLengthSliderInt(currentValueStr, 40);
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarHeightBottom = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '⑥重试加载机制',
    description: '💡防止加载失效，延迟后重试（0=无重试）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValue = context.mobileConfig.bottomToolbarRetryDelay ?? 2000;
        
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,      // 最小值
        5000,   // 最大值 5000ms
        'ms',   // 单位
        async (value) => {
          context.mobileConfig.bottomToolbarRetryDelay = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 重新初始化工具栏以应用新配置
          context.updateMobileToolbar();
        }
      );
        
      // 为滑杆添加底部工具栏设置类名
      slider.classList.add('bottom-toolbar-setting');
  
      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
  
      return slider;
    }
  })

  // === 底部胶囊配置 ===
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const div = document.createElement('div')
      div.className = 'floating-toolbar-section'
      div.innerHTML = '<span style="font-size: 14px; font-weight: 600; color: #a855f7; display: flex; align-items: center; gap: 6px;"><span>💊</span><span>底部胶囊配置</span></span>'
      return div
    }
  })

  setting.addItem({
    title: '①胶囊距底部距离',
    description: '💡胶囊工具栏距离屏幕底部的间距',
    createActionElement: () => {
      const currentValueStr = context.mobileConfig.floatingToolbarMargin ?? '50px';
      const currentValue = parseLengthSliderInt(currentValueStr, 50);
      const slider = createCustomSliderWithoutLabel(
        currentValue,
	        0, 80, 'px',
        async (value) => {
          context.mobileConfig.floatingToolbarMargin = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      slider.classList.add('floating-toolbar-setting');
      if (!context.mobileConfig.enableFloatingToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
      return slider;
    }
  })

  setting.addItem({
    title: '②胶囊自身高度',
    description: '💡胶囊工具栏自身的高度',
    createActionElement: () => {
      const currentValueStr = context.mobileConfig.floatingToolbarHeight ?? '40px';
      const currentValue = parseLengthSliderInt(currentValueStr, 40);
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        24, 60, 'px',
        async (value) => {
          context.mobileConfig.floatingToolbarHeight = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      slider.classList.add('floating-toolbar-setting');
      if (!context.mobileConfig.enableFloatingToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
      return slider;
    }
  })

  setting.addItem({
    title: '③胶囊圆角大小',
    description: '💡胶囊工具栏的圆角弧度，值越大越圆',
    createActionElement: () => {
      const currentValueStr = context.mobileConfig.floatingToolbarBorderRadius ?? '24px';
      const currentValue = parseLengthSliderInt(currentValueStr, 24);
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0, 40, 'px',
        async (value) => {
          context.mobileConfig.floatingToolbarBorderRadius = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      slider.classList.add('floating-toolbar-setting');
      if (!context.mobileConfig.enableFloatingToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
      return slider;
    }
  })

  setting.addItem({
    title: '④胶囊自身宽度',
    description: '💡胶囊工具栏自身的固定宽度（0=自动适应按钮宽度）',
    createActionElement: () => {
      const currentValueStr = context.mobileConfig.floatingToolbarWidth ?? '280';
      const currentValue = parseLengthSliderInt(currentValueStr, 0);
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0, 500, 'px',
        async (value) => {
          context.mobileConfig.floatingToolbarWidth = value + '';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      slider.classList.add('floating-toolbar-setting');
      if (!context.mobileConfig.enableFloatingToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
      return slider;
    }
  })

  setting.addItem({
    title: '⑤胶囊扩展栏间距',
    description: '💡扩展工具栏与胶囊之间的间距',
    createActionElement: () => {
      const currentValueStr = context.mobileConfig.floatingToolbarOverflowDistance ?? '8';
      const currentValue = parseLengthSliderInt(currentValueStr, 8);
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0, 30, 'px',
        async (value) => {
          context.mobileConfig.floatingToolbarOverflowDistance = value + '';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.updateMobileToolbar();
        }
      );
      slider.classList.add('floating-toolbar-setting');
      if (!context.mobileConfig.enableFloatingToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }
      return slider;
    }
  })

  setting.addItem({
    title: '⑥滚动隐藏',
    description: '💡开启后向下滚动时胶囊自动隐藏，向上滚动时重新显示',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileConfig.floatingToolbarScrollHide !== false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileConfig.floatingToolbarScrollHide = toggle.checked
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.updateMobileToolbar()
      }
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'display:flex;align-items:center;gap:12px;'
      wrapper.appendChild(toggle)

      const toggleWrapper = document.createElement('div')
      toggleWrapper.style.cssText = 'display:flex;align-items:center;gap:8px;'
      toggleWrapper.classList.add('floating-toolbar-setting')
      toggleWrapper.appendChild(wrapper)
      if (!context.mobileConfig.enableFloatingToolbar) {
        toggleWrapper.style.opacity = '0.5';
        toggleWrapper.style.pointerEvents = 'none';
      }
      return toggleWrapper;
    }
  })

  setting.addItem({
    title: '⑦胶囊样式',
    description: '💡普通模式为当前样式，毛玻璃模式为半透明磨砂效果',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'display: flex; gap: 12px; align-items: center;'
      wrapper.classList.add('floating-toolbar-setting')

	      const styles = [
        { value: 'normal', label: '普通模式' },
        { value: 'glass', label: '毛玻璃' },
      ]

	      styles.forEach(s => {
	        const btn = document.createElement('button')
	        btn.textContent = s.label
	        btn.dataset.value = s.value
	        const refreshBtn = () => {
	          const active = context.mobileConfig.floatingToolbarStyle === s.value
	          btn.style.cssText = `
	            padding: 6px 16px; border-radius: 8px; cursor: pointer;
	            font-size: 14px; font-weight: 500;
	            border: 1px solid var(--b3-border-color);
	            background: ${active ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'};
	            color: ${active ? '#fff' : 'var(--b3-theme-on-surface)'};
	            transition: all 0.15s ease;
	          `
	        }
	        refreshBtn()
	        btn.onclick = async () => {
	          context.mobileConfig.floatingToolbarStyle = s.value
	          await context.saveData('mobileToolbarConfig', context.mobileConfig)
	          // 立即更新所有按钮的高亮状态，再刷新工具栏
	          wrapper.querySelectorAll('button').forEach(b => {
	            const isActive = b.dataset.value === context.mobileConfig.floatingToolbarStyle
	            b.style.background = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'
	            b.style.color = isActive ? '#fff' : 'var(--b3-theme-on-surface)'
	          })
	          context.updateMobileToolbar()
	        }
	        wrapper.appendChild(btn)
	      })

      if (!context.mobileConfig.enableFloatingToolbar) {
        wrapper.style.opacity = '0.5';
        wrapper.style.pointerEvents = 'none';
      }
      return wrapper;
    }
  })

  // === 一键记事弹窗 ===
  createGroupTitle('4️⃣ ','一键记事弹窗', 'quick-note-settings-section')
  
  // 总引导说明
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = `
        padding: 16px;
        background: #ffebee;
        border: 1px solid #ffcdd2;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: #b71c1c;
      `;
      
      container.textContent = '📝 请先选择触发方式，再配置笔记本或文档 ID，选择插入位置，进行弹窗细化设置。';
      wrapper.appendChild(container);
      return wrapper;
    }
  });

  // ===触发：后台切前台 ===
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';
  
      // 获取当前配置值，设置默认值
      const config = context.mobileFeatureConfig as any
      const currentPopupConfig = config.popupConfig || 'bothModes'
  
      // 创建选项按钮
      
      // 添加触发方式说明
      const triggerInfo = document.createElement('div');
      triggerInfo.style.cssText = 'padding: 12px; background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 6px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;';
      triggerInfo.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: #1976d2;">💡触发方式说明：</div>
        <div style="margin-bottom: 6px;">📱 方式一：按钮触发，请到顶部添加新按钮，选择功能④一键记事弹窗【简单】⏫</div>
        <div>📱 方式二：自动触发：后台切前台⬇️</div>
      `;
      container.appendChild(triggerInfo);
      
      const options = [
        { type: 'description', content: '请设置方式二：自动触发记事功能的条件' },
        { value: 'disabled', label: '①关闭自启动', description: '完全关闭自启动记事功能' },
        { value: 'smallWindowOnly', label: '②只在小窗模式下启用自启动', description: '仅当检测到小窗模式时自动触发记事' },
        { value: 'bothModes', label: '③小窗和全屏模式都启用自启动', description: '无论全屏还是小窗模式都自动触发记事' }
      ]
  
      options.forEach(option => {
        //处理描述项
        if (option.type === 'description') {
          const descContainer = document.createElement('div');
          descContainer.style.cssText = 'padding: 8px 12px; background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 4px; margin-bottom: 8px; font-size: 13px; color: #e65100;';
          descContainer.textContent = option.content;
          container.appendChild(descContainer);
          return;
        }
        
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'
  
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'popupConfig'
        radio.value = option.value
        radio.checked = currentPopupConfig === option.value
        radio.style.cssText = 'transform: scale(1.3);'
  
        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'
  
        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'
  
        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
  
        labelContainer.appendChild(label)
        labelContainer.appendChild(desc)
  
        optionContainer.appendChild(radio)
        optionContainer.appendChild(labelContainer)
  
        // 添加选中状态样式
        if (radio.checked) {
          optionContainer.style.cssText += ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
        }
  
        //点击事件处理
        optionContainer.onclick = async () => {
          // 更新所有选项的选中状态
          container.querySelectorAll('input[type="radio"]').forEach(r => {
            const radioInput = r as HTMLInputElement;
            const container = r.closest('div[style*="cursor: pointer"]') as HTMLElement
            if (r === radio) {
              radioInput.checked = true
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '') + ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
              }
            } else {
              radioInput.checked = false
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '')
              }
            }
          })

          // 保存配置
          config.popupConfig = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }
  
        container.appendChild(optionContainer)
      })

      // === 输入法自动弹出（合并到同一框内）===
      const divider = document.createElement('div');
      divider.style.cssText = 'height: 1px; background: var(--b3-border-color); margin: 16px 0;';
      container.appendChild(divider);

      const imTitle = document.createElement('div');
      imTitle.style.cssText = 'font-size: 14px; font-weight: 600; margin-bottom: 12px;';
      imTitle.textContent = '⌨️ 输入法自动弹出';
      container.appendChild(imTitle);

      const imItems = [
        {
          key: 'quickNoteAutoFocusButton',
          label: '按钮触发时',
          desc: '点击工具栏按钮打开弹窗后，自动聚焦并弹出键盘',
        },
        {
          key: 'quickNoteAutoFocusFirstPopup',
          label: '自启动弹出时',
          desc: '切后台自动触发弹窗后，切回思源时自动聚焦并弹出键盘',
        },
        {
          key: 'quickNoteAutoFocusRestore',
          label: '中途切后台再切回来时',
          desc: '打字中途切后台再切回来，自动恢复键盘',
        },
      ];

      imItems.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 0;';

        if (item !== imItems[0]) {
          row.style.borderTop = '1px solid var(--b3-border-color)';
          row.style.marginTop = '4px';
        }

        const labelContainer = document.createElement('div');
        labelContainer.style.cssText = 'flex: 1; margin-right: 12px;';

        const labelText = document.createElement('div');
        labelText.textContent = item.label;
        labelText.style.cssText = 'font-size: 13px; font-weight: 500;';

        const descText = document.createElement('div');
        descText.textContent = item.desc;
        descText.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 2px;';

        labelContainer.appendChild(labelText);
        labelContainer.appendChild(descText);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = config[item.key] !== false;
        checkbox.style.cssText = 'transform: scale(1.2); flex-shrink: 0;';

        checkbox.addEventListener('change', async () => {
          config[item.key] = checkbox.checked;
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        });

        row.appendChild(labelContainer);
        row.appendChild(checkbox);
        container.appendChild(row);
      });

      wrapper.appendChild(container);
      return wrapper
    }
  })
  // 一键记事保存配置（整合保存方式和ID配置）
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;';
      
      // 标题
      const titleDiv = document.createElement('div');
      titleDiv.textContent = '①一键记事保存配置';
      titleDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--b3-theme-on-background);';
      container.appendChild(titleDiv);
      
      // 描述
      const descDiv = document.createElement('div');
      descDiv.textContent = '💡 选择保存方式配置对应的目标ID，实时联动更新';
      descDiv.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); margin-bottom: 8px;';
      container.appendChild(descDiv);
  
      const config = context.mobileFeatureConfig as any;
      const currentSaveType = config.quickNoteSaveType || 'daily';
  
      // 保存方式选择
      const saveTypeLabel = document.createElement('label');
      saveTypeLabel.textContent = '选择保存方式：';
      saveTypeLabel.style.cssText = 'font-size: 13px; font-weight: 500;';
      container.appendChild(saveTypeLabel);
  
      // 单选按钮组
      const radioContainer = document.createElement('div');
      radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';
  
      const options = [
        { value: 'daily', label: '📘 保存到笔记本日记', description: '内容保存到指定笔记本的当日日记' },
        { value: 'document', label: '📄 追加到指定文档', description: '内容直接追加到指定文档底部或顶部' }
      ];
  
      options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';
  
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quickNoteSaveTypeSetting';
        radio.value = option.value;
        radio.checked = currentSaveType === option.value;
        radio.style.cssText = 'transform: scale(1.2);';
  
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = 'flex: 1;';
  
        const label = document.createElement('div');
        label.textContent = option.label;
        label.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);';
  
        const desc = document.createElement('div');
        desc.textContent = option.description;
        desc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-top: 2px;';
  
        // 点击事件处理
        optionDiv.onclick = async () => {
          // 清除其他选中状态
          const allRadios = radioContainer.querySelectorAll('input[type="radio"]');
          allRadios.forEach(r => (r as HTMLInputElement).checked = false);
          
          // 清除所有选项的选中样式 - 使用更准确的选择器
          const allOptionDivs = radioContainer.children;
          for (let i = 0; i < allOptionDivs.length; i++) {
            const div = allOptionDivs[i] as HTMLElement;
            if (div !== optionDiv) { // 排除当前点击的选项
              div.style.borderColor = 'var(--b3-border-color)';
              div.style.backgroundColor = 'transparent';
            }
          }
            
          // 选中当前项
          radio.checked = true;
          config.quickNoteSaveType = option.value as 'daily' | 'document';
          
          // 设置当前选项的选中样式
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            
          // 更新ID输入框
          updateIdInput();
            
          // 保存配置
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        };
  
        // 默认选中样式
        if (radio.checked) {
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        }
  
        labelDiv.appendChild(label);
        labelDiv.appendChild(desc);
        optionDiv.appendChild(radio);
        optionDiv.appendChild(labelDiv);
        radioContainer.appendChild(optionDiv);
      });
  
      container.appendChild(radioContainer);
  
      // ID配置区域
      const idConfigContainer = document.createElement('div');
      idConfigContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 12px;';

      const idLabel = document.createElement('label');
      idLabel.id = 'quick-note-setting-id-label';
      idLabel.style.cssText = 'font-size: 13px; font-weight: 500;';
      idConfigContainer.appendChild(idLabel);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'b3-text-field';
      input.id = 'quick-note-setting-id-input';
      input.style.cssText = 'font-size: 14px; padding: 8px; width: 100%;';

      const hint = document.createElement('div');
      hint.id = 'quick-note-setting-id-hint';
      hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface);';

      // 根据选择类型更新ID输入框
      function updateIdInput() {
        const saveType = config.quickNoteSaveType || 'daily';
        const labelEl = idConfigContainer.querySelector('#quick-note-setting-id-label') as HTMLLabelElement;
        const inputEl = idConfigContainer.querySelector('#quick-note-setting-id-input') as HTMLInputElement;
        const hintEl = idConfigContainer.querySelector('#quick-note-setting-id-hint') as HTMLDivElement;

        // 添加空值检查
        if (!labelEl || !inputEl || !hintEl) {
          return;
        }

        if (saveType === 'document') {
          labelEl.textContent = '📄 目标文档ID';
          inputEl.placeholder = '请输入文档ID，如：20250101000000-aaaaaa';
          inputEl.value = config.quickNoteDocumentId || '';
          hintEl.textContent = '💡 内容将直接追加到该文档底部或顶部';
        } else {
          labelEl.textContent = '📘 目标笔记本ID';
          inputEl.placeholder = '请粘贴DailyNote所在笔记本ID';
          inputEl.value = config.quickNoteNotebookId || '';
          hintEl.textContent = '💡 内容将保存到该笔记本的当日日记中';
        }
      }

      // 初始化显示 - 使用setTimeout确保DOM已渲染
      setTimeout(() => {
        updateIdInput();
      }, 0);
  
      input.onchange = async () => {
        const saveType = config.quickNoteSaveType || 'daily';
        const value = input.value.trim();
          
        if (saveType === 'document') {
          config.quickNoteDocumentId = value;
          // 清空笔记本ID避免混淆
          config.quickNoteNotebookId = '';
        } else {
          config.quickNoteNotebookId = value;
          // 清空文档ID避免混淆
          config.quickNoteDocumentId = '';
        }
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };
  
      idConfigContainer.appendChild(input);
      idConfigContainer.appendChild(hint);
      container.appendChild(idConfigContainer);
        
      wrapper.appendChild(container);
      return wrapper;
    }
  });

  // ===插入位置选择 ===
  setting.addItem({
    title: '②位置选择',
    description: '💡 选择一键记事内容插入到文档的位置',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any
      const currentPosition = config.quickNoteInsertPosition || 'bottom'

      const options = [
        {
          value: 'top',
          label: '①插入到文档顶部',
          description: '最新内容显示在最上面，适合日记、每日清单等'
        },
        {
          value: 'bottom',
          label: '②插入到文档底部',
          description: '按时间顺序记录，适合常规笔记'
        }
      ]

      options.forEach(option => {
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'quickNoteInsertPosition'
        radio.value = option.value
        radio.checked = currentPosition === option.value
        radio.style.cssText = 'transform: scale(1.3);'

        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'

        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'

        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'

        labelContainer.appendChild(label)
        labelContainer.appendChild(desc)

        optionContainer.appendChild(radio)
        optionContainer.appendChild(labelContainer)

        // 添加选中状态样式
        if (radio.checked) {
          optionContainer.style.cssText += ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
        }

        // 点击事件处理
        optionContainer.onclick = async () => {
          // 更新所有选项的选中状态
          container.querySelectorAll('input[type="radio"]').forEach(r => {
            const radioInput = r as HTMLInputElement
            const container = r.closest('div[style*="cursor: pointer"]') as HTMLElement
            if (r === radio) {
              radioInput.checked = true
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '') + ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
              }
            } else {
              radioInput.checked = false
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '')
              }
            }
          })

          // 保存配置
          config.quickNoteInsertPosition = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }

        container.appendChild(optionContainer)
      })

      wrapper.appendChild(container);
      return wrapper
    }
  })

  // === 输入格式选择（纯文本 / 思源块格式）===
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.id = 'quick-note-format-section';
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;

      const container = document.createElement('div');
      container.style.cssText =
        'padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      container.appendChild(createMobileQuickNoteFormatField({
        mobileFeatureConfig: context.mobileFeatureConfig,
        isAuthorToolActivated: context.isAuthorToolActivated,
        saveData: context.saveData,
      }));

      wrapper.appendChild(container);
      return wrapper;
    }
  });

  // ===弹窗输入框字体大小 ===
  setting.addItem({
    title: '④弹窗输入框字体大小',
    description: '💡 调节一键记事弹窗中输入框的字体大小',
    createActionElement: () => {
      const config = context.mobileFeatureConfig as any;
      const currentFontSize = config.quickNoteFontSize || 18;

      return createCustomSlider(
        '字体大小：',
        currentFontSize,
        12,
        30,
        'px',
        async (value) => {
          config.quickNoteFontSize = value;
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        }
      );
    }
  })

  //弹编辑器样式选择
  setting.addItem({
    title: '⑤弹窗编辑器样式选择',
    description: '选择一键记事弹窗的UI风格',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;
      const currentStyle = config.quickNoteStyle || 'apple';

      const options = [
        { value: 'default', label: '① 默认风格' },
        { value: 'apple', label: '② 苹果风格' }
      ];

      options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid ${currentStyle === option.value ? 'var(--b3-theme-primary)' : 'transparent'};
          background: ${currentStyle === option.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent'};
        `;

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quickNoteStyle';
        radio.value = option.value;
        radio.checked = currentStyle === option.value;
        radio.style.cssText = 'cursor: pointer;';

        const label = document.createElement('span');
        label.textContent = option.label;
        label.style.cssText = 'font-size: 14px; flex: 1;';

        optionDiv.appendChild(radio);
        optionDiv.appendChild(label);

        optionDiv.addEventListener('click', () => {
          // 更新选中状态
          container.querySelectorAll('div').forEach(div => {
            div.style.borderColor = 'transparent';
            div.style.background = 'transparent';
          });
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.background = 'rgba(59, 130, 246, 0.1)';
          
          // 更新radio
          const radioInput = optionDiv.querySelector('input');
          if (radioInput) radioInput.checked = true;
          
          // 保存配置
          config.quickNoteStyle = option.value;
          context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        });

        container.appendChild(optionDiv);
      });

      wrapper.appendChild(container);
      return wrapper
    }
  });

  // === 弹窗空输入框内容展示 ===
  setting.addItem({
    title: '⑥弹窗空输入框内容展示',
    description: '💡 弹窗空输入时，随机展示指定文档中的块段落。留空关闭此功能',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;

      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;

      const label = document.createElement('label');
      label.textContent = '📄 文档 ID';
      label.style.cssText = 'font-size: 13px; font-weight: 500;';
      container.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'b3-text-field';
      input.placeholder = '请输入文档 ID，如：20250101000000-aaaaaa';
      input.value = config.quickNoteQuoteDocId || '';
      input.style.cssText = 'font-size: 14px; padding: 8px; width: 100%;';
      container.appendChild(input);

      input.onchange = async () => {
        config.quickNoteQuoteDocId = input.value.trim();
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };

      // 字体大小滑杆
      const currentFontSize = config.quickNoteQuoteFontSize || 22;
      const slider = createCustomSlider(
        '字体大小：',
        currentFontSize,
        14,
        32,
        'px',
        async (value) => {
          config.quickNoteQuoteFontSize = value;
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        },
      );
      container.appendChild(slider);

      // 显示行数滑杆
      const currentMaxLines = config.quickNoteQuoteMaxLines || 5;
      const lineSlider = createCustomSlider(
        '显示行数：',
        currentMaxLines,
        1,
        10,
        '行',
        async (value) => {
          config.quickNoteQuoteMaxLines = value;
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        },
      );
      container.appendChild(lineSlider);

      // ===== 字体颜色选择 =====
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background: var(--b3-border-color); margin: 8px 0;';
      container.appendChild(separator);

      const colorTitle = document.createElement('div');
      colorTitle.textContent = '🎨 字体颜色';
      colorTitle.style.cssText = 'font-size: 13px; font-weight: 500; margin-bottom: 4px;';
      container.appendChild(colorTitle);

      // 明亮模式颜色行
      const lightRow = document.createElement('div');
      lightRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

      const lightLabel = document.createElement('span');
      lightLabel.textContent = '☀️ 明亮模式：';
      lightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;';

      const lightColorPicker = document.createElement('input');
      lightColorPicker.type = 'color';
      lightColorPicker.value = config.quickNoteQuoteColorLight || '#B8860B';
      lightColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;';

      const lightTextInput = document.createElement('input');
      lightTextInput.className = 'b3-text-field';
      lightTextInput.type = 'text';
      lightTextInput.value = config.quickNoteQuoteColorLight || '#B8860B';
      lightTextInput.placeholder = '#B8860B';
      lightTextInput.style.cssText = 'width: 90px; font-size: 14px; padding: 6px 8px;';

      lightColorPicker.onchange = async () => {
        config.quickNoteQuoteColorLight = lightColorPicker.value;
        lightTextInput.value = lightColorPicker.value;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };

      lightTextInput.onchange = async () => {
        const v = lightTextInput.value.trim();
        if (v) {
          config.quickNoteQuoteColorLight = v;
          lightColorPicker.value = v.startsWith('#') ? v : '#B8860B';
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        }
      };

      lightRow.appendChild(lightLabel);
      lightRow.appendChild(lightColorPicker);
      lightRow.appendChild(lightTextInput);
      container.appendChild(lightRow);

      // 暗黑模式颜色行
      const darkRow = document.createElement('div');
      darkRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

      const darkLabel = document.createElement('span');
      darkLabel.textContent = '🌙 暗黑模式：';
      darkLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;';

      const darkColorPicker = document.createElement('input');
      darkColorPicker.type = 'color';
      darkColorPicker.value = config.quickNoteQuoteColorDark || '#C9A84C';
      darkColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;';

      const darkTextInput = document.createElement('input');
      darkTextInput.className = 'b3-text-field';
      darkTextInput.type = 'text';
      darkTextInput.value = config.quickNoteQuoteColorDark || '#C9A84C';
      darkTextInput.placeholder = '#C9A84C';
      darkTextInput.style.cssText = 'width: 90px; font-size: 14px; padding: 6px 8px;';

      darkColorPicker.onchange = async () => {
        config.quickNoteQuoteColorDark = darkColorPicker.value;
        darkTextInput.value = darkColorPicker.value;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };

      darkTextInput.onchange = async () => {
        const v = darkTextInput.value.trim();
        if (v) {
          config.quickNoteQuoteColorDark = v;
          darkColorPicker.value = v.startsWith('#') ? v : '#C9A84C';
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        }
      };

      darkRow.appendChild(darkLabel);
      darkRow.appendChild(darkColorPicker);
      darkRow.appendChild(darkTextInput);
      container.appendChild(darkRow);

      wrapper.appendChild(container);
      return wrapper;
    }
  })

  // ===弹窗按钮排序方法 ===
  setting.addItem({
    title: '⑦弹窗按钮排序方法',
    description: '💡 选择一键记事弹窗中工具栏按钮的排列方式',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      // 获取当前配置值，设置默认值
      const config = context.mobileFeatureConfig as any
      const currentSortMethod = config.quickNoteSortMethod || 'bottomToolbar'

      // 创建选项按钮
      const options = [
        { 
          value: 'topToolbar', 
          label: '①顶部工具栏排序', 
          description: '从右往左排列，不满行时居中。适合习惯顶部工具栏的用户' 
        },
        { 
          value: 'bottomToolbar', 
          label: '②底部工具栏排序', 
          description: '从左往右排列，不满行时靠左。适合习惯底部工具栏的用户' 
        }
      ]

      options.forEach(option => {
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'quickNoteSortMethod'
        radio.value = option.value
        radio.checked = currentSortMethod === option.value
        radio.style.cssText = 'transform: scale(1.3);'

        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'

        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'

        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'

        labelContainer.appendChild(label)
        labelContainer.appendChild(desc)

        optionContainer.appendChild(radio)
        optionContainer.appendChild(labelContainer)

        // 添加选中状态样式
        if (radio.checked) {
          optionContainer.style.cssText += ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
        }

        // 点击事件处理
        optionContainer.onclick = async () => {
          // 更新所有选项的选中状态
          container.querySelectorAll('input[type="radio"]').forEach(r => {
            const radioInput = r as HTMLInputElement;
            const container = r.closest('div[style*="cursor: pointer"]') as HTMLElement
            if (r === radio) {
              radioInput.checked = true
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '') + ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
              }
            } else {
              radioInput.checked = false
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '')
              }
            }
          })

          // 保存配置
          config.quickNoteSortMethod = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }

        container.appendChild(optionContainer)
      })

      wrapper.appendChild(container);
      return wrapper
    }
  })

  // 按钮样式配置模式切换
  setting.addItem({
    title: '⑧弹窗按钮大小配置',
    description: '💡 选择使用默认配置或自定义配置按钮样式',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;
      const useCustom = config.useCustomButtonStyle || false;

      // 选项容器
      const optionsContainer = document.createElement('div');
      optionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      // 默认配置选项
      const defaultOption = document.createElement('div');
      defaultOption.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

      const defaultRadio = document.createElement('input');
      defaultRadio.type = 'radio';
      defaultRadio.name = 'button-style-config';
      defaultRadio.checked = !useCustom;
      defaultRadio.style.cssText = 'transform: scale(1.2);';

      const defaultLabel = document.createElement('span');
      defaultLabel.textContent = '使用默认配置';
      defaultLabel.style.cssText = 'font-size: 14px;';

      defaultOption.appendChild(defaultRadio);
      defaultOption.appendChild(defaultLabel);

      // 自定义配置选项
      const customOption = document.createElement('div');
      customOption.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

      const customRadio = document.createElement('input');
      customRadio.type = 'radio';
      customRadio.name = 'button-style-config';
      customRadio.checked = useCustom;
      customRadio.style.cssText = 'transform: scale(1.2);';

      const customLabel = document.createElement('span');
      customLabel.textContent = '使用自定义配置';
      customLabel.style.cssText = 'font-size: 14px;';

      customOption.appendChild(customRadio);
      customOption.appendChild(customLabel);

      // 更新选中样式
      const updateSelection = () => {
        if (defaultRadio.checked) {
          defaultOption.style.borderColor = 'var(--b3-theme-primary)';
          defaultOption.style.backgroundColor = 'var(--b3-theme-primary-lightest)';
          customOption.style.borderColor = 'var(--b3-border-color)';
          customOption.style.backgroundColor = 'transparent';
        } else {
          customOption.style.borderColor = 'var(--b3-theme-primary)';
          customOption.style.backgroundColor = 'var(--b3-theme-primary-lightest)';
          defaultOption.style.borderColor = 'var(--b3-border-color)';
          defaultOption.style.backgroundColor = 'transparent';
        }
      };

      updateSelection();

      // 点击事件
      defaultOption.onclick = async () => {
        defaultRadio.checked = true;
        config.useCustomButtonStyle = false;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        updateSelection();
        // 触发自定义事件通知设置项显示/隐藏
        window.dispatchEvent(new CustomEvent('quicknote-button-style-changed', { detail: false }));
      };

      customOption.onclick = async () => {
        customRadio.checked = true;
        config.useCustomButtonStyle = true;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        updateSelection();
        // 触发自定义事件通知设置项显示/隐藏
        window.dispatchEvent(new CustomEvent('quicknote-button-style-changed', { detail: true }));
      };

      optionsContainer.appendChild(defaultOption);
      optionsContainer.appendChild(customOption);
      container.appendChild(optionsContainer);

      wrapper.appendChild(container);
      wrapper.appendChild(createButtonStyleConfigContainer());
      return wrapper
    }
  })

  // === 滑杆创建辅助函数 ===
  const createSliderRow = (
    labelText: string,
    configKey: string,
    min: number,
    max: number,
    defaultValue: number,
    unit: string = 'px',
    showBorder: boolean = true
  ): HTMLElement => {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 8px 0;${showBorder ? ' border-bottom: 1px solid var(--b3-border-color);' : ''}`;

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'min-width: 100px; font-size: 14px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String((context.mobileFeatureConfig as any)[configKey] || defaultValue);
    slider.style.cssText = 'flex: 1; cursor: pointer;';

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${slider.value}${unit}`;
    valueDisplay.style.cssText = 'min-width: 45px; text-align: right; font-size: 14px;';

    slider.oninput = () => {
      valueDisplay.textContent = `${slider.value}${unit}`;
      (context.mobileFeatureConfig as any)[configKey] = parseInt(slider.value);
    };

    slider.onchange = async () => {
      (context.mobileFeatureConfig as any)[configKey] = parseInt(slider.value);
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    };

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueDisplay);

    return row;
  };

  // 创建按钮样式自定义配置容器
  const createButtonStyleConfigContainer = () => {
    const wrapper = document.createElement('div');
    wrapper.id = 'quicknote-button-style-configs';
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;';

    const config = context.mobileFeatureConfig as any;
    const useCustom = config.useCustomButtonStyle || false;

    // 根据初始状态设置显示/隐藏
    if (!useCustom) {
      wrapper.style.display = 'none';
    }

    // 监听切换事件（先移除旧的 listener 防止累积泄漏）
    if ((window as any).__quicknoteButtonStyleHandler) {
      window.removeEventListener('quicknote-button-style-changed', (window as any).__quicknoteButtonStyleHandler)
    }
    const styleHandler = ((e: CustomEvent) => {
      wrapper.style.display = e.detail ? 'flex' : 'none';
    }) as EventListener
    ;(window as any).__quicknoteButtonStyleHandler = styleHandler
    window.addEventListener('quicknote-button-style-changed', styleHandler)

    // 使用自定义滑杆组件
    wrapper.appendChild(createCustomSlider('按钮高度:', config.quickNoteButtonHeight || 40, 24, 66, 'px', async (value) => {
      config.quickNoteButtonHeight = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('按钮宽度:', config.quickNoteButtonMinWidth || 36, 20, 60, 'px', async (value) => {
      config.quickNoteButtonMinWidth = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('外边距:', config.quickNoteButtonMargin || 2, 0, 10, 'px', async (value) => {
      config.quickNoteButtonMargin = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('内边距:', config.quickNoteButtonPadding || 8, 0, 20, 'px', async (value) => {
      config.quickNoteButtonPadding = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('按钮间距:', config.quickNoteButtonGap || 6, 0, 20, 'px', async (value) => {
      config.quickNoteButtonGap = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    return wrapper;
  };

  // ===弹窗按钮选择 ===
  setting.addItem({
    title: '⑨弹窗按钮显示选择',
    description: '💡 选择哪些按钮显示在一键记事弹窗中（不选则显示全部）',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;

      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;
      const currentIds: string[] = config.quickNoteButtonIds || [];
      // 获取所有已启用的移动端按钮（排除溢出按钮），按 sort 排序
      const allButtons = context.mobileButtonConfigs
        .filter((btn: any) => btn.enabled !== false && btn.id !== 'overflow-button-mobile')
        .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));

      if (allButtons.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = '暂无可选按钮，请先在「②手机端按钮」中添加按钮';
        emptyMsg.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface-light); text-align: center; padding: 16px;';
        container.appendChild(emptyMsg);
        wrapper.appendChild(container);
        return wrapper;
      }

      // 「全选/取消全选」切换行
      const toggleRow = document.createElement('div');
      toggleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--b3-theme-primary-lightest, rgba(59,130,246,0.08)); border-radius: 6px; margin-bottom: 4px;';

      const toggleLabel = document.createElement('span');
      toggleLabel.textContent = `全部按钮（${allButtons.length} 个）`;
      toggleLabel.style.cssText = 'font-size: 14px; font-weight: 500;';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'b3-button b3-button--text';
      toggleBtn.style.cssText = 'font-size: 13px; padding: 4px 12px;';

      const isAllSelected = currentIds.length === 0 || currentIds.length === allButtons.length;
      toggleBtn.textContent = isAllSelected ? '取消全选' : '全选';

      toggleRow.appendChild(toggleLabel);
      toggleRow.appendChild(toggleBtn);
      container.appendChild(toggleRow);

      // 按钮列表
      const checkboxList = document.createElement('div');
      checkboxList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

      const rows: HTMLDivElement[] = [];
      const checkboxes: HTMLInputElement[] = [];

      allButtons.forEach((btn: any) => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = currentIds.length === 0 || currentIds.includes(btn.id);
        checkbox.style.cssText = 'transform: scale(1.2); flex-shrink: 0;';

        // 图标
        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
        if (btn.icon) {
          if (btn.icon.startsWith('icon')) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.style.cssText = 'display: block;';
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', `#${btn.icon}`);
            svg.appendChild(use);
            iconSpan.appendChild(svg);
          } else if (btn.icon.startsWith('lucide:')) {
            const iconName = btn.icon.substring(7);
            const svgHtml = lucideToSvg(iconName, btn.iconSize || 16);
            if (svgHtml) {
              iconSpan.innerHTML = svgHtml;
            } else {
              iconSpan.textContent = iconName.substring(0, 2);
              iconSpan.style.fontSize = '12px';
            }
          } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(btn.icon)) {
            const img = document.createElement('img');
            const pluginName = 'siyuan-toolbar-customizer';
            img.src = btn.icon.startsWith('/plugins/') ? btn.icon : `/plugins/${pluginName}/${btn.icon}`;
            img.style.cssText = 'width: 16px; height: 16px; object-fit: contain; display: block;';
            iconSpan.appendChild(img);
          } else {
            iconSpan.textContent = btn.icon;
            iconSpan.style.fontSize = '16px';
          }
        }

        // 名称
        const nameSpan = document.createElement('span');
        nameSpan.textContent = btn.name || btn.id;
        nameSpan.style.cssText = 'font-size: 14px; flex: 1;';

        row.appendChild(checkbox);
        row.appendChild(iconSpan);
        row.appendChild(nameSpan);

        // 点击行切换（checkbox 本身阻止冒泡，避免双次切换）
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          void saveSelection();
        });
        row.onclick = async () => {
          checkbox.checked = !checkbox.checked;
          await saveSelection();
        };

        checkboxList.appendChild(row);
        rows.push(row);
        checkboxes.push(checkbox);
      });

      container.appendChild(checkboxList);

      // 保存函数
      const saveSelection = async () => {
        const selectedIds: string[] = [];
        checkboxes.forEach((cb, index) => {
          if (cb.checked && allButtons[index]) {
            selectedIds.push(allButtons[index].id);
          }
        });

        // 全选时存空数组（向后兼容 = 显示全部）
        if (selectedIds.length === allButtons.length) {
          config.quickNoteButtonIds = [];
        } else {
          config.quickNoteButtonIds = selectedIds;
        }

        // 更新切换按钮文本
        toggleBtn.textContent = selectedIds.length === allButtons.length ? '取消全选' : '全选';

        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };

      // 全选/取消全选
      toggleBtn.onclick = async () => {
        const allCurrentlyChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => { cb.checked = !allCurrentlyChecked; });
        await saveSelection();
      };

      wrapper.appendChild(container);
      return wrapper;
    }
  })

  // === 小功能选择 ===
  createGroupTitle('5️⃣ ','小功能选择')

  // 说明文字
  createNotice('⚙️调整手机端的图标隐藏设置，注意打开扩展工具栏，会强制隐藏，若想用面包屑等，请滚动到顶部，关闭扩展工具栏按钮')

  // 检查扩展工具栏按钮是否启用
  const isOverflowButtonEnabled = () => {
    const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
    return overflowBtn?.enabled !== false
  }


  setting.addItem({
    title: '①面包屑图标隐藏',
    description: '💡开启后隐藏面包屑左侧的图标',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideBreadcrumbIcon
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideBreadcrumbIcon = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  setting.addItem({
    title: '②锁定编辑按钮隐藏',
    description: '💡隐藏工具栏的锁定编辑按钮',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideReadonlyButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideReadonlyButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  setting.addItem({
    title: '③文档菜单按钮隐藏',
    description: '💡隐藏工具栏的文档菜单按钮',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideDocMenuButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideDocMenuButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  setting.addItem({
    title: '④更多按钮隐藏',
    description: '💡隐藏工具栏的更多按钮',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideMoreButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideMoreButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  // 手机端禁止左右滑动弹出
  setting.addItem({
    title: '⑤禁止左右滑动弹出',
    description: '💡开启后禁止左右滑动弹出文档树和设置菜单',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileFeatureConfig.disableMobileSwipe ?? false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.disableMobileSwipe = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  setting.addItem({
    title: '⑥换行按钮',
    description: '💡在顶部工具栏原云同步位置左侧显示 H，并隐藏云同步图标；点击 H 在正文中分段换行（与编辑区内按 Enter 相同）',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileFeatureConfig.showMobileLineBreakButton === true
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.showMobileLineBreakButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  setting.addItem({
    title: '⑦手机端状态条隐藏',
    description: '💡隐藏手机端底部的状态条（含同步状态、字数统计等）。默认开启。',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileFeatureConfig.hideStatusBar !== false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideStatusBar = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  // === 使用帮助 ===
  createGroupTitle('6️⃣ ','手机端关闭与激活码')

  // 说明文字（已移除）

  // ⚠️ 手机端完全恢复思源原始状态
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(255, 77, 77, 0.15), rgba(255, 120, 77, 0.1));
        border: 2px solid rgba(255, 77, 77, 0.4);
        border-radius: 8px;
        box-sizing: border-box;
      `

      const headerRow = document.createElement('div')
      headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const titleEl = document.createElement('label')
      titleEl.style.cssText = 'font-size: 15px; font-weight: 700; color: #ff4d4d;'
      titleEl.textContent = '⚠️ 手机端完全恢复思源原始状态'

      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileFeatureConfig.disableCustomButtons ?? false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.disableCustomButtons = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }

      headerRow.appendChild(titleEl)
      headerRow.appendChild(toggle)
      container.appendChild(headerRow)

      const descEl = document.createElement('div')
      descEl.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      descEl.textContent = '💡 开启后：隐藏所有自定义按钮 + 取消所有工具栏样式修改，让思源恢复到未安装插件时的原始状态'
      container.appendChild(descEl)

      return container
    }
  })

  // ⑥鲸鱼定制工具箱激活
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.id = 'whale-toolbox-activation-mobile'
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 8px;
        box-sizing: border-box;
      `

      // 标题和状态行
      const headerRow = document.createElement('div')
      headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const titleEl = document.createElement('label')
      titleEl.style.cssText = 'font-size: 15px; font-weight: 700; color: #8b5cf6;'
      titleEl.textContent = '🔐 鲸鱼定制工具箱:永久激活'

      // 激活状态显示
      const statusEl = document.createElement('span')
      statusEl.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px;'
      if (context.isAuthorToolActivated()) {
        statusEl.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
        statusEl.textContent = '✓ 已激活'
      } else {
        statusEl.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
        statusEl.textContent = '✗ 未激活'
      }

      headerRow.appendChild(titleEl)
      // 已激活状态移到重新激活按钮左侧，不放在标题行
      container.appendChild(headerRow)

      // 说明文字
      const descEl = document.createElement('div')
      descEl.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      descEl.textContent = '💡 输入激活码后可解锁「⑥鲸鱼定制工具箱」功能类型。激活码获取：请进QQ群1018010924咨询群主！'
      container.appendChild(descEl)

      // 输入框和按钮容器
      const inputRow = document.createElement('div')
      inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'b3-text-field'
      input.placeholder = '请输入激活码'
      input.value = context.mobileFeatureConfig.authorCode ?? ''
      input.style.cssText = 'flex: 1; max-width: 200px;'

      const btn = document.createElement('button')
      btn.className = 'b3-button b3-button--text'
      btn.textContent = '验证激活'
      btn.onclick = async () => {
        const code = input.value.trim()

        // 获取当前思源登录账号（与电脑端逻辑保持一致）
        // validateActivationCode 会校验激活码绑定的是不是当前账号
        const userObj = (window as any).siyuan?.user
        const userName = (userObj && typeof userObj.userName === 'string' && userObj.userName) || ''

        // 前置检查：必须登录思源账号
        if (!userName) {
          showMessage('未检测到思源账号，请先在思源登录账号后再激活', 3000, 'error')
          return
        }

        // 禁用按钮防重复点击
        btn.disabled = true
        btn.textContent = '验证中...'
        try {
          if (validateActivationCode(code, userName)) {
            // 同时激活两端（保存 authorAccount，否则重启后 isAuthorToolActivated 校验失败）
            context.mobileFeatureConfig.authorActivated = true
            context.mobileFeatureConfig.authorCode = code
            context.mobileFeatureConfig.authorAccount = userName
            context.desktopFeatureConfig.authorActivated = true
            context.desktopFeatureConfig.authorCode = code
            context.desktopFeatureConfig.authorAccount = userName
            await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
            await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
            statusEl.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px; background: rgba(34, 197, 94, 0.2); color: #22c55e;'
            statusEl.textContent = '✓ 已激活'
            Notify.showInfoAuthorToolActivated()
          // 延迟后重新加载设置页面
          setTimeout(() => {
            window.location.reload()
          }, 1500)
          } else {
            Notify.showErrorActivationCodeInvalid()
          }
        } catch (err) {
          console.error('[MobileActivation] 验证失败:', err)
          Notify.showErrorActivationCodeInvalid()
        } finally {
          // 恢复按钮可点击状态（激活成功的情况下页面会刷新，不影响）
          btn.disabled = false
          btn.textContent = '验证激活'
        }
      }

      inputRow.appendChild(input)
      inputRow.appendChild(btn)

      // "查看激活方式"按钮（与"验证激活"并排，未激活态显示）
      const infoBtn = document.createElement('button')
      infoBtn.className = 'b3-button b3-button--text'
      infoBtn.style.cssText = 'color: #722ed1; flex-shrink: 0;'
      infoBtn.textContent = '查看激活方式'
      infoBtn.onclick = () => showActivationInfoModal(false)
      inputRow.appendChild(infoBtn)
      
      // 根据激活状态决定是否显示输入框和验证按钮
      if (context.isAuthorToolActivated()) {
        inputRow.style.display = 'none'  // 激活后隐藏输入框和验证按钮
        // 添加按钮容器
        const btnContainer = document.createElement('div')
        btnContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;'

        // 添加重新激活按钮
        const reActivateBtn = document.createElement('button')
        reActivateBtn.className = 'b3-button b3-button--info'
        reActivateBtn.textContent = '重新激活'
        reActivateBtn.onclick = () => {
          // 显示输入框和验证按钮
          inputRow.style.display = 'flex'
          // 隐藏按钮容器
          btnContainer.style.display = 'none'
        }
        btnContainer.appendChild(statusEl)
        btnContainer.appendChild(reActivateBtn)

        // "查看激活方式"按钮（与"重新激活"并排，已激活态显示）
        const infoBtnActivated = document.createElement('button')
        infoBtnActivated.className = 'b3-button b3-button--text'
        infoBtnActivated.style.cssText = 'color: #722ed1; flex-shrink: 0;'
        infoBtnActivated.textContent = '查看激活方式'
        infoBtnActivated.onclick = () => showActivationInfoModal(true)
        btnContainer.appendChild(infoBtnActivated)

        container.appendChild(btnContainer)
      }
      
      container.appendChild(inputRow)

      return container
    }
  })

  // 鲸鱼定制工具箱功能列表说明（手机端 5 标签）
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.05));
        border-radius: 8px;
        box-sizing: border-box;
      `
      container.innerHTML = `
        <div style="font-size: 14px; color: var(--b3-theme-primary); margin-bottom: 12px; font-weight: 600;">🐋 鲸鱼定制工具箱功能列表（15项）</div>
        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-bottom: 12px; line-height: 1.6;">激活后即可使用以下高级功能，让你的思源笔记效率翻倍：</div>
      `

	      const rowTr = (num: string, name: string, desc: string): string => `<tr>
          <td style="padding:10px;font-weight:500;"><span style="color:var(--b3-theme-primary);margin-right:4px;">${num}</span>${name}</td>
          <td style="padding:10px;color:var(--b3-theme-on-surface);font-size:12px;">${desc}</td>
        </tr>`

      const __allRows = [
        rowTr('⓪', '一键记事弹窗块格式', '一键记事弹窗支持思源块格式输入，富文本编辑，插入标题、列表、代码块等' +
          '<a href="javascript:void(0)" onclick="(function(){var el=document.getElementById(\'quick-note-format-section\');if(!el)return;el.scrollIntoView({behavior:\'smooth\',block:\'center\'});el.classList.remove(\'jump-highlight\');void el.offsetWidth;el.classList.add(\'jump-highlight\');setTimeout(function(){el.classList.remove(\'jump-highlight\')},2000)})()" style="color:var(--b3-theme-primary);font-size:12px;text-decoration:underline;margin-left:8px;">👉设置</a>'),
        rowTr('①', '连续点击自定义按钮', '一键自动执行多个按钮操作，告别重复点击，工作流自动化'),
        rowTr('②', '打开指定ID块', '精准跳转到任意文档任意位置，省时省力'),
        rowTr('③', '数据库悬浮弹窗', '悬浮窗口快速查看数据库，无需切换页面，数据触手可及'),
        rowTr('④', '日记底部', '一键直达日记末尾，快速追加内容，记录生活点滴'),
        rowTr('⑤', '叶归LifeLog适配', '与LifeLog插件深度整合，时间记录更智能，生活管理更高效'),
        rowTr('⑥', '弹窗框模板选择', '弹出式模板选择器，快速插入常用内容，写作效率倍增'),
        rowTr('⑦', '滚动文档顶部或底部', '一键直达文档首尾，长文档浏览更轻松'),
        rowTr('⑧', '图片快捷导入日记', '一键选择图片导入笔记。若开启思源块编辑模式，可插入记事弹窗编辑器光标处'),
        rowTr('⑨', '手机端悬浮标签页Tab', '手机端多文档快速切换，苹果风格悬浮Tab栏，自动管理，告别反复返回'),
        rowTr('⑩', '手机端悬浮大纲', '左侧悬浮大纲面板，标题快速跳转，实时跟踪当前位置，阅读长文必备'),
        rowTr('⑪', '手机端前一篇/后一篇文档', '底部悬浮导航栏，按文件树顺序浏览文档，前后翻页，阅读更流畅'),
		        rowTr('⑫', '滑动快速批注<br><span style="color:#10b981;font-size:11px;">免费</span>', '完美联动「鲸鱼快速批注」插件，请先下载该插件才能使用！'),
        rowTr('⑬', '文档朗读', '使用浏览器语音合成朗读当前文档，支持语速调节、段落高亮'),
        rowTr('⑭', '一键清理空块', '自动扫描并删除文档中空块（无文本段落/标题/列表项），预览确认后批量删除'),
        rowTr('⑮', '沉浸阅读模式<br><span style="color:#10b981;font-size:11px;">免费</span>', '🔒一键锁定文档防误编辑 + 📱上滑自动隐藏工具栏，全屏沉浸阅读'),
        rowTr('⑯', '快速添加附件', '📎选择任意文件上传，可自定义名称，图片支持压缩；有光标插光标处，无光标追加日记（记事弹窗中不生效）'),
      ]

      interface __TabData { key: string; label: string; sub: string; icon: string; rows: string[] }
      const __tabs: __TabData[] = [
        { key: 'all', label: '全部功能', sub: '17项', icon: '📋', rows: __allRows },
        { key: 'reading', label: '批注阅读', sub: '6项', icon: '📖', rows: [__allRows[9], __allRows[10], __allRows[11], __allRows[13], __allRows[15], __allRows[12]] },
        { key: 'notes', label: '笔记与日记', sub: '5项', icon: '✍️', rows: [__allRows[0], __allRows[4], __allRows[5], __allRows[8], __allRows[16]] },
        { key: 'edit', label: '编辑提效', sub: '3项', icon: '⚡', rows: [__allRows[1], __allRows[6], __allRows[14]] },
        { key: 'nav', label: '导航与浏览', sub: '3项', icon: '🧭', rows: [__allRows[2], __allRows[3], __allRows[7]] },
      ]

      const __tabBar = document.createElement('div')
      __tabBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;'
      container.appendChild(__tabBar)

      const __containers: Record<string, HTMLElement> = {}
      __tabs.forEach(t => {
        const btn = document.createElement('button')
        btn.style.cssText = 'display:flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);cursor:pointer;font-size:13px;outline:none;white-space:nowrap;transition:all 0.15s;'
        btn.innerHTML = `${t.icon} ${t.label} <span style="font-size:11px;opacity:0.6;">${t.sub}</span>`
        __tabBar.appendChild(btn)

        const wrap = document.createElement('div')
        wrap.style.display = 'none'
        wrap.innerHTML = `
          <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px;">
            <thead>
              <tr style="background:var(--b3-theme-primary-lightest);">
                <th style="padding:10px;text-align:left;">功能名称</th>
                <th style="padding:10px;text-align:left;">功能说明</th>
              </tr>
            </thead>
            <tbody>${t.rows.join('')}</tbody>
          </table>
          <div style="padding:12px;text-align:center;color:var(--b3-theme-primary);font-style:italic;font-size:13px;">持续更新中~</div>
        `
        container.appendChild(wrap)
        __containers[t.key] = wrap

        btn.onclick = () => {
          Object.values(__containers).forEach(c => c.style.display = 'none')
          wrap.style.display = ''
          __tabBar.querySelectorAll('button').forEach(b => {
            b.style.background = 'var(--b3-theme-surface)'
            b.style.color = 'var(--b3-theme-on-surface)'
            b.style.borderColor = 'var(--b3-border-color)'
          })
          btn.style.background = 'var(--b3-theme-primary)'
          btn.style.color = '#fff'
          btn.style.borderColor = 'var(--b3-theme-primary)'
        }
      })
      ;(__tabBar.querySelector('button') as HTMLElement)?.click()
      return container
    }
  })
}
