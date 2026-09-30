/**
 * 斜杠菜单工具栏 —— 设置面板分组（独立文件）
 *
 * 手机端设置最顶部的一组，只有一项：按钮预览（右上角带总开关）。
 * 由 settings/mobile.ts 调一次 mountSlashToolbarSection()，本文件内部自己注册设置项。
 */

import type { Setting } from 'siyuan'
import type { ISlashToolbarConfig } from './catalog'
import { t } from '../i18n/runtime'
import { createSlashToolbarPreview } from './preview'
import { syncSlashToolbar } from './runtime'

export interface ISlashToolbarSettingsContext {
  /** 插件持有的斜杠工具栏配置对象（直接引用，改动即时生效） */
  slashToolbarConfig: ISlashToolbarConfig
  saveData: (key: string, value: unknown) => Promise<void>
}

const CONFIG_KEY = 'slashToolbarConfig'

/** 渲染分组标题（与手机端设置里其它分组标题同款外观） */
const createGroupTitle = (setting: Setting, icon: string, title: string) => {
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'margin: 0 -16px; width: calc(100% + 32px);'
      const titleEl = document.createElement('div')
      titleEl.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; margin: 8px 0;
        border-radius: 6px; font-weight: 600;
        color: color-mix(in srgb, #8e24aa 65%, var(--b3-theme-on-background));
        background: color-mix(in srgb, #8e24aa 10%, transparent);
      `
      const iconEl = document.createElement('span')
      iconEl.style.fontSize = '20px'
      iconEl.textContent = icon
      const textEl = document.createElement('span')
      textEl.style.fontSize = '17px'
      textEl.textContent = title
      titleEl.appendChild(iconEl)
      titleEl.appendChild(textEl)
      wrapper.appendChild(titleEl)
      return wrapper
    },
  })
}

/**
 * 挂载斜杠菜单工具栏设置分组。
 * @param setting 思源设置对话框实例
 * @param context 斜杠工具栏配置与保存回调
 * @param createTitle 复用调用方的分组标题工厂（保证与其它分组外观一致）
 */
export function mountSlashToolbarSection(
  setting: Setting,
  context: ISlashToolbarSettingsContext,
  createTitle?: (icon: string, title: string, id?: string) => void,
): void {
  const config = context.slashToolbarConfig
  const title = t('slashToolbar.settings.group', undefined, '思源移动端斜杠菜单栏')
  if (createTitle) {
    createTitle('↗️', title)
  } else {
    createGroupTitle(setting, '⬆️', title)
  }

  // 只有一个设置项：按钮预览，右上角带总开关
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'width:100%;padding:8px 0;'
      const preview = createSlashToolbarPreview({
        getOrder: () => config.order,
        setOrder: (order) => {
          config.order = order
        },
        getEnabled: () => config.enabled === true,
        setEnabled: async (enabled) => {
          config.enabled = enabled
          await context.saveData(CONFIG_KEY, config)
          syncSlashToolbar(config.enabled, config.order)
        },
        onChanged: () => {
          syncSlashToolbar(config.enabled, config.order)
        },
      })
      wrapper.appendChild(preview)
      return wrapper
    },
  })
}
