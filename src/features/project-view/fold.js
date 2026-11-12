/**
 * Project view folds: pure, I/O-free transformations from Session logs and
 * Workspace records into the payload `GET /api/power-suite.project` serves.
 *
 * The route owns file reads and caching; everything here is deterministic so
 * the folding rules are unit-testable without a Host. Three rules are worth
 * stating up front because they decide what the browser is allowed to claim:
 *
 * - A run is one `turn/start`..`turn/end` pair. A turn whose `turn/end` is
 *   missing is `running` while its Agent is live and `interrupted` otherwise
 *   (a crash or a Host restart may leave that tail open).
 * - `job/registered`..`job/settled` pairs are folded into the turn that
 *   created them: the exact tool invocation recorded on the job maps to the
 *   turn of its `tool/call`, and a job without that mapping falls back to the
 *   turn whose time range contains it, then to the nearest preceding turn.
 * - Stats are derived only from turns that were actually measured. "Today"
 *   means the caller-supplied local day boundary; nothing here guesses a
 *   timezone.
 */

/** Most Sessions one snapshot measures. */
export const MAX_SESSIONS = 20

/** Most runs one Session contributes to the combined list. */
export const MAX_RUNS_PER_SESSION = 40

/** Most runs the combined list carries. */
export const MAX_RUNS = 200

/** Most job rows one expanded run carries. */
export const MAX_JOBS_PER_RUN = 24

/** Most recent-activity rows one snapshot carries. */
export const MAX_ACTIVITY = 8

/**
 * Narrow parsed JSON to a plain object.
 * @param {unknown} value - decoded value.
 * @returns {boolean} whether it is a record.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one event's data as a record.
 * @param {object} event - raw session event.
 * @returns {object | null} the data record, or null.
 */
function dataOf(event) {
  if (!isRecord(event) || !isRecord(event.data)) return null
  return event.data
}

/**
 * Read one event's timestamp.
 * @param {object} event - raw session event.
 * @returns {number | null} epoch milliseconds, or null when absent/invalid.
 */
function timeOf(event) {
  if (!isRecord(event) || !Number.isFinite(event.time)) return null
  return event.time
}

/**
 * Normalize one `turn/end` reason.
 * @param {unknown} reason - `turn/end` data.reason.
 * @returns {{ kind: string | null, cause: string | null }} the recorded reason.
 */
export function turnEndReason(reason) {
  if (!isRecord(reason)) return { kind: null, cause: null }
  const kind = typeof reason.kind === 'string' ? reason.kind : null
  const cause = isRecord(reason.reason) && typeof reason.reason.kind === 'string' ? reason.reason.kind : null
  return { kind, cause }
}

/**
 * Map one closed turn's recorded reason to a display status.
 *
 * The status vocabulary is deliberately coarse and honest:
 * - `completed` — the model/loop ended the turn normally.
 * - `interrupted` — a Harness-caused cutoff (crash-recovery closer, or the
 *   graceful shutdown that aborts a live turn with the `disposed` cause).
 * - `stopped` — a human or plugin cancellation, a blocked turn, or a
 *   token-ceiling end; the turn ended before its natural completion but was
 *   not a failure.
 * - `failed` — the turn ended with a structured error.
 * - `forked` — a fork seed closed a turn that was still open in the source
 *   Session; in the child it is a past boundary, not a failure.
 * Unknown merge-extended reasons also fall back to `stopped`: they closed the
 * turn without claiming success or failure.
 * @param {string | null} kind - `turn/end` reason kind.
 * @param {string | null} cause - cancellation cause of an `aborted` ending.
 * @returns {'completed' | 'interrupted' | 'stopped' | 'failed'} the status.
 */
export function turnEndStatus(kind, cause) {
  if (kind === 'completed') return 'completed'
  if (kind === 'interrupted') return 'interrupted'
  if (kind === 'aborted') return cause === 'disposed' ? 'interrupted' : 'stopped'
  if (kind === 'error') return 'failed'
  return 'stopped'
}

/**
 * Status of one folded turn.
 * @param {object} turn - folded turn.
 * @param {boolean} running - whether the turn's Agent is live now.
 * @returns {'running' | 'completed' | 'interrupted' | 'stopped' | 'failed'} the status.
 */
export function turnStatus(turn, running) {
  if (!isRecord(turn)) return 'interrupted'
  // A closed turn's recorded reason is authoritative even when its start fell
  // into a fork's inherited prefix: a sliced fork seed keeps the synthetic
  // `turn/end` boundary but not the `turn/start`, so the ending still describes
  // what happened (e.g. `forked` → `stopped`).
  if (Number.isFinite(turn.endedAt)) return turnEndStatus(turn.endKind, turn.endCause)
  if (running === true) return 'running'
  // An open turn with no live Agent has no recorded ending; treat it as the
  // crash/Host-restart tail it must be.
  return 'interrupted'
}

/**
 * Fold one Session's own event log (a fork's inherited prefix must already be
 * removed by the caller) into turn and job records.
 *
 * Turns are keyed by their recorded `turn` number and ordered by first start;
 * a repeated `turn/start` for the same number updates the start time instead
 * of duplicating the run. Jobs are keyed by `jobId`, so a settlement replaces
 * its registration; a registered job with no settlement stays running.
 * @param {readonly object[]} events - raw session events in ascending seq order.
 * @returns {{
 *   title: string | null,
 *   lastActivityAt: number | null,
 *   turns: Array<object>,
 *   jobs: Array<object>,
 *   callIdToTurn: Map<string, number>
 * }} folded log.
 */
export function foldSessionLog(events) {
  const turnsByNumber = new Map()
  const jobsById = new Map()
  const callIdToTurn = new Map()
  let title = null
  let lastActivityAt = null
  if (!Array.isArray(events)) return { title, lastActivityAt, turns: [], jobs: [], callIdToTurn }

  for (const event of events) {
    const at = timeOf(event)
    if (at !== null && (lastActivityAt === null || at > lastActivityAt)) lastActivityAt = at
    if (!isRecord(event) || typeof event.type !== 'string') continue
    const data = dataOf(event)

    if (event.type === 'session/title') {
      if (data !== null && typeof data.title === 'string' && data.title.trim().length > 0) title = data.title.trim()
      continue
    }

    if (event.type === 'turn/start') {
      if (data === null || typeof data.turn !== 'number') continue
      const existing = turnsByNumber.get(data.turn)
      if (existing === undefined) {
        turnsByNumber.set(data.turn, {
          turn: data.turn,
          startedAt: at,
          endedAt: null,
          endKind: null,
          endCause: null,
          toolCalls: 0
        })
      } else if (at !== null) {
        existing.startedAt = at
        existing.endedAt = null
        existing.endKind = null
        existing.endCause = null
      }
      continue
    }

    if (event.type === 'turn/end') {
      if (data === null || typeof data.turn !== 'number') continue
      const reason = turnEndReason(data.reason)
      const existing = turnsByNumber.get(data.turn)
      if (existing === undefined) {
        // A closing boundary without a recorded start still names a real turn;
        // keep it so its duration/jobs are not silently attributed elsewhere.
        turnsByNumber.set(data.turn, {
          turn: data.turn,
          startedAt: null,
          endedAt: at,
          endKind: reason.kind,
          endCause: reason.cause,
          toolCalls: 0
        })
      } else {
        existing.endedAt = at
        existing.endKind = reason.kind
        existing.endCause = reason.cause
      }
      continue
    }

    if (event.type === 'tool/call') {
      if (data === null || typeof data.turn !== 'number') continue
      const turn = turnsByNumber.get(data.turn)
      if (turn !== undefined) turn.toolCalls += 1
      if (typeof data.callId === 'string') callIdToTurn.set(data.callId, data.turn)
      continue
    }

    if (event.type === 'job/registered' || event.type === 'job/settled') {
      if (data === null || typeof data.jobId !== 'string') continue
      const previous = jobsById.get(data.jobId) ?? {}
      const toolCall = isRecord(data.toolCall) ? data.toolCall : null
      const callId = toolCall !== null && typeof toolCall.callId === 'string' ? toolCall.callId : null
      const job = {
        jobId: data.jobId,
        kind: typeof data.kind === 'string' ? data.kind : previous.kind ?? null,
        label: typeof data.label === 'string' ? data.label : previous.label ?? '',
        startedAt: Number.isFinite(data.startedAt) ? data.startedAt : previous.startedAt ?? null,
        finishedAt: event.type === 'job/settled' && Number.isFinite(data.finishedAt) ? data.finishedAt : null,
        status: event.type === 'job/settled' && typeof data.status === 'string' ? data.status : 'running',
        cause: typeof data.cause === 'string' ? data.cause : null,
        detail: typeof data.detail === 'string' ? data.detail : null,
        callId,
        rootCallId: toolCall !== null && typeof toolCall.rootCallId === 'string' ? toolCall.rootCallId : null
      }
      jobsById.set(data.jobId, job)
    }
  }

  const turns = [...turnsByNumber.values()].sort((left, right) => {
    const leftAt = left.startedAt ?? left.endedAt ?? 0
    const rightAt = right.startedAt ?? right.endedAt ?? 0
    return leftAt - rightAt || left.turn - right.turn
  })
  return { title, lastActivityAt, turns, jobs: [...jobsById.values()], callIdToTurn }
}

/**
 * Assign each folded job to the turn that created or contained it.
 *
 * Exact association wins: the job's `toolCall.callId` (or its root call) maps
 * to the turn of that `tool/call` event, which stays correct even when job
 * start/end timestamps drift into a neighboring turn. Otherwise the job goes
 * to the turn whose `[startedAt, endedAt)` range contains its start, and
 * finally to the nearest preceding turn (background work outliving its turn,
 * or a turn that never ended). A job that precedes every measured turn is not
 * attributed at all rather than guessed.
 * @param {Array<object>} turns - folded turns.
 * @param {Array<object>} jobs - folded jobs.
 * @param {Map<string, number>} callIdToTurn - tool call id → turn number.
 * @returns {Map<number, Array<object>>} turn number → jobs, each sorted by start.
 */
export function associateJobs(turns, jobs, callIdToTurn) {
  const byTurn = new Map()
  if (!Array.isArray(turns) || !Array.isArray(jobs)) return byTurn
  const ordered = [...turns].sort((left, right) => {
    const leftAt = left.startedAt ?? left.endedAt ?? 0
    const rightAt = right.startedAt ?? right.endedAt ?? 0
    return leftAt - rightAt || left.turn - right.turn
  })
  for (const job of jobs) {
    const at = Number.isFinite(job.startedAt) ? job.startedAt : null
    let turn = null
    const mapped = (typeof job.callId === 'string' ? callIdToTurn.get(job.callId) : undefined)
      ?? (typeof job.rootCallId === 'string' ? callIdToTurn.get(job.rootCallId) : undefined)
    if (mapped !== undefined) {
      turn = ordered.find((candidate) => candidate.turn === mapped) ?? null
    }
    if (turn === null && at !== null) {
      turn = ordered.find((candidate) => candidate.startedAt !== null
        && at >= candidate.startedAt
        && (candidate.endedAt === null || at < candidate.endedAt)) ?? null
    }
    if (turn === null) {
      for (const candidate of ordered) {
        if (candidate.startedAt === null || at === null) continue
        if (candidate.startedAt > at) break
        turn = candidate
      }
    }
    if (turn === null) continue
    const list = byTurn.get(turn.turn) ?? []
    list.push(job)
    byTurn.set(turn.turn, list)
  }
  for (const list of byTurn.values()) {
    list.sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0) || left.jobId.localeCompare(right.jobId))
  }
  return byTurn
}

/**
 * Wire shape of one job row for the runs list.
 * @param {object} job - folded job.
 * @param {object} turn - owned turn.
 * @returns {object} the wire job.
 */
function wireJob(job, turn) {
  const durationMs = Number.isFinite(job.startedAt) && Number.isFinite(job.finishedAt)
    ? Math.max(0, job.finishedAt - job.startedAt)
    : null
  return {
    jobId: job.jobId,
    turn: turn.turn,
    kind: job.kind,
    label: job.label,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs,
    status: job.status,
    detail: job.detail
  }
}

/**
 * Build the runs list from measured Sessions.
 *
 * Each Session contributes its own turns as runs, newest first, capped at
 * `maxRunsPerSession`; the combined list is newest-first and capped at
 * `maxRuns`. `jobs` on each run is capped at `maxJobsPerRun` while `jobCount`
 * keeps the full number, so an expanded row can say how much it is not showing.
 * @param {object} input - aggregation input.
 * @param {Array<object>} input.sessions - measured Sessions carrying `turns`,
 *   `running`, `title`, and an optional pre-assigned `jobsByTurn` map.
 * @param {number} [input.maxRunsPerSession] - per-Session cap.
 * @param {number} [input.maxRuns] - combined cap.
 * @param {number} [input.maxJobsPerRun] - job rows per run.
 * @returns {{ runs: Array<object>, totalRuns: number, truncated: boolean }} runs.
 */
export function buildRuns({ sessions, maxRunsPerSession = MAX_RUNS_PER_SESSION, maxRuns = MAX_RUNS, maxJobsPerRun = MAX_JOBS_PER_RUN }) {
  const all = []
  let totalRuns = 0
  if (!Array.isArray(sessions)) return { runs: all, totalRuns, truncated: false }
  for (const session of sessions) {
    const turns = Array.isArray(session.turns) ? session.turns : []
    totalRuns += turns.length
    const jobsByTurn = session.jobsByTurn instanceof Map ? session.jobsByTurn : associateJobs(turns, session.jobs ?? [], session.callIdToTurn ?? new Map())
    const chronological = [...turns].sort((left, right) => {
      const leftAt = left.startedAt ?? left.endedAt ?? 0
      const rightAt = right.startedAt ?? right.endedAt ?? 0
      return leftAt - rightAt || left.turn - right.turn
    })
    const sessionRuns = []
    for (let index = chronological.length - 1; index >= 0; index -= 1) {
      if (sessionRuns.length >= maxRunsPerSession) break
      const turn = chronological[index]
      const jobs = jobsByTurn.get(turn.turn) ?? []
      const durationMs = Number.isFinite(turn.startedAt) && Number.isFinite(turn.endedAt)
        ? Math.max(0, turn.endedAt - turn.startedAt)
        : null
      sessionRuns.push({
        id: `${session.sessionId}:${turn.turn}`,
        sessionId: session.sessionId,
        sessionTitle: session.title ?? null,
        turn: turn.turn,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        durationMs,
        status: turnStatus(turn, session.running === true),
        toolCalls: turn.toolCalls,
        jobCount: jobs.length,
        jobs: jobs.slice(0, maxJobsPerRun).map((job) => wireJob(job, turn))
      })
    }
    all.push(...sessionRuns)
  }
  all.sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0) || left.id.localeCompare(right.id))
  const runs = all.slice(0, maxRuns)
  return { runs, totalRuns, truncated: all.length > runs.length || totalRuns > all.length }
}

/**
 * Compute the stat cards from measured Sessions.
 *
 * `completedToday` counts turns that ended with the `completed` status at or
 * after the caller's local day boundary, across the measured Sessions.
 * `averageDurationMs` averages finished turns that carry a duration — the
 * completed ones, as specified; canceled/failed turns are excluded so the
 * average describes work that actually ran to completion. Both are bounded by
 * the Session measurement cap; `truncated` says so.
 * @param {object} input - stats input.
 * @param {Array<object>} input.sessions - measured Sessions carrying turns.
 * @param {number} input.dayStart - local midnight epoch milliseconds.
 * @param {boolean} [input.truncatedSessions] - whether Sessions were capped.
 * @returns {{ runningSessions: number, completedToday: number, totalRuns: number,
 *   averageDurationMs: number | null, measuredSessions: number, truncated: boolean }} stats.
 */
export function computeStats({ sessions, dayStart, truncatedSessions = false }) {
  let runningSessions = 0
  let completedToday = 0
  let totalRuns = 0
  let completedCount = 0
  let durationSum = 0
  let durationCount = 0
  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      if (session.running === true) runningSessions += 1
      const turns = Array.isArray(session.turns) ? session.turns : []
      for (const turn of turns) {
        // A `turn/end` without a recorded start is a synthetic fork boundary
        // (the start lives in the inherited prefix); it is not a measured run,
        // so it never inflates the run total or the duration average.
        if (Number.isFinite(turn.startedAt)) totalRuns += 1
        if (turn.endedAt === null || turn.endedAt === undefined) continue
        const status = turnEndStatus(turn.endKind, turn.endCause)
        if (status !== 'completed') continue
        completedCount += 1
        if (Number.isFinite(turn.startedAt) && Number.isFinite(turn.endedAt)) {
          durationSum += Math.max(0, turn.endedAt - turn.startedAt)
          durationCount += 1
        }
        if (Number.isFinite(turn.endedAt) && Number.isFinite(dayStart) && turn.endedAt >= dayStart) completedToday += 1
      }
    }
  }
  return {
    runningSessions,
    completedToday,
    totalRuns,
    // A completed turn without timestamps cannot contribute to the average;
    // null says "no measurable run" instead of a fabricated zero.
    averageDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
    completedRuns: completedCount,
    measuredSessions: Array.isArray(sessions) ? sessions.length : 0,
    truncated: truncatedSessions
  }
}

/**
 * Derive the recent-activity feed from measured runs and Sessions.
 *
 * Every row is a fact already present in the folded data: a run that ended
 * (with its real status), or Session activity newer than that Session's newest
 * run (a later prompt, a title update, an interrupted tail). One row per
 * Session keeps the feed a summary rather than a duplicate of the runs list;
 * rows are ordered newest first and only the newest `limit` survive.
 * @param {object} input - activity input.
 * @param {Array<object>} input.sessions - measured Sessions.
 * @param {Array<object>} input.runs - combined runs (newest first).
 * @param {number} [input.limit] - row cap.
 * @returns {Array<{ kind: string, at: number, sessionId: string, title: string | null, detail: string | null }>} rows.
 */
export function buildRecentActivity({ sessions, runs, limit = MAX_ACTIVITY }) {
  const rows = []
  const runStatusKind = {
    completed: 'run-completed',
    failed: 'run-failed',
    interrupted: 'run-interrupted',
    stopped: 'run-stopped'
  }
  const newestRunBySession = new Map()
  if (Array.isArray(runs)) {
    for (const run of runs) {
      if (!Number.isFinite(run.endedAt)) continue
      if (runStatusKind[run.status] === undefined) continue
      const previous = newestRunBySession.get(run.sessionId)
      if (previous === undefined || run.endedAt > previous.endedAt) newestRunBySession.set(run.sessionId, run)
    }
  }
  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      const run = newestRunBySession.get(session.sessionId)
      const activityAt = Number.isFinite(session.lastActivityAt) ? session.lastActivityAt : null
      if (run === undefined) {
        if (activityAt === null) continue
        rows.push({
          kind: 'session-updated',
          at: activityAt,
          sessionId: session.sessionId,
          title: session.title ?? null,
          detail: null
        })
        continue
      }
      // The run is the newest known boundary; only strictly newer Session
      // activity replaces it, so a finished turn is never hidden by equal times.
      if (activityAt !== null && activityAt > run.endedAt) {
        rows.push({
          kind: 'session-updated',
          at: activityAt,
          sessionId: session.sessionId,
          title: session.title ?? null,
          detail: null
        })
        continue
      }
      rows.push({
        kind: runStatusKind[run.status],
        at: run.endedAt,
        sessionId: session.sessionId,
        title: run.sessionTitle ?? session.title ?? null,
        detail: `turn ${run.turn}`
      })
    }
  }
  rows.sort((left, right) => right.at - left.at || String(left.sessionId).localeCompare(String(right.sessionId)))
  return rows.slice(0, limit)
}

/**
 * Epoch milliseconds of the local day boundary for `now`.
 * @param {number} now - epoch milliseconds.
 * @returns {number} local midnight at or before `now`.
 */
export function localDayStart(now) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
