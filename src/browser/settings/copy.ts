/**
 * Copy dictionary for the suite's Plugins-page settings section.
 *
 * Keys and visible strings are unchanged from the inline entry copy.
 *
 * @module
 */

/** Copy namespace for the Plugins-page configuration section. */
export const SETTINGS_NS = 'powerSuiteSettings'

export const SETTINGS_EN: Record<string, string> = {
  'history.group': 'Prompt history',
  'history.groupHint': 'Hold the chosen modifier and press ↑ or ↓ in the composer to switch between prompts already sent in this session. Plain arrows keep their normal editing behavior, including inside a recalled multi-line prompt. Primary is ⌘ on macOS and Ctrl on Windows and Linux; Alt is ⌥ on macOS and Alt on Windows and Linux.',
  'history.label': 'Shortcut modifier',
  'history.current': 'Current shortcut: {shortcut}',
  'modifier.primary': '⌘ / Ctrl',
  'modifier.alt': '⌥ / Alt',
  'modifier.ctrl': '⌃ / Ctrl',
  'modifier.shift': '⇧ / Shift',
  'modifier.off': 'Off',
  'shortcut.primary.mac': '⌘ + ↑ / ↓',
  'shortcut.primary.other': 'Ctrl + ↑ / ↓',
  'shortcut.alt.mac': '⌥ + ↑ / ↓',
  'shortcut.alt.other': 'Alt + ↑ / ↓',
  'shortcut.ctrl': 'Ctrl + ↑ / ↓',
  'shortcut.shift.mac': '⇧ + ↑ / ↓',
  'shortcut.shift.other': 'Shift + ↑ / ↓',
  'shortcut.off': 'Off',
  'dynamic.group': 'Active & recent',
  'dynamic.groupHint': 'Choose how long a finished Session stays in the Running & recent card, and how long a project stays in Active Projects after its last activity. Running Sessions are always listed and count as active.',
  'recent.label': 'Finished Session retention',
  'recent.current': 'Currently {value}. Finished Sessions leave the card after this window.',
  'recent.60': '1 hour',
  'recent.120': '2 hours',
  'recent.360': '6 hours',
  'recent.720': '12 hours',
  'recent.1440': '24 hours',
  'active.label': 'Active project retention',
  'active.current': 'Currently {value}. After this window the project moves to Inactive Projects.',
  'active.1': '1 day',
  'active.3': '3 days',
  'active.7': '7 days',
  'active.14': '14 days',
  'active.30': '30 days',
  'settings.loading': 'Loading settings…',
  'settings.unavailable': 'Settings are unavailable. The default shortcut stays active.',
  'settings.error': 'Could not save the setting. Try again.'
}

export const SETTINGS_ZH: Record<string, string> = {
  'history.group': '提示历史',
  'history.groupHint': '在输入框里按住所选修饰键再按 ↑ 或 ↓，即可在本次会话已发送的提示之间切换。普通方向键保持原来的编辑行为，包括在回填的多行提示内部移动。Primary 在 macOS 上是 ⌘、在 Windows / Linux 上是 Ctrl；Alt 在 macOS 上是 ⌥、其他平台是 Alt。',
  'history.label': '快捷键修饰键',
  'history.current': '当前快捷键：{shortcut}',
  'modifier.primary': '⌘ / Ctrl',
  'modifier.alt': '⌥ / Alt',
  'modifier.ctrl': '⌃ / Ctrl',
  'modifier.shift': '⇧ / Shift',
  'modifier.off': '关闭',
  'shortcut.primary.mac': '⌘ + ↑ / ↓',
  'shortcut.primary.other': 'Ctrl + ↑ / ↓',
  'shortcut.alt.mac': '⌥ + ↑ / ↓',
  'shortcut.alt.other': 'Alt + ↑ / ↓',
  'shortcut.ctrl': 'Ctrl + ↑ / ↓',
  'shortcut.shift.mac': '⇧ + ↑ / ↓',
  'shortcut.shift.other': 'Shift + ↑ / ↓',
  'shortcut.off': '已关闭',
  'dynamic.group': '活跃与最近',
  'dynamic.groupHint': '设置完成会话留在「进行中与最近活跃」卡片里的时长，以及项目最后一次活动后保留在活跃项目分组里的时长。进行中的会话始终显示并计为活跃。',
  'recent.label': '完成会话保留时长',
  'recent.current': '当前：{value}。超过后完成的会话从卡片移除。',
  'recent.60': '1 小时',
  'recent.120': '2 小时',
  'recent.360': '6 小时',
  'recent.720': '12 小时',
  'recent.1440': '24 小时',
  'active.label': '活跃项目保留时长',
  'active.current': '当前：{value}。超过后项目归入非活跃项目。',
  'active.1': '1 天',
  'active.3': '3 天',
  'active.7': '7 天',
  'active.14': '14 天',
  'active.30': '30 天',
  'settings.loading': '正在读取设置…',
  'settings.unavailable': '设置暂不可用，快捷键保持默认。',
  'settings.error': '保存设置失败，请重试。'
}
