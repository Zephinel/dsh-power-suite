/**
 * Copy dictionary for the interrupted-task affordances.
 *
 * The namespace and both dictionaries used to sit inline in `src/client.js`;
 * keys and visible strings are unchanged.
 *
 * @module
 */

/** Copy namespace for the interrupted-task affordances. */
export const INTERRUPTED_NS = 'powerSuiteInterrupted'

export const INTERRUPTED_EN: Record<string, string> = {
  'badge.aria': 'Task did not finish',
  'badge.title': 'The last task did not finish. Hover this session to continue it.',
  'badge.title.subagent': 'A delegated subagent task did not finish. Hover this session to continue it.',
  'continue.aria': 'Continue the unfinished task',
  'continue.prompt': 'Continue the unfinished task.',
  'continue.summary': 'Continue unfinished task',
  'continue.failed': 'Could not continue the task. Try again.'
}

export const INTERRUPTED_ZH: Record<string, string> = {
  'badge.aria': '任务未完成',
  'badge.title': '上一个任务未完成，悬停此会话可继续。',
  'badge.title.subagent': '委派的子任务未完成，悬停此会话可继续。',
  'continue.aria': '继续未完成的任务',
  'continue.prompt': '继续完成上一个任务。',
  'continue.summary': '继续未完成的任务',
  'continue.failed': '继续任务失败，请重试。'
}
