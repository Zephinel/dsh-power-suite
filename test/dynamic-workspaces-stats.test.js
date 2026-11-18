/**
 * Unit tests for the native session figures in the dynamic-Workspaces row
 * hover card (Session statistics, token usage, context occupancy).
 *
 * The pure model lives in `src/browser/dynamic-workspaces/stats.ts`; this file
 * imports it directly (no vm seam). Every expected string below is the native
 * shell's own recipe, copied from the installed
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
import {
  DW_EN,
  DW_ZH,
  dwBilledInputTokens,
  dwCacheHitPercent,
  dwContextOccupancy,
  dwFormatCompactTokens,
  dwFormatExactTokens,
  dwFormatStatsDuration,
  dwFormatTps,
  dwNeedsProjectionRead,
  dwProjectionSections
} from '../src/browser/dynamic-workspaces/stats.ts'

/** The browser entry, read for source-level identity-glyph regressions. */
const client = loadClientModule()

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

const en = translate(DW_EN)
const zh = translate(DW_ZH)

test('EN and ZH dictionaries define the same session-figure keys', () => {
  const enKeys = Object.keys(DW_EN).sort()
  const zhKeys = Object.keys(DW_ZH).sort()
  assert.deepEqual(zhKeys, enKeys)
  for (const key of [
    'stats.title', 'stats.counts', 'stats.llmTime', 'stats.toolTime', 'stats.ttft', 'stats.speed',
    'usage.title', 'usage.cacheHit', 'usage.input', 'usage.cacheRead', 'usage.cacheWrite', 'usage.output',
    'usage.count', 'context.aria', 'context.system', 'context.tools', 'context.messages',
    'tokensPerSecond', 'number.thousand', 'number.million', 'number.groupSeparator',
    'duration.compactSeconds', 'duration.compactMinutes'
  ]) {
    assert.equal(typeof DW_EN[key], 'string', `EN copy for ${key}`)
    assert.equal(typeof DW_ZH[key], 'string', `ZH copy for ${key}`)
  }
  // Native strings, not paraphrases.
  assert.equal(DW_EN['stats.counts'], '{turns} turns {steps} steps')
  assert.equal(DW_ZH['stats.counts'], '{turns} 轮 {steps} 步')
  assert.equal(DW_EN['context.aria'], '{percent} of context used')
  assert.equal(DW_ZH['context.aria'], '上下文已用 {percent}')
  assert.equal(DW_EN['usage.count'], '{count} tok')
})

test('compact token counts match the native boundaries', () => {
  assert.equal(dwFormatCompactTokens(0, en), '0')
  assert.equal(dwFormatCompactTokens(999, en), '999')
  assert.equal(dwFormatCompactTokens(1000, en), '1K')
  assert.equal(dwFormatCompactTokens(1200, en), '1.2K')
  assert.equal(dwFormatCompactTokens(12200, en), '12.2K')
  assert.equal(dwFormatCompactTokens(517000, en), '517K')
  assert.equal(dwFormatCompactTokens(1200000, en), '1.2M')
  assert.equal(dwFormatCompactTokens(12345678, en), '12.3M')
  // zh keeps the shared native K/M templates.
  assert.equal(dwFormatCompactTokens(240500, zh), '241K')
})

test('exact token counts use the native grouped digits', () => {
  assert.equal(dwFormatExactTokens(0, en), '0')
  assert.equal(dwFormatExactTokens(999, en), '999')
  assert.equal(dwFormatExactTokens(1000, en), '1,000')
  assert.equal(dwFormatExactTokens(5203456, en), '5,203,456')
  assert.equal(dwFormatExactTokens(1234567890, en), '1,234,567,890')
})

test('durations follow the native compact recipe', () => {
  assert.equal(dwFormatStatsDuration(0, en), '0s')
  assert.equal(dwFormatStatsDuration(59940, en), '59.9s')
  assert.equal(dwFormatStatsDuration(59960, en), '60s')
  assert.equal(dwFormatStatsDuration(60000, en), '1m0s')
  assert.equal(dwFormatStatsDuration(162400, en), '2m42s')
  assert.equal(dwFormatStatsDuration(3600000, en), '60m0s')
  assert.equal(dwFormatStatsDuration(59940, zh), '59.9秒')
  assert.equal(dwFormatStatsDuration(162400, zh), '2分42秒')
})

test('TPS follows the native whole-from-ten rule', () => {
  assert.equal(dwFormatTps(100, 0, en), null, 'no decode time means no speed row')
  assert.equal(dwFormatTps(0, 1000, en), '0 tok/s')
  assert.equal(dwFormatTps(99, 10000, en), '9.9 tok/s')
  assert.equal(dwFormatTps(177698, 1746432, en), '102 tok/s')
  assert.equal(dwFormatTps(1200, 1000, en), '1200 tok/s')
})

test('cache-hit percentage is honest about partial hits', () => {
  // No billed prompt input: no cache-hit row.
  assert.equal(dwCacheHitPercent(0, 0), null)
  assert.equal(dwCacheHitPercent(0, 1000), '0')
  // Full hit.
  assert.equal(dwCacheHitPercent(1000, 1000), '100')
  // Ordinary partial hits keep integer rounding.
  assert.equal(dwCacheHitPercent(960, 1000), '96')
  assert.equal(dwCacheHitPercent(995, 1000), '99.5')
  assert.equal(dwCacheHitPercent(9999, 10000), '99.99')
  // The native 99.9… case must not round up to 100.
  assert.equal(dwCacheHitPercent(999999, 1000000), '99.9999')
  const ratio = 39590528 / (426524 + 39590528 + 0)
  assert.equal(dwCacheHitPercent(39590528, 426524 + 39590528 + 0), String(Math.round(ratio * 100)))
})

/**
 * The pre-fix cache-hit recipe, frozen as a behaviour oracle. For consistent
 * readings (0 <= cacheRead <= billed) the total function must keep returning
 * exactly these strings; the copy is never used for inconsistent input
 * because the old loop did not terminate there.
 * @param {number} cacheReadTokens - prompt tokens served from cache.
 * @param {number} billedInputTokens - all prompt-side billing buckets.
 * @returns {string | null} percentage text without the percent sign.
 */
function legacyCacheHitPercent(cacheReadTokens, billedInputTokens) {
  if (billedInputTokens === 0) return null
  const missedInputTokens = billedInputTokens - cacheReadTokens
  if (missedInputTokens === 0) return '100'
  const roundedUnits = legacyRoundedPercentUnits(cacheReadTokens, billedInputTokens, 0)
  if (roundedUnits < 100) return legacyDisplayPercentUnits(roundedUnits, 0)
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

/** Pre-fix bisection rounding, copied verbatim for the oracle. */
function legacyRoundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
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

/** Pre-fix percentage display, copied verbatim for the oracle. */
function legacyDisplayPercentUnits(units, decimalPlaces) {
  if (decimalPlaces === 0) return String(units)
  const whole = Math.floor(units / 10)
  const tenths = units % 10
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`
}

test('cache-hit percentage is total for inconsistent cache data', () => {
  // A cache-read count above the billed input total is impossible (the buckets
  // are disjoint). Before the guard, `missedInputTokens` went negative and the
  // 99.9… precision loop never terminated, hanging the hover card.
  assert.equal(dwCacheHitPercent(200, 100), null)
  assert.equal(dwCacheHitPercent(101, 100), null)
  assert.equal(dwCacheHitPercent(1, 0), null)
  // Negative and non-finite readings have no honest share either.
  assert.equal(dwCacheHitPercent(-1, 100), null)
  assert.equal(dwCacheHitPercent(50, -100), null)
  assert.equal(dwCacheHitPercent(Number.NaN, 100), null)
  assert.equal(dwCacheHitPercent(100, Number.NaN), null)
  assert.equal(dwCacheHitPercent(Number.POSITIVE_INFINITY, 100), null)
  assert.equal(dwCacheHitPercent(100, Number.POSITIVE_INFINITY), null)
  // Consistent readings keep the exact previous output.
  assert.equal(dwCacheHitPercent(1000, 1000), '100')
  assert.equal(dwCacheHitPercent(960, 1000), '96')
  assert.equal(dwCacheHitPercent(999999, 1000000), '99.9999')
})

test('cache-hit percentage matches the pre-fix recipe for consistent data', () => {
  let compared = 0
  for (let billed = 0; billed <= 120; billed += 1) {
    for (let cacheRead = 0; cacheRead <= billed; cacheRead += 1) {
      assert.equal(
        dwCacheHitPercent(cacheRead, billed),
        legacyCacheHitPercent(cacheRead, billed),
        `consistent input ${cacheRead}/${billed} changed`
      )
      compared += 1
    }
  }
  for (const [cacheRead, billed] of [
    [1, 3], [1, 1000], [999, 1000], [9999, 10000], [999999, 1000000],
    [999999999, 1000000000], [426524, 40017052], [39590528, 40017052]
  ]) {
    assert.equal(
      dwCacheHitPercent(cacheRead, billed),
      legacyCacheHitPercent(cacheRead, billed),
      `consistent input ${cacheRead}/${billed} changed`
    )
    compared += 1
  }
  assert.equal(compared, 7389, 'grid coverage')
})

test('billed input and context occupancy follow the native seams', () => {
  assert.equal(dwBilledInputTokens({ uncachedInputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3 }), 6)
  assert.equal(dwContextOccupancy(null), null)
  assert.equal(dwContextOccupancy({}), null, 'needs both used tokens and a window')
  assert.equal(dwContextOccupancy({ pressureTokens: 100 }), null, 'missing window hides the section')
  assert.equal(dwContextOccupancy({ contextWindow: 1000 }), null, 'missing used tokens hides the section')
  // `projectedTokens` wins over the older pressure estimate.
  assert.deepEqual(
    dwContextOccupancy({ pressureTokens: 100, projectedTokens: 250, contextWindow: 1000 }),
    { percent: 25, usedTokens: 250, contextWindow: 1000 }
  )
  assert.deepEqual(
    dwContextOccupancy({ pressureTokens: 240000, contextWindow: 1000000 }),
    { percent: 24, usedTokens: 240000, contextWindow: 1000000 }
  )
  // Percent is clamped and rounded like the native meter.
  assert.equal(dwContextOccupancy({ pressureTokens: 2000, contextWindow: 1000 }).percent, 100)
  assert.equal(dwContextOccupancy({ pressureTokens: 1, contextWindow: 3 }).percent, 33)
  assert.equal(dwContextOccupancy({ pressureTokens: 2, contextWindow: 3 }).percent, 67)
})

test('section normalization hides empty Sessions and keeps zero rows out', () => {
  const empty = dwProjectionSections({})
  assert.equal(empty.stats, null)
  assert.equal(empty.usage, null)
  assert.equal(empty.context, null)
  assert.equal(dwProjectionSections(undefined).stats, null)
  assert.equal(dwProjectionSections(null).usage, null)

  // No steps means no statistics section, exactly like the native pill.
  const noSteps = dwProjectionSections({ sessionStats: { turns: 2, steps: 0, llmMs: 4000 } })
  assert.equal(noSteps.stats, null)
  // Steps present but no timing rows yet: the section stays (counts line only).
  const countsOnly = dwProjectionSections({ sessionStats: { turns: 1, steps: 3 } })
  assert.deepEqual(
    countsOnly.stats,
    { turns: 1, steps: 3, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }
  )
  // Malformed/missing numbers degrade to 0 rather than NaN.
  assert.equal(dwProjectionSections({ sessionStats: { turns: '2', steps: 5, llmMs: null } }).stats.turns, 0)

  // Nothing billed and no output means no token section.
  assert.equal(dwProjectionSections({ tokenUsage: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } }).usage, null)
  const usage = dwProjectionSections({
    tokenUsage: { uncachedInputTokens: 426524, cacheReadTokens: 39590528, cacheWriteTokens: 0, outputTokens: 177698 }
  }).usage
  assert.equal(usage.billedInputTokens, 40017052)
  assert.equal(usage.totalTokens, 40194750)
  assert.equal(usage.cacheHitPercent, '99')
  assert.equal(usage.cacheWriteTokens, 0)

  // Context needs the provider pressure; the heuristic breakdown may be absent.
  const pressureOnly = dwProjectionSections({ contextPressure: { pressureTokens: 450947, contextWindow: 1000000 } }).context
  assert.equal(pressureOnly.percent, 45)
  assert.equal(pressureOnly.breakdown, null)
  const withBreakdown = dwProjectionSections({
    contextPressure: { pressureTokens: 450947, projectedTokens: 452000, contextWindow: 1000000 },
    contextBreakdown: { systemTokens: 2074, toolsTokens: 13536, messageTokens: 355890 }
  }).context
  assert.equal(withBreakdown.usedTokens, 452000, 'projected estimate wins')
  assert.deepEqual(withBreakdown.breakdown, { systemTokens: 2074, toolsTokens: 13536, messageTokens: 355890 })
  // An empty pressure value ({}) hides the section.
  assert.equal(dwProjectionSections({ contextPressure: {} }).context, null)
})

test('one-shot projection read is only requested for unseeded idle records', () => {
  const full = { sessionStats: {}, tokenUsage: {}, contextPressure: {}, contextBreakdown: {} }
  assert.equal(dwNeedsProjectionRead(undefined), true, 'missing record')
  assert.equal(dwNeedsProjectionRead(null), true)
  assert.equal(dwNeedsProjectionRead({}), true, 'no values yet')
  assert.equal(dwNeedsProjectionRead({ values: {} }), true, 'empty values')
  assert.equal(dwNeedsProjectionRead({ values: { sessionStats: {} } }), true, 'context values still missing')
  assert.equal(dwNeedsProjectionRead({ values: { sessionStats: {}, contextBreakdown: {} } }), false, 'fully seeded')
  assert.equal(dwNeedsProjectionRead({ values: full, state: 'idle' }), false, 'live Sessions are push-seeded')
  // Never retry a request already attempted, even when the values stayed absent.
  for (const state of ['loading', 'ready', 'error', 'migration-required']) {
    assert.equal(dwNeedsProjectionRead({ values: {}, state }), false, `state ${state} must not be re-read`)
  }
  // Once both figure values are present, an error/ready marker is irrelevant.
  assert.equal(dwNeedsProjectionRead({ values: { sessionStats: {}, contextBreakdown: {} }, state: 'error' }), false)
})

test('identity glyphs are swapped without touching the rest of the marker recipe', () => {
  const source = client.source
  // Header all-complete indicator: DeepSeek brand glyph in the same 14 px slot.
  assert.match(source, /className: 'psd-spark' \}, RemixGlyph\(DW_DEEPSEEK_FILL, 14\)\)/)
  // Read/acknowledged parent row: the sparkling glyph fills the 16 px leading
  // glyph cell (interrupted rows swap it for the badge) at the same 0.82 scale.
  assert.match(source, /className: 'psd-run-glyph-cell'[\s\S]{0,1400}className: 'psd-run-brand'[\s\S]{0,200}RemixGlyph\(DW_SPARKLING_LINE, 16, undefined, 0\.82\)/)
  // Nested subagent rows keep their robot glyph.
  assert.match(source, /className: 'psd-child-brand'[\s\S]{0,200}RemixGlyph\(DW_ROBOT_2_LINE, 12\)/)
  // The running (blue pulse) and unread-completion (green done dot) branches are untouched.
  assert.equal((source.match(/StateDot, \{ state: 'ongoing', size: 14, className: 'psd-run-glyph' \}/g) ?? []).length, 1)
  assert.equal((source.match(/StateDot, \{ state: 'done', size: 14, className: 'psd-run-glyph' \}/g) ?? []).length, 1)
  assert.equal((source.match(/className: 'psd-pulse'/g) ?? []).length, 1)
})
