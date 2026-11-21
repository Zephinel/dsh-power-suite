/**
 * Copy dictionaries for the Session-artifacts surface.
 *
 * The Files-header action and its in-pane list share one namespace, so the
 * entry registers both dictionaries once and every injected `t` resolves the
 * same keys. Strings are unchanged from the inline entry copy.
 *
 * @module
 */

/** Copy namespace for the Files-header Artifacts action and its list. */
export const ARTIFACTS_NS = 'sessionArtifacts'

/** English copy for the artifacts list and Files-header action. */
export const ARTIFACTS_EN: Record<string, string> = {
  'panel.title': 'Artifacts',
  'action.back': 'Back to files',
  'list.count': '{count} artifacts',
  'list.countOne': '1 artifact',
  'list.countOf': '{shown} of {total} artifacts',
  'list.countOfOne': '{shown} of 1 artifact',
  'list.refresh': 'Refresh',
  'list.loading': 'Loading…',
  'list.empty.title': 'No artifacts yet',
  'list.empty.hint': 'Files created or shared in this session appear here.',
  'list.empty.filtered': 'No artifacts match this filter',
  'list.error.title': 'Could not load artifacts',
  'list.retry': 'Retry',
  'filter.label': 'Artifact source',
  'filter.all': 'All',
  'filter.generated': 'Generated',
  'filter.provided': 'Provided',
  'meta.presented': 'Delivered',
  'meta.generated': 'Generated',
  'meta.provided': 'Provided',
  'meta.turn': 'turn {turn}',
  'meta.prompt': 'prompt {prompt}',
  'action.open': 'Open',
  'action.download': 'Download',
  'action.copy': 'Copy link',
  'action.copyContent': 'Copy content',
  'action.copyImage': 'Copy image',
  'action.copied': 'Copied',
  'footer.note': 'Open previews the file in the right sidebar. Download saves the file so you can open it in a local app.',
  'preview.loading': 'Loading preview…',
  'preview.unavailable': 'No preview available',
  'preview.truncated': 'Preview truncated',
  'preview.resize': 'Resize preview'
}

/** Chinese copy for the artifacts list and Files-header action. */
export const ARTIFACTS_ZH: Record<string, string> = {
  'panel.title': '产物',
  'action.back': '返回文件',
  'list.count': '{count} 个产物',
  'list.countOne': '1 个产物',
  'list.countOf': '显示 {shown} / 共 {total} 个产物',
  'list.countOfOne': '显示 {shown} / 共 1 个产物',
  'list.refresh': '刷新',
  'list.loading': '加载中…',
  'list.empty.title': '还没有产物',
  'list.empty.hint': '本会话生成或展示的文件会出现在这里。',
  'list.empty.filtered': '当前筛选下没有产物',
  'list.error.title': '无法加载产物',
  'list.retry': '重试',
  'filter.label': '产物来源',
  'filter.all': '全部',
  'filter.generated': '生成',
  'filter.provided': '用户提供',
  'meta.presented': '已交付',
  'meta.generated': '已生成',
  'meta.provided': '用户提供',
  'meta.turn': '第 {turn} 轮',
  'meta.prompt': '第 {prompt} 条提示',
  'action.open': '打开',
  'action.download': '下载',
  'action.copy': '复制链接',
  'action.copyContent': '复制内容',
  'action.copyImage': '复制图片',
  'action.copied': '已复制',
  'footer.note': '「打开」会在右侧边栏预览文件。「下载」会保存文件，方便用本地应用打开。',
  'preview.loading': '正在加载预览…',
  'preview.unavailable': '此文件暂无预览',
  'preview.truncated': '预览已截断',
  'preview.resize': '调整预览大小'
}
