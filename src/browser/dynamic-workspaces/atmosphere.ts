/**
 * Motion model for the current-row rainbow atmosphere: coloured smoke that
 * spreads and mixes without ever averaging into grey.
 *
 * The renderer is split in two layers so hue and density cannot pollute each
 * other:
 *
 * 1. **Density** — a handful of soft particles per hue, advected by a smooth
 *    curl-noise field (`atmosphereFlow`). They are painted as white blobs into
 *    one offscreen canvas per hue, so a blob is only ever a monochrome mask.
 * 2. **Hue** — the visible colour is chosen per pixel from the *dominant* hue
 *    layer, and the two leading hues are blended along the shortest hue arc at
 *    constant L/C (`atmosphereArcHue`). Two hues therefore never average into a
 *    neutral grey the way translucent colour mixing does; the earlier renderer
 *    lost 0.79 -> 0.32 saturation in 9 s exactly that way.
 *
 * Everything here is pure (no DOM, no canvas): the renderer in `install.ts`
 * only paints. That keeps the invariants testable in
 * `test/dynamic-workspaces-atmosphere.test.js`:
 *
 * - positions stay inside the pill; `y` reflects at the edges instead of
 *   clamping onto two lines (clamped particles pile up and read as frozen);
 * - the flow is sampled at a *moving coordinate*, never by an animated hash
 *   seed: a seed that changes every frame re-randomises the whole field, which
 *   looks like flashing colours and leaves the strip visually static;
 * - the curl is capped, not normalised — normalising destroys the
 *   divergence-free property and clumps particles in the slow regions;
 * - the horizontal drift is small and every particle may move either way, so
 *   the pill never becomes one left-to-right conveyor;
 * - at the moment two layers swap the lead, both sides of the swap agree on the
 *   same 50/50 hue blend, so the colour is continuous.
 *
 * @module
 */

/** One OKLCH atmosphere stop. */
export interface OklchColor {
  l: number
  c: number
  hue: number
}

/** One density particle: which hue it belongs to, where it is, how big it is. */
export interface SmokeParticle {
  /** Index into {@link DW_ATMOS_HUES}. */
  hue: number
  x: number
  y: number
  /** Radius as a fraction of the pill's larger side. */
  size: number
  /** Paint alpha of the white mask blob. */
  alpha: number
  /** Stable per-particle phase for the noise lookups. */
  seed: number
}

/** One atmosphere model: the particles plus the animation clock. */
export interface AtmosphereModel {
  particles: SmokeParticle[]
  /** Seconds of animation. */
  time: number
}

/**
 * OKLCH hue path of the atmosphere: equal perceived lightness/chroma across the
 * eight stops (unlike HSL, where yellow/green read much brighter at the same L).
 * Each theme gets its own L/C so the composited pill lands at a similar pastel
 * weight: light is higher-L/lower-C, dark is a little lower-L with more chroma.
 */
export const DW_ATMOS_HUES = [20, 65, 110, 150, 195, 245, 290, 330]

export const DW_ATMOS_PALETTES: Record<'light' | 'dark', OklchColor[]> = {
  light: DW_ATMOS_HUES.map((hue) => ({ l: 0.76, c: 0.31, hue })),
  dark: DW_ATMOS_HUES.map((hue) => ({ l: 0.76, c: 0.24, hue }))
}

/**
 * Smoke tuning. `speed` is pill-widths per second — deliberately far below the
 * 0.05/s at which density motion starts to read as flicker; `perHue` grows the
 * mottling; `gain` maps accumulated mask alpha to canvas alpha and is kept low
 * so the density texture is visible instead of clipping at 255.
 */
export const DW_SMOKE = {
  speed: 0.014,
  perHue: 8,
  size: 0.20,
  sizeJitter: 0.40,
  alpha: 0.26,
  alphaJitter: 0.10,
  // Canvas alpha multiplier on the accumulated mask (0..255): the demo tiles
  // the owner approved composite fully opaque, so a dense pixel saturates.
  gain: 300,
  /** Fraction of the canvas backing store the layer buffers use. */
  layerScale: 0.8
}

/** Longest delta integrated in one step (a restored tab can report minutes). */
export const ATMOS_DT_MAX = 0.1

/** CSS `oklch()` colour string with alpha (the browser gamut-maps it). */
export function atmospherePaint(color: OklchColor, alpha: number): string {
  return `oklch(${color.l} ${color.c} ${color.hue} / ${alpha.toFixed(3)})`
}

/**
 * Deterministic value hash for the particle look and the noise lattice.
 * @param seed - any number.
 * @returns a stable fraction in [0, 1).
 */
export function atmosphereHash(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function smoothStep(fraction: number): number {
  return fraction * fraction * (3 - 2 * fraction)
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = smoothStep(x - xi)
  const v = smoothStep(y - yi)
  const a = atmosphereHash(xi + yi * 57.3 + seed)
  const b = atmosphereHash(xi + 1 + yi * 57.3 + seed)
  const c = atmosphereHash(xi + (yi + 1) * 57.3 + seed)
  const d = atmosphereHash(xi + 1 + (yi + 1) * 57.3 + seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) * 0.62
    + valueNoise(x * 2.1, y * 2.1, seed + 5) * 0.26
    + valueNoise(x * 4.3, y * 4.3, seed + 9) * 0.12
}

/**
 * Velocity of the smoke field at one point, in pill-widths per second.
 *
 * The third noise argument is a fixed seed: time is applied as an offset of the
 * *sample point*, which is what makes the field evolve coherently instead of
 * being re-randomised on every frame. Coordinates are aspect-corrected so a
 * 12:1 pill does not get a 12:1 speed difference between the axes.
 * @param x - horizontal position in [0, 1).
 * @param y - vertical position in [0, 1].
 * @param time - animation seconds.
 * @returns `[vx, vy]`.
 */
export function atmosphereFlow(x: number, y: number, time: number): [number, number] {
  const aspect = 12
  const epsilon = 0.03
  const field = (a: number, b: number): number => fbm(a * 2.6 + time * 0.05, b * 2.6 * aspect + time * 0.02, 17.3)
  const dx = field(x, y + epsilon) - field(x, y - epsilon)
  const dy = -(field(x + epsilon, y) - field(x - epsilon, y))
  // Cap instead of normalise: a unit vector would break divergence-freedom and
  // park the particles in the regions where the raw field is weak.
  const cap = 1.6
  const vx = Math.max(-cap, Math.min(cap, dx * 9))
  const vy = Math.max(-cap, Math.min(cap, dy * 9))
  // A small two-sided drift keeps every part of the pill moving; the swirl does
  // the rest. No constant one-way drift: that reads as a conveyor belt.
  return [vx, vy * 0.5]
}

/**
 * Build the model: equal particles per hue, scattered so the pill is not a
 * fixed left-to-right rainbow.
 * @returns a model resting at its initial positions.
 */
export function createAtmosphereModel(): AtmosphereModel {
  const hues = DW_ATMOS_HUES.length
  const particles: SmokeParticle[] = []
  for (let hue = 0; hue < hues; hue += 1) {
    for (let lane = 0; lane < DW_SMOKE.perHue; lane += 1) {
      const seed = 1 + hue * 3.7 + lane * 11.3
      particles.push({
        hue,
        x: atmosphereHash(seed * 3.1),
        y: 0.14 + atmosphereHash(seed + 1) * 0.72,
        size: DW_SMOKE.size * (1 - DW_SMOKE.sizeJitter / 2 + atmosphereHash(seed + 2) * DW_SMOKE.sizeJitter),
        alpha: DW_SMOKE.alpha * (1 - DW_SMOKE.alphaJitter / 2 + atmosphereHash(seed + 3) * DW_SMOKE.alphaJitter),
        seed
      })
    }
  }
  return { particles, time: 0 }
}

/**
 * Advance one step of the smoke. Frame-rate independent (the flow is sampled
 * from the accumulated clock, so 30/60/120 fps follow the same path) and
 * bounded: `x` wraps, `y` reflects.
 * @param model - the model to advance in place.
 * @param dtSeconds - real seconds since the previous advance.
 * @returns the clamped delta that was integrated (0 when nothing advanced).
 */
export function advanceAtmosphere(model: AtmosphereModel, dtSeconds: number): number {
  const dt = Math.min(ATMOS_DT_MAX, Math.max(0, dtSeconds))
  if (dt === 0) return 0
  model.time += dt
  const time = model.time
  for (const particle of model.particles) {
    const [vx, vy] = atmosphereFlow(particle.x, particle.y, time)
    particle.x = ((particle.x + vx * DW_SMOKE.speed * dt) % 1 + 1) % 1
    particle.y += vy * DW_SMOKE.speed * dt * 0.55
    // Reflect, never clamp: clamping parks particles on two static lines.
    if (particle.y < 0.1) particle.y = 0.2 - particle.y
    if (particle.y > 0.9) particle.y = 1.8 - particle.y
  }
  return dt
}

/**
 * Blend two hues along the shorter arc of the colour wheel.
 *
 * The blend is the vector sum of the two unit hues, which makes it
 * **commutative**: `atmosphereArcHue(a, b, 0.5)` equals
 * `atmosphereArcHue(b, a, 0.5)` exactly. That is what keeps the colour
 * continuous when two layers swap the lead — a plain lerp would produce the
 * two different midpoints and the hue would jump by the arc length. The one
 * degenerate case (the hues are exactly opposite, so the sum cancels) falls
 * back to the midpoint of the canonical order.
 * @param from - first hue in degrees.
 * @param to - second hue in degrees.
 * @param t - 0..1 along the blend.
 * @returns the blended hue in [0, 360).
 */
export function atmosphereArcHue(from: number, to: number, t: number): number {
  const a = from * Math.PI / 180
  const b = to * Math.PI / 180
  const x = (1 - t) * Math.cos(a) + t * Math.cos(b)
  const y = (1 - t) * Math.sin(a) + t * Math.sin(b)
  const magnitude = Math.hypot(x, y)
  if (magnitude < 1e-6) return ((Math.min(from, to) + 90) % 360 + 360) % 360
  return ((Math.atan2(y, x) * 180 / Math.PI) % 360 + 360) % 360
}

/**
 * Layer weight for one pixel: the leader keeps the most weight, the runner-up
 * gets `second / (best + second)` — exactly 0.5 at the crossing, so the two
 * sides of a swap agree.
 * @param best - alpha of the leading layer, 0..255.
 * @param second - alpha of the runner-up, 0..255.
 * @returns the mix weight in [0, 0.5).
 */
export function atmosphereMixWeight(best: number, second: number): number {
  if (best <= 0 || second <= 0) return 0
  return second / (best + second)
}
