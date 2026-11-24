/**
 * 播放范围跟踪 — 播放条进度按「当前块号 / 结束块号」显示
 *
 * 例：全文 14 块、选择第 3-5 块朗读，播放条显示 3/5、4/5、5/5
 * （不再是 3/14、4/14、5/14，也不是范围内的 1/3、2/3、3/3）。
 */

let rangeStart = 0
/** -1 表示「到全文末尾」 */
let rangeEnd = -1

/** 开始播放前记录本次朗读范围（end 不传 = 到末尾） */
export function setPlaybackRange(start: number, end?: number): void {
  rangeStart = Math.max(0, Math.round(start))
  rangeEnd = end === undefined ? -1 : Math.max(rangeStart, Math.round(end))
}

/** 切换文档后自动续读：范围重置为全文 */
export function resetPlaybackRange(): void {
  rangeStart = 0
  rangeEnd = -1
}

/** 生成播放条进度文案：当前是第几块 / 读到第几块（均为 1-based 的块号） */
export function formatRangeProgress(index: number, total: number): string {
  const last = Math.max(0, total - 1)
  const end = Math.max(0, Math.min(rangeEnd < 0 ? last : rangeEnd, last))
  const start = Math.max(0, Math.min(rangeStart, end))
  const endLabel = end + 1
  // 停止/未开始时引擎把索引置为 -1，显示 0 / 结束块号
  if (index < 0) return `0 / ${endLabel}`
  const current = Math.max(start + 1, Math.min(endLabel, index + 1))
  return `${current} / ${endLabel}`
}
