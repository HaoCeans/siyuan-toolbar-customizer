/**
 * ===== main.ts - 插件主入口模块 =====
 * 
 * 功能说明：
 * 1. 管理 Vue 应用的创建和销毁
 * 2. 提供插件实例的全局访问（通过 usePlugin）
 * 3. 处理插件的初始化和清理工作
 * 
 * 使用方式：
 * - 在 index.ts 的 onload() 中调用 init(this) 初始化插件
 * - 在 index.ts 的 onunload() 中调用 destroy() 清理资源
 * - 在 Vue 组件中通过 usePlugin() 获取插件实例，访问 SiYuan API
 */

import {
  Plugin,  // SiYuan 插件基类，提供插件的基础功能（如 app、eventBus、i18n 等）
} from "siyuan";
import { createApp } from 'vue'  // Vue 3 的应用创建函数
import App from './App.vue'      // 插件的根组件

// ===== 全局变量：存储插件实例 =====
let plugin: Plugin | null = null

/**
 * 获取或设置插件实例
 * 
 * @param pluginProps - 可选的插件实例，如果提供则保存到全局变量
 * @returns 返回当前的插件实例
 * 
 * 使用示例：
 * ```typescript
 * // 在组件中获取插件实例
 * const plugin = usePlugin()
 * // 使用插件 API
 * plugin.app.plugins.plugins.forEach(p => console.log(p.name))
 * ```
 */
export function usePlugin(pluginProps?: Plugin): Plugin | null {
  console.log('usePlugin', pluginProps, plugin)
  
  // 如果传入了插件实例，保存到全局变量
  if (pluginProps) {
    plugin = pluginProps
  }
  
  // 如果既没有传入参数，也没有已保存的实例，输出错误
  if (!plugin && !pluginProps) {
    console.error('need bind plugin - 需要先调用 init(plugin) 初始化插件')
  }
  
  return plugin;
}

// ===== 全局变量：存储 Vue 应用实例 =====
let app: ReturnType<typeof createApp> | null = null

/**
 * 初始化插件
 * 
 * 功能：
 * 1. 保存插件实例到全局变量
 * 2. 创建 Vue 应用并挂载到 DOM
 * 3. 将应用容器添加到页面 body
 * 
 * @param plugin - 插件实例（从 index.ts 的 onload() 中传入）
 * 
 * 调用时机：
 * - 在 index.ts 的 onload() 生命周期中调用：init(this)
 * 
 * 使用示例：
 * ```typescript
 * async onload() {
 *   init(this)  // this 是插件实例
 * }
 * ```
 */
export function init(plugin: Plugin) {
  // 将插件实例保存到全局，供其他模块使用
  usePlugin(plugin);

  // 创建容器 div，用于挂载 Vue 应用
  const div = document.createElement('div')
  div.classList.toggle('plugin-sample-vite-vue-app')  // 添加 CSS 类名
  div.id = plugin.name  // 使用插件名称作为 ID（修复：使用 plugin.name 而不是 this.name）

  // 创建 Vue 应用实例并挂载到容器
  app = createApp(App)
  app.mount(div)
  
  // 将容器添加到页面 body，使插件界面可见
  document.body.appendChild(div)
}

/**
 * 销毁插件
 * 
 * 功能：
 * 1. 卸载 Vue 应用（清理组件、事件监听等）
 * 2. 从 DOM 中移除插件容器
 * 
 * 调用时机：
 * - 在 index.ts 的 onunload() 生命周期中调用：destroy()
 * 
 * 使用示例：
 * ```typescript
 * onunload() {
 *   destroy()  // 清理资源
 * }
 * ```
 * 
 * 注意事项：
 * - 必须调用此函数，否则会导致内存泄漏
 * - 如果插件有定时器、事件监听等，需要在这里清理
 */
export function destroy() {
  // 卸载 Vue 应用，触发所有组件的 beforeUnmount 和 unmounted 生命周期
  if (app) {
  app.unmount()
    app = null
  }
  
  // 从 DOM 中移除插件容器（修复：使用 plugin.name 而不是 this.name）
  if (plugin) {
    const div = document.getElementById(plugin.name)
    if (div) {
  document.body.removeChild(div)
    }
    plugin = null
  }
}
