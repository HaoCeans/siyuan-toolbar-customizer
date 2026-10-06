/**
 * 斜杠菜单工具栏 —— 设置面板分组（独立文件）
 *
 * 手机端设置最顶部的一组，只有一项：按钮预览（右上角带总开关）。
 * 由 settings/mobile.ts 调一次 mountSlashToolbarSection()，本文件内部自己注册设置项。
 */

import type { Setting } from 'siyuan'
import type { ISlashToolbarConfig } from './catalog'
import { t } from '../i18n/runtime'
import { getSlashCustomButtonSources } from '../toolbarManager'
import {
  buildCustomSlashButtons,
  normalizeInPlaceGroups,
  SLASH_CUSTOM_PREFIX,
} from './catalog'
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
          syncSlashToolbar(config.enabled, config.order, config.inPlaceGroups)
        },
        // 手机端自定义按钮（设置内「添加自定义按钮」列表的数据源 + 预览里的 chip 解析）
        getCustomButtons: () => buildCustomSlashButtons(getSlashCustomButtonSources()),
        // 加入：追加到 order 末尾（=「不显示区」），当场落盘并同步
        addCustom: async (sourceId) => {
          const key = SLASH_CUSTOM_PREFIX + sourceId
          if (!config.order.includes(key)) {
            config.order = [...config.order, key]
          }
          await context.saveData(CONFIG_KEY, config)
          syncSlashToolbar(config.enabled, config.order, config.inPlaceGroups)
        },
        // 从斜杠栏移除自定义按钮：当场落盘并同步（与原地改格式开关同一路径）
        removeCustom: async (id) => {
          config.order = config.order.filter((item) => item !== id)
          await context.saveData(CONFIG_KEY, config)
          syncSlashToolbar(config.enabled, config.order, config.inPlaceGroups)
        },
        // 「原地改格式」按钮开关（标题 / 列表 / 引述各一个），默认全部关闭 = 思源原生新建块。
        // 导入的配置文件可能是脏值，读之前按数组判断一次
        getInPlace: (group) => Array.isArray(config.inPlaceGroups) && config.inPlaceGroups.includes(group),
        setInPlace: async (group, enabled) => {
          const next = normalizeInPlaceGroups(config.inPlaceGroups).filter((item) => item !== group)
          if (enabled) {
            next.push(group)
          }
          config.inPlaceGroups = normalizeInPlaceGroups(next)
          await context.saveData(CONFIG_KEY, config)
          syncSlashToolbar(config.enabled, config.order, config.inPlaceGroups)
        },
        onChanged: () => {
          syncSlashToolbar(config.enabled, config.order, config.inPlaceGroups)
        },
      })
      wrapper.appendChild(preview)
      return wrapper
    },
  })
}
