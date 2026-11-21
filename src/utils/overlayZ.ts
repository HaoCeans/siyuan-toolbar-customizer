/**
 * 插件浮层层号助手：跟随思源的 window.siyuan.zIndex 递增计数器（后开者在上），
 * 同时保证不低于 minZ，以便盖过思源/插件的固定层 UI。
 *
 * 背景（CLAUDE.md 坑 41）：思源手机端 nativeSelect.ts 会拦截原生 <select> 的
 * pointerdown/click（preventDefault）并弹出 b3-menu 自绘菜单，菜单层号 =
 * ++window.siyuan.zIndex。插件自建面板若用固定 z-index，菜单会被压在面板后面
 * ——表现为下拉"点了没反应"。插件所有自建浮层统一走本助手后，"后开者在上"与
 * "最低层级"同时得到保证，思源的菜单/消息也能自然浮在面板上方。
 *
 * 思源侧同机制参考：dialog/index.ts:107、menus popMenu（#menu style.zIndex）、
 * dialog/message.ts:124 均为 ++window.siyuan.zIndex。
 */
export function nextPluginOverlayZ(minZ: number): number {
  const siyuan = (window as any).siyuan
  if (typeof siyuan?.zIndex !== 'number') {
    // 思源全局未就绪（极早加载/浏览器端异常环境）：退回固定层，保持旧行为
    return minZ
  }
  siyuan.zIndex = Math.max(siyuan.zIndex + 1, minZ)
  return siyuan.zIndex
}
