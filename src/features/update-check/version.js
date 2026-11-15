/**
 * Stable-version math shared by the Host update check.
 *
 * Only a strict three-part stable version (`x.y.z`) is an update target: a
 * prerelease (`0.2.0-rc.1`) or a build suffix (`0.2.0+build`) must never make
 * the browser offer an update, and a running version that reads as one of those
 * must never be compared at all.
 */

/** A stable version is exactly three numeric parts; suffixes are not update targets. */
const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/u

/**
 * Parse one stable version.
 * @param {unknown} value - candidate version text.
 * @returns {{ major: number, minor: number, patch: number } | undefined} the
 *   numeric parts, or undefined when the value is not a stable `x.y.z` version.
 */
export function parseStableVersion(value) {
  if (typeof value !== 'string') return undefined
  const match = STABLE_VERSION.exec(value.trim())
  if (match === null) return undefined
  const version = {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  }
  // Mirrored (not shared) by the browser half in `src/client.js`: both tables
  // must keep identical accept/reject rules. `test/update-check-prompt.test.js`
  // cross-checks the two on the same version table, so a one-sided edit fails.
  if (!Number.isSafeInteger(version.major)
    || !Number.isSafeInteger(version.minor)
    || !Number.isSafeInteger(version.patch)) return undefined
  return version
}

/**
 * Compare two stable versions.
 * @param {unknown} left - one candidate version.
 * @param {unknown} right - the other candidate version.
 * @returns {number | undefined} `-1` when left is older, `1` when it is newer,
 *   `0` when they are equal, and undefined when either side is not stable.
 */
export function compareStableVersions(left, right) {
  const a = parseStableVersion(left)
  const b = parseStableVersion(right)
  if (a === undefined || b === undefined) return undefined
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

/**
 * Whether `latest` is a published stable version newer than `current`.
 * @param {unknown} latest - the version the registry names as latest.
 * @param {unknown} current - the running package version.
 * @returns {boolean} true only when both are stable and latest is greater.
 */
export function isNewerStableVersion(latest, current) {
  if (parseStableVersion(latest) === undefined) return false
  return (compareStableVersions(latest, current) ?? 0) > 0
}
