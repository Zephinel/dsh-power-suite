/**
 * Native session figures for the dynamic-Workspaces row hover card.
 *
 * The card shows the Session statistics, token usage and context occupancy in
 * the same recipe as the shell's Session dialogs and composer ContextMeter.
 * The values arrive as Host projections (`sessionStats`, `tokenUsage`,
 * `contextPressure`, `contextBreakdown`) on the Session list snapshot; every
 * formatter below copies the native client's arithmetic verbatim. These helpers
 * are pure: plain data plus the namespace-bound translate seat, no React and no
 * DOM.
 *
 * The feature's full copy dictionary lives here too, so both locales stay one
 * literal edit and the browser entry only imports them for registration.
 *
 * @module
 */

/** Namespace-bound translate seat (`t(key, params)`). */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Copy dictionary for the dynamic Workspaces buckets and the running panel. */
export const DW_EN: Record<string, string> = {
  'panel.title': 'Running & recent',
  'panel.viewAll': 'View all {count}',
  'panel.showLess': 'Show less',
  'panel.collapse': 'Collapse recent sessions',
  'panel.expand': 'Expand recent sessions',
  'panel.open': 'Open {title}',
  'pin.pin': 'Pin session',
  'pin.unpin': 'Unpin session',
  'row.more': 'Session actions for {title}',
  'row.pending': 'Waiting for your answer',
  'panel.expandChildren': 'Show subagents of {title}',
  'panel.collapseChildren': 'Hide subagents of {title}',
  'panel.empty.title': 'No running sessions',
  'panel.empty.hint': 'Running sessions across all workspaces appear here.',
  'hover.running': 'Running',
  'hover.done': 'Finished',
  'hover.updated': 'Last active',
  'hover.subagents': '{count} subagents',
  'hover.subagentsOne': '1 subagent',
  'hover.newSession': 'New session in this folder',
  'stats.title': 'Session statistics',
  'stats.counts': '{turns} turns {steps} steps',
  'stats.llmTime': 'LLM time',
  'stats.toolTime': 'Tool time',
  'stats.ttft': 'Avg time to first token (TTFT)',
  'stats.speed': 'Tokens per second (TPS)',
  'usage.title': 'Token usage',
  'usage.cacheHit': 'Cache hit',
  'usage.input': 'Uncached input',
  'usage.cacheRead': 'Cached input',
  'usage.cacheWrite': 'Cache write',
  'usage.output': 'Output',
  'usage.count': '{count} tok',
  'context.aria': '{percent} of context used',
  'context.system': 'System prompt',
  'context.tools': 'Tool definitions',
  'context.messages': 'Messages',
  'tokensPerSecond': '{tps} tok/s',
  'number.thousand': '{value}K',
  'number.million': '{value}M',
  'number.groupSeparator': ',',
  'duration.compactSeconds': '{seconds}s',
  'duration.compactMinutes': '{minutes}m{seconds}s',
  'count': '{count}',
  'group.active': 'Active Projects',
  'group.inactive': 'Inactive Projects',
  'group.toggleActive': 'Toggle active projects',
  'group.toggleInactive': 'Toggle inactive projects',
  'group.untitled': 'Untitled project',
  'group.ungrouped': 'Ungrouped',
  'time.now': 'now',
  'time.min': '{n}min',
  'time.hour': '{n}h',
  'time.day': '{n}d',
  'time.month': '{n}mo',
  'time.year': '{n}y',
  'duration.seconds': '{s}s',
  'duration.minutes': '{m}m {s}s',
  'duration.hours': '{h}h {m}m'
}
export const DW_ZH: Record<string, string> = {
  'panel.title': '运行中与最近',
  'panel.viewAll': '查看全部 {count}',
  'panel.showLess': '收起',
  'panel.collapse': '收起最近会话',
  'panel.expand': '展开最近会话',
  'panel.open': '打开 {title}',
  'pin.pin': '固定会话',
  'pin.unpin': '取消固定',
  'row.more': '{title} 的会话操作',
  'row.pending': '正在等待你的回答',
  'panel.expandChildren': '展开 {title} 的子代理',
  'panel.collapseChildren': '收起 {title} 的子代理',
  'panel.empty.title': '没有运行中的会话',
  'panel.empty.hint': '所有工作区中运行中的会话会显示在这里。',
  'hover.running': '运行中',
  'hover.done': '已完成',
  'hover.updated': '最后活动',
  'hover.subagents': '{count} 个子代理',
  'hover.subagentsOne': '1 个子代理',
  'hover.newSession': '在此文件夹新建会话',
  'stats.title': '会话统计',
  'stats.counts': '{turns} 轮 {steps} 步',
  'stats.llmTime': '模型用时',
  'stats.toolTime': '工具调用用时',
  'stats.ttft': '首 token 平均（TTFT）',
  'stats.speed': '输出速度（TPS）',
  'usage.title': 'Token 用量',
  'usage.cacheHit': '缓存命中',
  'usage.input': '未缓存输入',
  'usage.cacheRead': '缓存读取',
  'usage.cacheWrite': '缓存写入',
  'usage.output': '输出',
  'usage.count': '{count} tok',
  'context.aria': '上下文已用 {percent}',
  'context.system': '系统提示词',
  'context.tools': '工具定义',
  'context.messages': '对话消息',
  'tokensPerSecond': '{tps} tok/s',
  'number.thousand': '{value}K',
  'number.million': '{value}M',
  'number.groupSeparator': ',',
  'duration.compactSeconds': '{seconds}秒',
  'duration.compactMinutes': '{minutes}分{seconds}秒',
  'count': '{count}',
  'group.active': '活跃项目',
  'group.inactive': '非活跃项目',
  'group.toggleActive': '收起或展开活跃项目',
  'group.toggleInactive': '收起或展开非活跃项目',
  'group.untitled': '未命名项目',
  'group.ungrouped': '未分组',
  'time.now': '刚刚',
  'time.min': '{n}分钟',
  'time.hour': '{n}小时',
  'time.day': '{n}天',
  'time.month': '{n}个月',
  'time.year': '{n}年',
  'duration.seconds': '{s}秒',
  'duration.minutes': '{m}分{s}秒',
  'duration.hours': '{h}时{m}分'
}

/** One normalized `sessionStats` projection. */
export interface SessionStatsFigures {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
}

/** One normalized `tokenUsage` projection. */
export interface TokenUsageFigures {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  billedInputTokens: number
  totalTokens: number
  cacheHitPercent: string | null
}

/** Bounded context occupancy derived from the pressure fields. */
export interface ContextOccupancy {
  percent: number
  usedTokens: number
  contextWindow: number
}

/** One normalized context section, with the heuristic breakdown when present. */
export interface ContextFigures extends ContextOccupancy {
  breakdown: { systemTokens: number, toolsTokens: number, messageTokens: number } | null
}

/** The three hover-card figure sections (each null when absent). */
export interface ProjectionSections {
  stats: SessionStatsFigures | null
  usage: TokenUsageFigures | null
  context: ContextFigures | null
}

/**
 * Compact token count in the native style: `517 / 12.2K / 517K / 1.2M`.
 * @param value - non-negative token count.
 * @param t - namespace-bound translate.
 * @returns compact display text.
 */
export function dwFormatCompactTokens(value: number, t: Translate): string {
  const scaled = (candidate: number) => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1e3) return String(value)
  if (value < 1e6) return t('number.thousand', { value: scaled(value / 1e3) })
  return t('number.million', { value: scaled(value / 1e6) })
}

/**
 * Exact token count with the native locale-owned digit grouping.
 * @param value - non-negative token count.
 * @param t - namespace-bound translate.
 * @returns grouped display text.
 */
export function dwFormatExactTokens(value: number, t: Translate): string {
  const digits = String(value)
  const groups = []
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end))
  }
  return groups.join(t('number.groupSeparator'))
}

/**
 * Compact duration in the native recipe: `45.2s` under a minute, `2m42s`
 * from there on.
 * @param ms - duration in milliseconds.
 * @param t - namespace-bound translate.
 * @returns duration text.
 */
export function dwFormatStatsDuration(ms: number, t: Translate): string {
  const seconds = ms / 1e3
  if (seconds < 60) return t('duration.compactSeconds', { seconds: Math.round(seconds * 10) / 10 })
  const whole = Math.round(seconds)
  return t('duration.compactMinutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

/**
 * Decode throughput in the native recipe: whole tokens from ten up, one
 * decimal below, with the `tok/s` unit when the decode time is known.
 * @param decodeTokens - tokens produced while decoding.
 * @param decodeMs - decode time in milliseconds.
 * @param t - namespace-bound translate.
 * @returns display text, or null when there is no decode time.
 */
export function dwFormatTps(decodeTokens: number, decodeMs: number, t: Translate): string | null {
  if (!(decodeMs > 0)) return null
  const tps = Math.max(0, decodeTokens / (decodeMs / 1e3))
  const displayed = tps >= 10 ? String(Math.round(tps)) : String(Math.round(tps * 10) / 10)
  return t('tokensPerSecond', { tps: displayed })
}

/** Round a cache-read ratio to exact percentage units, positive ties up. */
function dwRoundedPercentUnits(cacheReadTokens: number, denominator: number, decimalPlaces: number): number {
  const scale = (decimalPlaces === 0 ? 1 : 10) * 100
  const doubledScale = scale * 2
  const denominatorQuotient = Math.floor(denominator / doubledScale)
  const denominatorRemainder = denominator % doubledScale
  let lower = 0
  let upper = scale
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2)
    const factor = candidate * 2 - 1
    if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale)) lower = candidate
    else upper = candidate - 1
  }
  return lower
}

/** Render percentage units with an optional tenths digit. */
function dwDisplayPercentUnits(units: number, decimalPlaces: number): string {
  if (decimalPlaces === 0) return String(units)
  const whole = Math.floor(units / 10)
  const tenths = units % 10
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`
}

/**
 * Display-ready cache-hit share that never rounds a partial hit up to 100
 * (the native honesty case: 999 999 / 1 000 000 reads `99.9999`, not
 * `100`). A full hit returns `100`; no billed input returns null.
 *
 * Total for inconsistent readings as well: a cache-read count above the
 * billed input total (impossible when the prompt-side buckets are disjoint),
 * a negative count, or a non-finite number returns null — there is no honest
 * share to show, and the row is simply omitted. The share is never clamped to
 * 100, because that would turn bad data into a perfect hit.
 * @param cacheReadTokens - prompt tokens served from cache.
 * @param billedInputTokens - all prompt-side billing buckets.
 * @returns percentage text without the percent sign, or null when unknown.
 */
export function dwCacheHitPercent(cacheReadTokens: number, billedInputTokens: number): string | null {
  if (!Number.isFinite(cacheReadTokens) || !Number.isFinite(billedInputTokens)) return null
  if (cacheReadTokens < 0 || billedInputTokens < 0) return null
  if (cacheReadTokens > billedInputTokens) return null
  if (billedInputTokens === 0) return null
  const missedInputTokens = billedInputTokens - cacheReadTokens
  if (missedInputTokens === 0) return '100'
  const roundedUnits = dwRoundedPercentUnits(cacheReadTokens, billedInputTokens, 0)
  if (roundedUnits < 100) return dwDisplayPercentUnits(roundedUnits, 0)
  let distinguishingPlaces = 1
  let scaledDoubleGap = missedInputTokens * 200
  const denominatorTens = Math.floor(billedInputTokens / 10)
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10
    distinguishingPlaces += 1
  }
  const denominatorOnes = billedInputTokens % 10
  let roundedLoss = 5
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10)
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss
      break
    }
  }
  return `99.${'9'.repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`
}

/** Sum the three disjoint prompt-side billing buckets. */
export function dwBilledInputTokens(usage: {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Bounded context occupancy from the independently updated pressure fields.
 * @param pressure - latest `contextPressure` value.
 * @returns occupancy, or null until both numerator and capacity are known.
 */
export function dwContextOccupancy(pressure: unknown): ContextOccupancy | null {
  if (pressure === null || typeof pressure !== 'object') return null
  const source = pressure as Record<string, unknown>
  const usedTokens = source.projectedTokens ?? source.pressureTokens
  if (typeof usedTokens !== 'number' || !Number.isFinite(usedTokens)) return null
  const contextWindow = source.contextWindow
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow)) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)),
    usedTokens,
    contextWindow
  }
}

/** A finite non-negative metric, else 0 (projection values can be absent). */
function dwMetric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** A finite non-negative whole count, else 0. */
function dwCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Normalize one `sessionStats` projection into display data, applying the
 * native visibility rule (no section before the Session took a step).
 * @param stats - `sessionStats` projection value.
 * @returns normalized stats, or null when hidden.
 */
function dwNormalizeSessionStats(stats: unknown): SessionStatsFigures | null {
  if (stats === null || typeof stats !== 'object') return null
  const source = stats as Record<string, unknown>
  const normalized: SessionStatsFigures = {
    turns: dwCount(source.turns),
    steps: dwCount(source.steps),
    llmMs: dwMetric(source.llmMs),
    toolMs: dwMetric(source.toolMs),
    ttftMs: dwMetric(source.ttftMs),
    ttftSteps: dwCount(source.ttftSteps),
    decodeMs: dwMetric(source.decodeMs),
    decodeTokens: dwMetric(source.decodeTokens)
  }
  return normalized.steps === 0 ? null : normalized
}

/**
 * Normalize one `tokenUsage` projection into display data. The whole-dialog
 * emptiness rule is native: no section when the Session billed nothing.
 * @param usage - `tokenUsage` projection value.
 * @returns normalized usage, or null when hidden.
 */
function dwNormalizeTokenUsage(usage: unknown): TokenUsageFigures | null {
  if (usage === null || typeof usage !== 'object') return null
  const source = usage as Record<string, unknown>
  const normalized: TokenUsageFigures = {
    uncachedInputTokens: dwCount(source.uncachedInputTokens),
    cacheReadTokens: dwCount(source.cacheReadTokens),
    cacheWriteTokens: dwCount(source.cacheWriteTokens),
    outputTokens: dwCount(source.outputTokens),
    billedInputTokens: 0,
    totalTokens: 0,
    cacheHitPercent: null
  }
  normalized.billedInputTokens = dwBilledInputTokens(normalized)
  if (normalized.billedInputTokens === 0 && normalized.outputTokens === 0) return null
  normalized.totalTokens = normalized.billedInputTokens + normalized.outputTokens
  normalized.cacheHitPercent = dwCacheHitPercent(normalized.cacheReadTokens, normalized.billedInputTokens)
  return normalized
}

/**
 * Normalize the context projections into display data. The heuristic
 * breakdown is a separate estimator: it is only ever shown as its own
 * `~`-prefixed composition rows, never as parts of the provider pressure.
 * @param pressure - `contextPressure` projection value.
 * @param breakdown - `contextBreakdown` projection value.
 * @returns normalized context, or null when hidden.
 */
function dwNormalizeContext(pressure: unknown, breakdown: unknown): ContextFigures | null {
  const occupancy = dwContextOccupancy(pressure)
  if (occupancy === null) return null
  const source = breakdown as Record<string, unknown> | null
  const composition = breakdown !== null && typeof breakdown === 'object'
    ? {
        systemTokens: dwCount(source!.systemTokens),
        toolsTokens: dwCount(source!.toolsTokens),
        messageTokens: dwCount(source!.messageTokens)
      }
    : null
  return { ...occupancy, breakdown: composition }
}

/**
 * Whether a projection record still needs the one-shot cold read: the
 * statistics/context values have not arrived yet and no read has been
 * attempted (or is in flight). Live Sessions are push-seeded and need no
 * request; error / migration states are never retried.
 * @param record - `projectionsBySession[id]`.
 * @returns whether to call `refreshProjections` once.
 */
export function dwNeedsProjectionRead(record: unknown): boolean {
  if (record === null || record === undefined || typeof record !== 'object') return true
  const values = (record as Record<string, unknown>).values
  if (values === null || typeof values !== 'object') return true
  const seeded = values as Record<string, unknown>
  if (seeded.sessionStats !== undefined && seeded.contextBreakdown !== undefined) return false
  const state = (record as Record<string, unknown>).state
  return state === undefined || state === null || state === 'idle'
}

/**
 * Shape the three hover-card figure sections from one Session's projection
 * values. Each section is omitted entirely when its data is absent.
 * @param values - projection values for the Session.
 * @returns the three normalized sections.
 */
export function dwProjectionSections(values: unknown): ProjectionSections {
  const source = values !== null && typeof values === 'object' ? values as Record<string, unknown> : {}
  return {
    stats: dwNormalizeSessionStats(source.sessionStats),
    usage: dwNormalizeTokenUsage(source.tokenUsage),
    context: dwNormalizeContext(source.contextPressure, source.contextBreakdown)
  }
}
