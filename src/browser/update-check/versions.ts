/**
 * Stable-version math shared by the browser update prompt.
 *
 * Mirrors the Host half (`src/features/update-check/version.ts`) deliberately:
 * the browser must never offer an update from a prerelease/build suffix or from
 * an unreadable running version. `test/update-check-prompt.test.js` cross-checks
 * both tables on the same fixture set, so a one-sided edit fails the suite.
 *
 * @module
 */

/** Parsed stable `major.minor.patch` version. */
export interface StableVersion {
  major: number
  minor: number
  patch: number
}

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/u

/**
 * Parse a stable `major.minor.patch` version.
 * @param value - candidate version text.
 * @returns the numeric parts, or null when the value is not a stable version.
 */
export function parseStableVersion(value: unknown): StableVersion | null {
  if (typeof value !== 'string') return null
  const match = STABLE_VERSION.exec(value.trim())
  if (match === null) return null
  const version = {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  }
  if (!Number.isSafeInteger(version.major)
    || !Number.isSafeInteger(version.minor)
    || !Number.isSafeInteger(version.patch)) return null
  return version
}

/**
 * Whether `latest` is a stable version strictly newer than `current`.
 * @param latest - candidate newer version.
 * @param current - running version.
 * @returns true only when both parse and latest is greater.
 */
export function isNewerStableVersion(latest: unknown, current: unknown): boolean {
  const newer = parseStableVersion(latest)
  const running = parseStableVersion(current)
  if (newer === null || running === null) return false
  if (newer.major !== running.major) return newer.major > running.major
  if (newer.minor !== running.minor) return newer.minor > running.minor
  return newer.patch > running.patch
}
