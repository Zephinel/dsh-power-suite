/**
 * Unit tests for the current-row rainbow atmosphere model.
 *
 * Two regressions are pinned here. The first renderer moved translucent hues
 * with a per-frame constant, clamped them at the pill edges and let the colours
 * average out: measured saturation fell 0.79 -> 0.32 in nine seconds. The
 * second attempt animated a hash *seed* with time, which re-randomised the
 * whole flow field every frame (colours flashed, most of the strip looked
 * static) and normalised the curl, which clumped particles in the slow regions.
 * The model now separates density (white mask blobs) from hue (per-pixel colour
 * chosen from the dominant layer, blended along the hue arc), samples the flow
 * at a moving coordinate and caps the curl.
 *
 * Rendering itself belongs to `test/browser/sidebar.e2e.mjs` (b4-6 samples the
 * live canvas twice, seconds apart, and requires the colour to survive).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ATMOS_DT_MAX,
  DW_ATMOS_HUES,
  DW_SMOKE,
  advanceAtmosphere,
  atmosphereArcHue,
  atmosphereFlow,
  atmosphereMixWeight,
  createAtmosphereModel
} from '../src/browser/dynamic-workspaces/atmosphere.ts'

/** Deterministic frame clock: `seconds` at `fps`. */
function run(model, seconds, fps) {
  const dt = 1 / fps
  for (let i = 0; i < Math.round(seconds * fps); i += 1) advanceAtmosphere(model, dt)
  return model
}

test('particles cover every hue and start inside the pill', () => {
  const model = createAtmosphereModel()
  assert.equal(model.particles.length, DW_ATMOS_HUES.length * DW_SMOKE.perHue)
  for (const particle of model.particles) {
    assert.ok(Number.isInteger(particle.hue) && particle.hue >= 0 && particle.hue < DW_ATMOS_HUES.length, 'hue index is in range')
    assert.ok(particle.x >= 0 && particle.x < 1, `x starts in [0,1): ${particle.x}`)
    assert.ok(particle.y >= 0.1 && particle.y <= 0.9, `y starts inside the pill: ${particle.y}`)
    assert.ok(particle.size > 0.1 && particle.size < 0.4, `size stays a fraction: ${particle.size}`)
    assert.ok(particle.alpha > 0.1 && particle.alpha < 0.4, `alpha stays translucent: ${particle.alpha}`)
  }
  for (let hue = 0; hue < DW_ATMOS_HUES.length; hue += 1) {
    assert.equal(model.particles.filter((particle) => particle.hue === hue).length, DW_SMOKE.perHue, `hue ${hue} keeps its own particles`)
  }
})

test('ten simulated minutes stay inside the pill and never produce NaN', () => {
  for (const fps of [30, 60, 120]) {
    const model = run(createAtmosphereModel(), 600, fps)
    for (const particle of model.particles) {
      assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y), `finite at ${fps} fps`)
      assert.ok(particle.x >= 0 && particle.x < 1, `x stays wrapped at ${fps} fps: ${particle.x}`)
      assert.ok(particle.y >= 0.1 - 1e-9 && particle.y <= 0.9 + 1e-9, `y reflects inside the pill at ${fps} fps: ${particle.y}`)
    }
  }
})

test('the flow is a real flow: coherent, bounded and moving both ways', () => {
  // A coherent field changes slowly; a field re-randomised every frame would
  // jump wildly for a 100 ms step.
  let maxStep = 0
  let minVx = Infinity
  let maxVx = -Infinity
  for (let i = 0; i < 200; i += 1) {
    const x = i / 200
    const [ax, ay] = atmosphereFlow(x, 0.5, 3)
    const [bx, by] = atmosphereFlow(x, 0.5, 3.1)
    maxStep = Math.max(maxStep, Math.abs(ax - bx), Math.abs(ay - by))
    minVx = Math.min(minVx, ax)
    maxVx = Math.max(maxVx, ax)
  }
  assert.ok(Number.isFinite(maxStep) && maxStep < 0.6, `flow changes smoothly over 100 ms: ${maxStep}`)
  assert.ok(minVx < 0 && maxVx > 0, `flow can move both ways (${minVx.toFixed(3)} .. ${maxVx.toFixed(3)})`)
})

test('the path is frame-rate independent', () => {
  const slow = run(createAtmosphereModel(), 5, 30)
  const fast = run(createAtmosphereModel(), 5, 120)
  let worst = 0
  for (let index = 0; index < slow.particles.length; index += 1) {
    const a = slow.particles[index]
    const b = fast.particles[index]
    const dx = Math.abs(a.x - b.x)
    worst = Math.max(worst, Math.min(dx, 1 - dx), Math.abs(a.y - b.y))
  }
  assert.ok(worst < 5e-3, `30 fps and 120 fps diverge by ${worst}; the model must integrate real time`)
})

test('a backgrounded tab cannot teleport the smoke', () => {
  const model = createAtmosphereModel()
  assert.equal(advanceAtmosphere(model, 5), ATMOS_DT_MAX, 'delta is clamped to the documented maximum')
  assert.equal(model.time, ATMOS_DT_MAX, 'the clock only advances by the clamped step')
  const ignored = createAtmosphereModel()
  advanceAtmosphere(ignored, -1)
  assert.equal(ignored.time, 0, 'a negative delta is ignored')
})

test('two models fed the same deltas are identical', () => {
  assert.deepEqual(run(createAtmosphereModel(), 30, 60), run(createAtmosphereModel(), 30, 60))
})

test('the drift stays inside the no-flicker budget', () => {
  const model = createAtmosphereModel()
  const start = model.particles.map((particle) => particle.x)
  run(model, 60, 60)
  for (let index = 0; index < model.particles.length; index += 1) {
    const dx = Math.abs(model.particles[index].x - start[index])
    const distance = Math.min(dx, 1 - dx)
    const perSecond = distance / 60
    assert.ok(perSecond < 0.05, `particle ${index} moved ${perSecond.toFixed(4)} pill/s, over the 0.05 budget`)
  }
})

test('the hue blend is continuous when two layers swap the lead', () => {
  for (const from of DW_ATMOS_HUES) {
    for (const to of DW_ATMOS_HUES) {
      assert.ok(Math.abs(atmosphereArcHue(from, to, 0) - from) < 1e-9, 'the arc starts at the first hue')
      assert.ok(Math.abs(atmosphereArcHue(from, to, 1) - to) < 1e-9, 'the arc ends at the second hue')
      const forward = atmosphereArcHue(from, to, 0.5)
      const backward = atmosphereArcHue(to, from, 0.5)
      const distance = Math.abs(forward - backward)
      assert.ok(Math.min(distance, 360 - distance) < 1e-9, `the 50/50 blend is symmetric for ${from} -> ${to}`)
    }
  }
})

test('the mix weight peaks at the swap and stays bounded', () => {
  assert.equal(atmosphereMixWeight(200, 0), 0, 'no runner-up means no mix')
  assert.equal(atmosphereMixWeight(120, 120), 0.5, 'equal layers blend 50/50, so both sides of the swap agree')
  assert.ok(atmosphereMixWeight(255, 1) < 0.01, 'a clear leader barely mixes')
  assert.ok(atmosphereMixWeight(100, 99) <= 0.5, 'the weight never exceeds one half')
})
