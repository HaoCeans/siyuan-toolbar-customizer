import { Plugin } from "siyuan";
import { createApp } from 'vue'
import App from './App.vue'

let plugin: Plugin | null = null

export function usePlugin(pluginProps?: Plugin): Plugin | null {
  if (pluginProps) {
    plugin = pluginProps
  }
  
  if (!plugin && !pluginProps) {
    console.error('需要先调用 init(plugin) 初始化插件')
  }
  
  return plugin;
}

let app: ReturnType<typeof createApp> | null = null

export function init(plugin: Plugin) {
  usePlugin(plugin);

  const div = document.createElement('div')
  div.classList.toggle('toolbar-customizer-app')
  div.id = plugin.name

  app = createApp(App)
  app.mount(div)
  
  document.body.appendChild(div)
}

export function destroy() {
  if (app) {
    app.unmount()
    app = null
  }
  
  if (plugin) {
    const div = document.getElementById(plugin.name)
    if (div) {
      document.body.removeChild(div)
    }
    plugin = null
  }
}