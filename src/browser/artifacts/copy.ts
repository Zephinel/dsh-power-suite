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
  'list.refresh': 'Refresh',
  'list.loading': 'Loading…',
  'list.empty.title': 'No artifacts yet',
  'list.empty.hint': 'Files this session writes, or delivers with present, appear here.',
  'list.empty.filtered': 'No artifacts in this filter',
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
  'footer.note': 'Open previews the file in the right Sidebar. Download saves the file so the system can hand it to a local app.',
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
  'list.refresh': '刷新',
  'list.loading': '加载中…',
  'list.empty.title': '还没有产物',
  'list.empty.hint': '本会话写入的文件，或用 present 交付的文件会出现在这里。',
  'list.empty.filtered': '此筛选下没有产物',
  'list.error.title': '产物加载失败',
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
  'footer.note': '「打开」在右侧边栏中预览；「下载」保存文件后由系统交给本地应用。',
  'preview.loading': '正在加载预览…',
  'preview.unavailable': '此文件暂无预览',
  'preview.truncated': '预览已截断',
  'preview.resize': '拖动调整预览大小'
}
