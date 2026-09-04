/** 一键记事输入格式 */
export type QuickNoteInputFormat = 'plain' | 'block'

export const DEFAULT_QUICK_NOTE_INPUT_FORMAT: QuickNoteInputFormat = 'plain'

export const QUICK_NOTE_FORMAT_OPTIONS: {
  value: QuickNoteInputFormat
  labelKey: string
  labelFallback: string
  descriptionKey: string
  descriptionFallback: string
  requiresActivation: boolean
}[] = [
  {
    value: 'plain',
    labelKey: 'quickNote.format.plain.label',
    labelFallback: '①纯文本格式',
    descriptionKey: 'quickNote.format.plain.description',
    descriptionFallback: '使用 textarea 输入，保存为 Markdown（免费）',
    requiresActivation: false,
  },
  {
    value: 'block',
    labelKey: 'quickNote.format.block.label',
    labelFallback: '②思源块格式',
    descriptionKey: 'quickNote.format.block.description',
    descriptionFallback: '使用思源原生块编辑器输入（需鲸鱼定制工具箱激活）',
    requiresActivation: true,
  },
]
