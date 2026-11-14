/**
 * Unit tests for the native session figures in the dynamic-Workspaces row
 * hover card (Session statistics, token usage, context occupancy).
 *
 * `src/client.js` is a browser classic script materialized in a `node:vm`
 * sandbox by `test/helpers/client-module.mjs`; the helpers are read from the
 * `dynamicWorkspacesStats` test-hook namespace, which is separate from the
 * annotation seam so that seam's keys stay frozen. Every expected string below
 * is the native shell's own recipe, copied from the installed
 * `dsh-client-ui-chat` / `dsh-client-ui-conversation` clients:
 *
 * - `formatTokens` (compact `517 / 12.2K / 517K / 1.2M`),
 * - `formatExactTokens` (locale digit grouping),
 * - `formatDuration` (`45.2s` / `2m42s`),
 * - `formatTokensPerSecond` (whole from ten up, one decimal below),
 * - `formatCacheHitPercent` (never rounds a partial hit to 100),
 * - `contextOccupancy` (`projectedTokens ?? pressureTokens`, needs a window).
 *
 * Data-only behavior (rendering, hover timing, one-shot projection refresh)
 * belongs to `test/browser/sidebar.e2e.mjs`; this file keeps the arithmetic
 * and the section-omission rules deterministic.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientModule } from './helpers/client-module.mjs'

const client = loadClientModule()
const stats = client.hooks?.dynamicWorkspacesStats
const production = loadClientModule({ hooksFlag: false })

/**
 * Build a translate seat from one dictionary map exactly like the locale
 * service: `t(key, params)` substitutes `{name}` placeholders.
 * @param {Record<string, string>} templates - copy dictionary.
 * @returns {Function} translate function.
 */
function translate(templates) {
  return (key, params) => {
    const template = templates[key]
    assert.notEqual(template, undefined, `missing dictionary key ${key}`)
    if (params === undefined || params === null) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      assert.notEqual(params[name], undefined, `missing interpolation "${name}" for ${key}`)
      return String(params[name])
    })
  }
}

const en = statistics => translate(statistics.DW_EN)
const zh = statistics => translate(statistics.DW_ZH)

test('dynamic-Workspaces statistics seam is present and production stays inert', () => {
  assert.notEqual(stats, undefined, 'dynamicWorkspacesStats test seam is missing from src/client.js')
  assert.equal(production.hooks, undefined, 'the test-hook seam must stay inert when the flag is not set')
  assert.equal(typeof stats.dwProjectionSections, 'function')
  assert.equal(typeof stats.dwNeedsProjectionRead, 'function')
})

test('EN and ZH dictionaries define the same session-figure keys', () => {
  const enKeys = Object.keys(stats.DW_EN).sort()
  const zhKeys = Object.keys(stats.DW_ZH).sort()
  assert.deepEqual(zhKeys, enKeys)
  for (const key of [
    'stats.title', 'stats.counts', 'stats.llmTime', 'stats.toolTime', 'stats.ttft', 'stats.speed',
    'usage.title', 'usage.cacheHit', 'usage.input', 'usage.cacheRead', 'usage.cacheWrite', 'usage.output',
    'usage.count', 'context.aria', 'context.system', 'context.tools', 'context.messages',
    'tokensPerSecond', 'number.thousand', 'number.million', 'number.groupSeparator',
    'duration.compactSeconds', 'duration.compactMinutes'
  ]) {
    assert.equal(typeof stats.DW_EN[key], 'string', `EN copy for ${key}`)
    assert.equal(typeof stats.DW_ZH[key], 'string', `ZH copy for ${key}`)
  }
  // Native strings, not paraphrases.
  assert.equal(stats.DW_EN['stats.counts'], '{turns} turns {steps} steps')
  assert.equal(stats.DW_ZH['stats.counts'], '{turns} 轮 {steps} 步')
  assert.equal(stats.DW_EN['context.aria'], '{percent} of context used')
  assert.equal(stats.DW_ZH['context.aria'], '上下文已用 {percent}')
  assert.equal(stats.DW_EN['usage.count'], '{count} tok')
})

test('compact token counts match the native boundaries', () => {
  const t = en(stats)
  assert.equal(stats.dwFormatCompactTokens(0, t), '0')
  assert.equal(stats.dwFormatCompactTokens(999, t), '999')
  assert.equal(stats.dwFormatCompactTokens(1000, t), '1K')
  assert.equal(stats.dwFormatCompactTokens(1200, t), '1.2K')
  assert.equal(stats.dwFormatCompactTokens(12200, t), '12.2K')
  assert.equal(stats.dwFormatCompactTokens(517000, t), '517K')
  assert.equal(stats.dwFormatCompactTokens(1200000, t), '1.2M')
  assert.equal(stats.dwFormatCompactTokens(12345678, t), '12.3M')
  // zh keeps the shared native K/M templates.
  assert.equal(stats.dwFormatCompactTokens(240500, zh(stats)), '241K')
})

test('exact token counts use the native grouped digits', () => {
  const t = en(stats)
  assert.equal(stats.dwFormatExactTokens(0, t), '0')
  assert.equal(stats.dwFormatExactTokens(999, t), '999')
  assert.equal(stats.dwFormatExactTokens(1000, t), '1,000')
  assert.equal(stats.dwFormatExactTokens(5203456, t), '5,203,456')
  assert.equal(stats.dwFormatExactTokens(1234567890, t), '1,234,567,890')
})

test('durations follow the native compact recipe', () => {
  const t = en(stats)
  assert.equal(stats.dwFormatStatsDuration(0, t), '0s')
  assert.equal(stats.dwFormatStatsDuration(59940, t), '59.9s')
  assert.equal(stats.dwFormatStatsDuration(59960, t), '60s')
  assert.equal(stats.dwFormatStatsDuration(60000, t), '1m0s')
  assert.equal(stats.dwFormatStatsDuration(162400, t), '2m42s')
  assert.equal(stats.dwFormatStatsDuration(3600000, t), '60m0s')
  const zhT = zh(stats)
  assert.equal(stats.dwFormatStatsDuration(59940, zhT), '59.9秒')
  assert.equal(stats.dwFormatStatsDuration(162400, zhT), '2分42秒')
})

test('TPS follows the native whole-from-ten rule', () => {
  const t = en(stats)
  assert.equal(stats.dwFormatTps(100, 0, t), null, 'no decode time means no speed row')
  assert.equal(stats.dwFormatTps(0, 1000, t), '0 tok/s')
  assert.equal(stats.dwFormatTps(99, 10000, t), '9.9 tok/s')
  assert.equal(stats.dwFormatTps(177698, 1746432, t), '102 tok/s')
  assert.equal(stats.dwFormatTps(1200, 1000, t), '1200 tok/s')
})

test('cache-hit percentage is honest about partial hits', () => {
  // No billed prompt input: no cache-hit row.
  assert.equal(stats.dwCacheHitPercent(0, 0), null)
  assert.equal(stats.dwCacheHitPercent(0, 1000), '0')
  // Full hit.
  assert.equal(stats.dwCacheHitPercent(1000, 1000), '100')
  // Ordinary partial hits keep integer rounding.
  assert.equal(stats.dwCacheHitPercent(960, 1000), '96')
  assert.equal(stats.dwCacheHitPercent(995, 1000), '99.5')
  assert.equal(stats.dwCacheHitPercent(9999, 10000), '99.99')
  // The native 99.9… case must not round up to 100.
  assert.equal(stats.dwCacheHitPercent(999999, 1000000), '99.9999')
  const ratio = 39590528 / (426524 + 39590528 + 0)
  assert.equal(stats.dwCacheHitPercent(39590528, 426524 + 39590528 + 0), String(Math.round(ratio * 100)))
})

test('billed input and context occupancy follow the native seams', () => {
  assert.equal(stats.dwBilledInputTokens({ uncachedInputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3 }), 6)
  assert.equal(stats.dwContextOccupancy(null), null)
  assert.equal(stats.dwContextOccupancy({}), null, 'needs both used tokens and a window')
  assert.equal(stats.dwContextOccupancy({ pressureTokens: 100 }), null, 'missing window hides the section')
  assert.equal(stats.dwContextOccupancy({ contextWindow: 1000 }), null, 'missing used tokens hides the section')
  // `projectedTokens` wins over the older pressure estimate.
  assert.deepEqual(
    { ...stats.dwContextOccupancy({ pressureTokens: 100, projectedTokens: 250, contextWindow: 1000 }) },
    { percent: 25, usedTokens: 250, contextWindow: 1000 }
  )
  assert.deepEqual(
    { ...stats.dwContextOccupancy({ pressureTokens: 240000, contextWindow: 1000000 }) },
    { percent: 24, usedTokens: 240000, contextWindow: 1000000 }
  )
  // Percent is clamped and rounded like the native meter.
  assert.equal(stats.dwContextOccupancy({ pressureTokens: 2000, contextWindow: 1000 }).percent, 100)
  assert.equal(stats.dwContextOccupancy({ pressureTokens: 1, contextWindow: 3 }).percent, 33)
  assert.equal(stats.dwContextOccupancy({ pressureTokens: 2, contextWindow: 3 }).percent, 67)
})

test('section normalization hides empty Sessions and keeps zero rows out', () => {
  const empty = stats.dwProjectionSections({})
  assert.equal(empty.stats, null)
  assert.equal(empty.usage, null)
  assert.equal(empty.context, null)
  assert.equal(stats.dwProjectionSections(undefined).stats, null)
  assert.equal(stats.dwProjectionSections(null).usage, null)

  // No steps means no statistics section, exactly like the native pill.
  const noSteps = stats.dwProjectionSections({ sessionStats: { turns: 2, steps: 0, llmMs: 4000 } })
  assert.equal(noSteps.stats, null)
  // Steps present but no timing rows yet: the section stays (counts line only).
  const countsOnly = stats.dwProjectionSections({ sessionStats: { turns: 1, steps: 3 } })
  assert.deepEqual(
    { ...countsOnly.stats },
    { turns: 1, steps: 3, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }
  )
  // Malformed/missing numbers degrade to 0 rather than NaN.
  assert.equal(stats.dwProjectionSections({ sessionStats: { turns: '2', steps: 5, llmMs: null } }).stats.turns, 0)

  // Nothing billed and no output means no token section.
  assert.equal(stats.dwProjectionSections({ tokenUsage: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } }).usage, null)
  const usage = stats.dwProjectionSections({
    tokenUsage: { uncachedInputTokens: 426524, cacheReadTokens: 39590528, cacheWriteTokens: 0, outputTokens: 177698 }
  }).usage
  assert.equal(usage.billedInputTokens, 40017052)
  assert.equal(usage.totalTokens, 40194750)
  assert.equal(usage.cacheHitPercent, '99')
  assert.equal(usage.cacheWriteTokens, 0)

  // Context needs the provider pressure; the heuristic breakdown may be absent.
  const pressureOnly = stats.dwProjectionSections({ contextPressure: { pressureTokens: 450947, contextWindow: 1000000 } }).context
  assert.equal(pressureOnly.percent, 45)
  assert.equal(pressureOnly.breakdown, null)
  const withBreakdown = stats.dwProjectionSections({
    contextPressure: { pressureTokens: 450947, projectedTokens: 452000, contextWindow: 1000000 },
    contextBreakdown: { systemTokens: 2074, toolsTokens: 13536, messageTokens: 355890 }
  }).context
  assert.equal(withBreakdown.usedTokens, 452000, 'projected estimate wins')
  assert.deepEqual({ ...withBreakdown.breakdown }, { systemTokens: 2074, toolsTokens: 13536, messageTokens: 355890 })
  // An empty pressure value ({}) hides the section.
  assert.equal(stats.dwProjectionSections({ contextPressure: {} }).context, null)
})

test('one-shot projection read is only requested for unseeded idle records', () => {
  const full = { sessionStats: {}, tokenUsage: {}, contextPressure: {}, contextBreakdown: {} }
  assert.equal(stats.dwNeedsProjectionRead(undefined), true, 'missing record')
  assert.equal(stats.dwNeedsProjectionRead(null), true)
  assert.equal(stats.dwNeedsProjectionRead({}), true, 'no values yet')
  assert.equal(stats.dwNeedsProjectionRead({ values: {} }), true, 'empty values')
  assert.equal(stats.dwNeedsProjectionRead({ values: { sessionStats: {} } }), true, 'context values still missing')
  assert.equal(stats.dwNeedsProjectionRead({ values: { sessionStats: {}, contextBreakdown: {} } }), false, 'fully seeded')
  assert.equal(stats.dwNeedsProjectionRead({ values: full, state: 'idle' }), false, 'live Sessions are push-seeded')
  // Never retry a request already attempted, even when the values stayed absent.
  for (const state of ['loading', 'ready', 'error', 'migration-required']) {
    assert.equal(stats.dwNeedsProjectionRead({ values: {}, state }), false, `state ${state} must not be re-read`)
  }
  // Once both figure values are present, an error/ready marker is irrelevant.
  assert.equal(stats.dwNeedsProjectionRead({ values: { sessionStats: {}, contextBreakdown: {} }, state: 'error' }), false)
})

test('identity glyphs are swapped without touching the rest of the marker recipe', () => {
  const source = client.source
  // Header all-complete indicator: DeepSeek brand glyph in the same 14 px slot.
  assert.match(source, /className: 'psd-spark' \}, RemixGlyph\(DW_DEEPSEEK_FILL, 14\)\)/)
  // Read/acknowledged parent row: the sparkling glyph fills the leading-glyph
  // cell at the same 0.82 path scale (interrupted rows swap it for the badge).
  assert.match(source, /className: 'psd-run-brand'[\s\S]{0,200}RemixGlyph\(DW_SPARKLING_LINE, 14, undefined, 0\.82\)/)
  // Nested subagent rows keep their robot glyph.
  assert.match(source, /className: 'psd-child-brand'[\s\S]{0,200}RemixGlyph\(DW_ROBOT_2_LINE, 12\)/)
  // The running (blue pulse) and unread-completion (green done dot) branches are untouched.
  assert.equal((source.match(/StateDot, \{ state: 'ongoing', size: 14, className: 'psd-run-glyph' \}/g) ?? []).length, 1)
  assert.equal((source.match(/StateDot, \{ state: 'done', size: 14, className: 'psd-run-glyph' \}/g) ?? []).length, 1)
  assert.equal((source.match(/className: 'psd-pulse'/g) ?? []).length, 1)
})
