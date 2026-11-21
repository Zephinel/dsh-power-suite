/**
 * Copy dictionary for the Workspace default-preset menu.
 *
 * The namespace and both dictionaries used to sit inline in `src/client.js`;
 * keys and visible strings are unchanged.
 *
 * @module
 */

/** Copy namespace for the Workspace default-preset menu. */
export const PRESET_NS = 'workspacePresets'

export const PRESET_EN: Record<string, string> = {
  'menu.followGlobal': 'Follow global default',
  'menu.followGlobalCurrent': 'Follow global default (currently {name})',
  'menu.current': 'Default agent preset: {name}',
  'preset.standard': 'Standard mode',
  'preset.ptc': 'PTC mode',
  'preset.minimal': 'Minimal mode',
  'preset.cordis': 'Creator mode',
  'menu.currentMark': '{name} (current)',
  'menu.unavailableMark': '{name} (unavailable)',
  'menu.globalDefault': 'Global default',
  'menu.loadFailed': 'Could not load agent presets',
  'menu.saveFailed': 'Could not save default agent preset',
  'menu.saved': 'Default agent preset saved'
}

export const PRESET_ZH: Record<string, string> = {
  'menu.followGlobal': '跟随全局默认',
  'menu.followGlobalCurrent': '跟随全局默认（当前：{name}）',
  'menu.current': '默认 Agent 预设：{name}',
  'preset.standard': '标准模式',
  'preset.ptc': 'PTC 模式',
  'preset.minimal': '极简模式',
  'preset.cordis': '创造模式',
  'menu.currentMark': '{name}（当前）',
  'menu.unavailableMark': '{name}（不可用）',
  'menu.globalDefault': '全局默认',
  'menu.loadFailed': '无法加载 Agent 预设',
  'menu.saveFailed': '无法保存默认 Agent 预设',
  'menu.saved': '默认 Agent 预设已保存'
}
