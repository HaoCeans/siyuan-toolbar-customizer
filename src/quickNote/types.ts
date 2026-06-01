/** 一键记事输入格式 */
export type QuickNoteInputFormat = 'plain' | 'block'

export const DEFAULT_QUICK_NOTE_INPUT_FORMAT: QuickNoteInputFormat = 'plain'

export const QUICK_NOTE_FORMAT_OPTIONS: {
  value: QuickNoteInputFormat
  label: string
  description: string
  requiresActivation: boolean
}[] = [
  {
    value: 'plain',
    label: '①纯文本格式',
    description: '使用 textarea 输入，保存为 Markdown（免费）',
    requiresActivation: false,
  },
  {
    value: 'block',
    label: '②思源块格式',
    description: '使用思源原生块编辑器输入（需鲸鱼定制工具箱激活）',
    requiresActivation: true,
  },
]
