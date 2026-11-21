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
  'history.groupHint': 'Hold the selected modifier and press ↑ or ↓ in the composer to cycle through sent prompts. Plain arrow keys keep normal editing behavior, including inside multi-line prompts. Choose ⌘ / Ctrl for ⌘ on macOS or Ctrl on Windows and Linux. Choose ⌥ / Alt for ⌥ on macOS or Alt on Windows and Linux.',
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
  'dynamic.groupHint': 'Choose how long finished sessions stay in Running & recent and how long projects stay in Active Projects. Running sessions always stay listed and count as active.',
  'recent.label': 'Finished session retention',
  'recent.current': 'Currently {value}. Finished sessions leave Running & recent after this window.',
  'recent.60': '1 hour',
  'recent.120': '2 hours',
  'recent.360': '6 hours',
  'recent.720': '12 hours',
  'recent.1440': '24 hours',
  'active.label': 'Active project retention',
  'active.current': 'Currently {value}. Projects move to Inactive Projects after this window.',
  'active.1': '1 day',
  'active.3': '3 days',
  'active.7': '7 days',
  'active.14': '14 days',
  'active.30': '30 days',
  'settings.unavailable': 'Settings are unavailable right now. Default values stay active.',
  'settings.error': 'Could not save settings. Try again.'
}

export const SETTINGS_ZH: Record<string, string> = {
  'history.group': '提示历史',
  'history.groupHint': '在输入框中按住所选修饰键再按 ↑ 或 ↓，即可切换本会话已发送的提示。普通方向键保持原有编辑行为，在多行提示内也可正常移动。选择「⌘ / Ctrl」在 macOS 上对应 ⌘，在 Windows 和 Linux 上对应 Ctrl。选择「⌥ / Alt」在 macOS 上对应 ⌥，在 Windows 和 Linux 上对应 Alt。',
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
  'dynamic.groupHint': '设置已完成会话在「运行中与最近」中的保留时长，以及项目在「活跃项目」中的保留时长。运行中的会话始终显示并计为活跃。',
  'recent.label': '已完成会话保留时长',
  'recent.current': '当前为 {value}。超时后，已完成会话会移出「运行中与最近」。',
  'recent.60': '1 小时',
  'recent.120': '2 小时',
  'recent.360': '6 小时',
  'recent.720': '12 小时',
  'recent.1440': '24 小时',
  'active.label': '活跃项目保留时长',
  'active.current': '当前为 {value}。超时后，项目会移入「非活跃项目」。',
  'active.1': '1 天',
  'active.3': '3 天',
  'active.7': '7 天',
  'active.14': '14 天',
  'active.30': '30 天',
  'settings.unavailable': '设置暂不可用，当前保持默认设置。',
  'settings.error': '保存设置失败，请重试。'
}
