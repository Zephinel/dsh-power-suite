import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import {
  MAX_ACTIVITY,
  MAX_JOBS_PER_RUN,
  MAX_RUNS_PER_SESSION,
  associateJobs,
  buildRecentActivity,
  buildRuns,
  computeStats,
  foldSessionLog,
  localDayStart,
  turnEndReason,
  turnEndStatus,
  turnStatus
} from '../src/features/project-view/fold.js'
import { PROJECT_CACHE_TTL_MS, installProjectView } from '../src/features/project-view/host.js'

/**
 * Build one session event envelope.
 * @param {number} seq - event seq.
 * @param {number} time - epoch milliseconds.
 * @param {string} type - event type.
 * @param {object} data - event data record.
 * @returns {object} the event.
 */
function event(seq, time, type, data) {
  return { seq, time, type, data }
}

/**
 * One `turn/start` event.
 * @param {number} seq - event seq.
 * @param {number} time - epoch milliseconds.
 * @param {number} turn - turn number.
 * @returns {object} the event.
 */
function turnStart(seq, time, turn) {
  return event(seq, time, 'turn/start', { turn })
}

/**
 * One `turn/end` event.
 * @param {number} seq - event seq.
 * @param {number} time - epoch milliseconds.
 * @param {number} turn - turn number.
 * @param {object} reason - recorded turn end reason.
 * @returns {object} the event.
 */
function turnEnd(seq, time, turn, reason = { kind: 'completed' }) {
  return event(seq, time, 'turn/end', { turn, reason })
}

/**
 * One `tool/call` event.
 * @param {number} seq - event seq.
 * @param {number} time - epoch milliseconds.
 * @param {number} turn - owning turn.
 * @param {string} callId - tool call identity.
 * @returns {object} the event.
 */
function toolCall(seq, time, turn, callId) {
  return event(seq, time, 'tool/call', { turn, step: 1, callId, name: 'bash', arguments: '{}' })
}

/**
 * One `job/registered` event.
 * @param {number} seq - event seq.
 * @param {number} time - registration time.
 * @param {string} jobId - job identity.
 * @param {string | undefined} callId - creating tool call identity.
 * @returns {object} the event.
 */
function jobRegistered(seq, time, jobId, callId) {
  return event(seq, time, 'job/registered', {
    jobId,
    owner: 'session-a',
    kind: 'bash',
    label: `label ${jobId}`,
    startedAt: time,
    ...(callId === undefined ? {} : { toolCall: { callId, rootCallId: callId } })
  })
}

/**
 * One `job/settled` event.
 * @param {number} seq - event seq.
 * @param {number} time - settlement time.
 * @param {string} jobId - job identity.
 * @param {string} status - terminal outcome.
 * @param {string | undefined} callId - creating tool call identity.
 * @param {string | undefined} detail - terminal reason.
 * @returns {object} the event.
 */
function jobSettled(seq, time, jobId, status, callId, detail = 'exit code: 0') {
  return event(seq, time, 'job/settled', {
    jobId,
    owner: 'session-a',
    kind: 'bash',
    label: `label ${jobId}`,
    // The registry repeats the registration's start time on settlement.
    startedAt: time - 200,
    ...(callId === undefined ? {} : { toolCall: { callId, rootCallId: callId } }),
    finishedAt: time,
    status,
    cause: 'producer',
    producerReported: true,
    detail
  })
}

test('foldSessionLog folds turns, tool calls, jobs, title, and last activity', () => {
  const events = [
    turnStart(1, 1000, 1),
    toolCall(2, 1100, 1, 'call-1'),
    jobRegistered(3, 1200, 'job-1', 'call-1'),
    jobSettled(4, 1400, 'job-1', 'completed', 'call-1'),
    turnEnd(5, 2000, 1),
    event(6, 2500, 'session/title', { title: '  First title  ' }),
    turnStart(7, 3000, 2),
    event(8, 3100, 'session/title', { title: 'Latest title' })
  ]
  const fold = foldSessionLog(events)
  assert.equal(fold.title, 'Latest title')
  assert.equal(fold.lastActivityAt, 3100)
  assert.deepEqual(fold.turns.map((turn) => turn.turn), [1, 2])
  assert.equal(fold.turns[0].startedAt, 1000)
  assert.equal(fold.turns[0].endedAt, 2000)
  assert.equal(fold.turns[0].toolCalls, 1)
  assert.equal(fold.turns[1].endedAt, null)
  assert.equal(fold.jobs.length, 1)
  assert.equal(fold.jobs[0].status, 'completed')
  assert.equal(fold.jobs[0].finishedAt, 1400)
  assert.equal(fold.jobs[0].callId, 'call-1')
  assert.equal(fold.callIdToTurn.get('call-1'), 1)
})

test('foldSessionLog keeps a registered job running and tolerates malformed events', () => {
  const fold = foldSessionLog([
    null,
    { type: 'turn/start', time: 500, data: null },
    turnStart(1, 1000, 1),
    jobRegistered(2, 1200, 'job-running', undefined),
    { type: 'job/registered', time: 1300, data: { jobId: 'bad' } },
    { type: 'turn/end', time: 1500, data: { turn: 1 } }
  ])
  assert.equal(fold.jobs.length, 2)
  const running = fold.jobs.find((job) => job.jobId === 'job-running')
  assert.equal(running.status, 'running')
  assert.equal(running.finishedAt, null)
  assert.equal(fold.turns[0].endedAt, 1500)
  assert.equal(fold.turns[0].endKind, null)
  assert.deepEqual(foldSessionLog(null), { title: null, lastActivityAt: null, turns: [], jobs: [], callIdToTurn: new Map() })
})

test('turnEndReason and turnEndStatus map recorded reasons honestly', () => {
  assert.deepEqual(turnEndReason({ kind: 'aborted', reason: { kind: 'disposed' } }), { kind: 'aborted', cause: 'disposed' })
  assert.deepEqual(turnEndReason(null), { kind: null, cause: null })

  assert.equal(turnEndStatus('completed', null), 'completed')
  assert.equal(turnEndStatus('interrupted', null), 'interrupted')
  assert.equal(turnEndStatus('aborted', 'user'), 'stopped')
  assert.equal(turnEndStatus('aborted', 'parent'), 'stopped')
  assert.equal(turnEndStatus('aborted', 'hook'), 'stopped')
  assert.equal(turnEndStatus('aborted', 'disposed'), 'interrupted')
  assert.equal(turnEndStatus('aborted', 'legacy'), 'stopped')
  assert.equal(turnEndStatus('error', null), 'failed')
  assert.equal(turnEndStatus('max-tokens', null), 'stopped')
  assert.equal(turnEndStatus('blocked', null), 'stopped')
  assert.equal(turnEndStatus('interrupted', null), 'interrupted')
  assert.equal(turnEndStatus('forked', null), 'stopped')
  assert.equal(turnEndStatus('some-plugin-reason', null), 'stopped')
})

test('turnStatus distinguishes running, interrupted, and closed turns', () => {
  const open = { turn: 1, startedAt: 1000, endedAt: null, endKind: null, endCause: null, toolCalls: 0 }
  assert.equal(turnStatus(open, true), 'running')
  assert.equal(turnStatus(open, false), 'interrupted')
  assert.equal(turnStatus({ ...open, endedAt: 2000, endKind: 'completed' }, false), 'completed')
  assert.equal(turnStatus({ ...open, endedAt: 2000, endKind: 'interrupted' }, false), 'interrupted')
  assert.equal(turnStatus({ ...open, endedAt: 2000, endKind: 'error' }, false), 'failed')
  assert.equal(turnStatus({ ...open, endedAt: 2000, endKind: 'aborted', endCause: 'disposed' }, true), 'interrupted')
  // A synthetic fork closer keeps only the ending: its closed reason wins over
  // the missing start, and an open turn without a start still follows liveness.
  const synthetic = { turn: 3, startedAt: null, endedAt: 5000, endKind: 'forked', endCause: null, toolCalls: 0 }
  assert.equal(turnStatus(synthetic, false), 'stopped')
  assert.equal(turnStatus({ ...synthetic, endKind: 'completed' }, false), 'completed')
  assert.equal(turnStatus({ ...synthetic, endKind: 'error' }, false), 'failed')
  assert.equal(turnStatus({ ...synthetic, endKind: 'aborted', endCause: 'user' }, false), 'stopped')
  assert.equal(turnStatus({ turn: 4, startedAt: null, endedAt: null, endKind: null, endCause: null, toolCalls: 0 }, true), 'running')
  assert.equal(turnStatus({ turn: 4, startedAt: null, endedAt: null, endKind: null, endCause: null, toolCalls: 0 }, false), 'interrupted')
})

test('a forked closer folded without its start is stopped, not interrupted', () => {
  const fold = foldSessionLog([event(1, 5000, 'turn/end', { turn: 3, reason: { kind: 'forked' } })])
  assert.equal(fold.turns.length, 1)
  assert.equal(fold.turns[0].startedAt, null)
  assert.equal(fold.turns[0].endedAt, 5000)
  assert.equal(turnStatus(fold.turns[0], false), 'stopped')
  const { runs, totalRuns } = buildRuns({ sessions: [{ sessionId: 's', title: 'S', running: false, turns: fold.turns, jobs: [], callIdToTurn: new Map() }] })
  assert.equal(totalRuns, 1)
  assert.equal(runs[0].status, 'stopped')
})

test('associateJobs prefers the tool-call mapping, then time containment, then the nearest preceding turn', () => {
  const fold = foldSessionLog([
    turnStart(1, 1000, 1),
    toolCall(2, 1100, 1, 'call-1'),
    turnEnd(3, 2000, 1),
    turnStart(4, 3000, 2),
    turnEnd(5, 4000, 2)
  ])
  const jobs = [
    // Timestamp drifts into turn 2 but the creating call belongs to turn 1.
    { jobId: 'mapped', startedAt: 3200, finishedAt: 3300, callId: 'call-1', rootCallId: 'call-1' },
    // No call mapping: contained by turn 1.
    { jobId: 'contained', startedAt: 1500, finishedAt: 1600, callId: null, rootCallId: null },
    // No call mapping, started after every measured turn: nearest preceding.
    { jobId: 'outliving', startedAt: 9000, finishedAt: 9100, callId: null, rootCallId: null },
    // Precedes every turn: not guessed.
    { jobId: 'orphan', startedAt: 100, finishedAt: 200, callId: null, rootCallId: null }
  ]
  const byTurn = associateJobs(fold.turns, jobs, fold.callIdToTurn)
  assert.deepEqual(byTurn.get(1).map((job) => job.jobId), ['contained', 'mapped'])
  // Background work that started after the last measured turn belongs to it.
  assert.deepEqual(byTurn.get(2).map((job) => job.jobId), ['outliving'])
  const assigned = [...byTurn.values()].flat().map((job) => job.jobId)
  assert.equal(assigned.length, 3)
  assert.equal(assigned.includes('orphan'), false)
})

test('buildRuns builds newest-first runs with nested jobs, caps, and statuses', () => {
  const foldA = foldSessionLog([
    turnStart(1, 1000, 1),
    toolCall(2, 1100, 1, 'call-1'),
    jobRegistered(3, 1200, 'job-1', 'call-1'),
    jobSettled(4, 1400, 'job-1', 'completed', 'call-1'),
    turnEnd(5, 2000, 1),
    turnStart(6, 3000, 2),
    toolCall(7, 3100, 2, 'call-2'),
    jobRegistered(8, 3200, 'job-2', 'call-2')
  ])
  const foldB = foldSessionLog([
    turnStart(1, 500, 1),
    turnEnd(2, 900, 1, { kind: 'error', error: { message: 'boom' } })
  ])
  const sessionA = {
    sessionId: 'session-a',
    title: 'A',
    running: true,
    turns: foldA.turns,
    jobs: foldA.jobs,
    callIdToTurn: foldA.callIdToTurn
  }
  const sessionB = {
    sessionId: 'session-b',
    title: null,
    running: false,
    turns: foldB.turns,
    jobs: foldB.jobs,
    callIdToTurn: foldB.callIdToTurn
  }
  const { runs, totalRuns, truncated } = buildRuns({
    sessions: [sessionA, sessionB],
    maxRunsPerSession: MAX_RUNS_PER_SESSION,
    maxRuns: 200
  })
  assert.equal(totalRuns, 3)
  assert.equal(truncated, false)
  assert.deepEqual(runs.map((run) => run.id), ['session-a:2', 'session-a:1', 'session-b:1'])
  const running = runs[0]
  assert.equal(running.status, 'running')
  assert.equal(running.endedAt, null)
  assert.equal(running.durationMs, null)
  assert.equal(running.toolCalls, 1)
  assert.equal(running.jobCount, 1)
  assert.equal(running.jobs[0].jobId, 'job-2')
  assert.equal(running.jobs[0].status, 'running')
  assert.equal(running.jobs[0].turn, 2)
  const completed = runs[1]
  assert.equal(completed.status, 'completed')
  assert.equal(completed.durationMs, 1000)
  assert.equal(completed.jobs[0].durationMs, 200)
  assert.equal(completed.jobs[0].detail, 'exit code: 0')
  const failed = runs[2]
  assert.equal(failed.status, 'failed')
  assert.equal(failed.sessionTitle, null)
})

test('buildRuns caps runs per Session and in total while keeping the full count', () => {
  const turns = []
  for (let turn = 1; turn <= 5; turn += 1) {
    turns.push({ turn, startedAt: turn * 1000, endedAt: turn * 1000 + 500, endKind: 'completed', endCause: null, toolCalls: 0 })
  }
  const session = { sessionId: 's', title: 'S', running: false, turns, jobs: [], callIdToTurn: new Map() }
  const capped = buildRuns({ sessions: [session], maxRunsPerSession: 2, maxRuns: 200 })
  assert.equal(capped.totalRuns, 5)
  assert.equal(capped.truncated, true)
  assert.deepEqual(capped.runs.map((run) => run.turn), [5, 4])
  const global = buildRuns({ sessions: [session], maxRunsPerSession: 5, maxRuns: 3 })
  assert.equal(global.runs.length, 3)
  assert.equal(global.truncated, true)
})

test('buildRuns caps the nested job rows but reports jobCount', () => {
  const turns = [{ turn: 1, startedAt: 0, endedAt: 10, endKind: 'completed', endCause: null, toolCalls: 0 }]
  const jobs = []
  for (let index = 0; index < 4; index += 1) {
    jobs.push({ jobId: `job-${index}`, kind: 'bash', label: 'x', startedAt: index, finishedAt: index + 1, status: 'completed', detail: null, callId: null, rootCallId: null })
  }
  const session = { sessionId: 's', title: 'S', running: false, turns, jobs, callIdToTurn: new Map() }
  const { runs } = buildRuns({ sessions: [session], maxJobsPerRun: 2 })
  assert.equal(runs[0].jobCount, 4)
  assert.equal(runs[0].jobs.length, 2)
})

test('computeStats counts today and averages only measurable completed turns', () => {
  const dayStart = new Date(2026, 10, 11, 0, 0, 0, 0).getTime()
  const sessions = [
    {
      sessionId: 'a',
      running: true,
      turns: [
        { turn: 1, startedAt: dayStart - 5000, endedAt: dayStart - 4000, endKind: 'completed', endCause: null, toolCalls: 0 },
        { turn: 2, startedAt: dayStart + 1000, endedAt: dayStart + 2000, endKind: 'completed', endCause: null, toolCalls: 0 },
        { turn: 3, startedAt: dayStart + 3000, endedAt: dayStart + 6000, endKind: 'completed', endCause: null, toolCalls: 0 },
        { turn: 4, startedAt: dayStart + 7000, endedAt: dayStart + 8000, endKind: 'error', endCause: null, toolCalls: 0 },
        { turn: 5, startedAt: dayStart + 9000, endedAt: null, endKind: null, endCause: null, toolCalls: 0 }
      ]
    },
    { sessionId: 'b', running: false, turns: [] }
  ]
  const stats = computeStats({ sessions, dayStart, truncatedSessions: true })
  assert.equal(stats.runningSessions, 1)
  assert.equal(stats.completedToday, 2)
  assert.equal(stats.totalRuns, 5)
  assert.equal(stats.completedRuns, 3)
  assert.equal(stats.averageDurationMs, Math.round((1000 + 1000 + 3000) / 3))
  assert.equal(stats.measuredSessions, 2)
  assert.equal(stats.truncated, true)
})

test('computeStats reports a null average when no completed turn has timing', () => {
  const stats = computeStats({
    sessions: [
      {
        sessionId: 'a',
        running: false,
        turns: [
          { turn: 1, startedAt: null, endedAt: 5, endKind: 'completed', endCause: null, toolCalls: 0 },
          { turn: 2, startedAt: 10, endedAt: 20, endKind: 'aborted', endCause: 'user', toolCalls: 0 }
        ]
      }
    ],
    dayStart: 0
  })
  assert.equal(stats.completedRuns, 1)
  assert.equal(stats.averageDurationMs, null)
  // The turn ended at epoch 5, which is after the supplied day boundary 0.
  assert.equal(stats.completedToday, 1)
})

test('computeStats does not count synthetic fork boundaries as runs', () => {
  const dayStart = new Date(2026, 10, 11, 0, 0, 0, 0).getTime()
  const stats = computeStats({
    sessions: [
      {
        sessionId: 'forked',
        running: false,
        turns: [
          // The inherited start is absent; only the `turn/end` boundary survived.
          { turn: 3, startedAt: null, endedAt: dayStart + 6000, endKind: 'forked', endCause: null, toolCalls: 0 },
          { turn: 4, startedAt: dayStart + 1000, endedAt: dayStart + 4000, endKind: 'completed', endCause: null, toolCalls: 0 }
        ]
      }
    ],
    dayStart
  })
  assert.equal(stats.totalRuns, 1)
  assert.equal(stats.completedRuns, 1)
  assert.equal(stats.completedToday, 1)
  assert.equal(stats.averageDurationMs, 3000)
})

test('localDayStart returns local midnight', () => {
  const now = new Date(2026, 10, 11, 15, 30, 0, 0).getTime()
  const start = new Date(localDayStart(now))
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 10)
  assert.equal(start.getDate(), 11)
  assert.equal(start.getHours(), 0)
  assert.equal(start.getMinutes(), 0)
  assert.equal(start.getSeconds(), 0)
})

test('buildRecentActivity derives runs and session updates, one row per Session, ordered and capped', () => {
  const sessions = [
    { sessionId: 'a', title: 'A', lastActivityAt: 5000, turns: [] },
    { sessionId: 'b', title: 'B', lastActivityAt: 3600, turns: [] },
    { sessionId: 'c', title: 'C', lastActivityAt: 1000, turns: [] }
  ]
  const runs = [
    { id: 'a:1', sessionId: 'a', sessionTitle: 'A', turn: 1, status: 'completed', endedAt: 3000, startedAt: 2000 },
    { id: 'b:1', sessionId: 'b', sessionTitle: 'B', turn: 1, status: 'failed', endedAt: 3500, startedAt: 3000 },
    { id: 'b:2', sessionId: 'b', sessionTitle: 'B', turn: 2, status: 'interrupted', endedAt: 3600, startedAt: 3400 }
  ]
  const activity = buildRecentActivity({ sessions, runs, limit: 10 })
  // a's measured activity is newer than its run; b keeps its newest run; c
  // only has measured activity. One row per Session.
  assert.deepEqual(activity.map((row) => `${row.kind}:${row.sessionId}`), [
    'session-updated:a',
    'run-interrupted:b',
    'session-updated:c'
  ])
  assert.equal(activity[1].detail, 'turn 2')
  const capped = buildRecentActivity({ sessions, runs, limit: 2 })
  assert.equal(capped.length, 2)
  assert.equal(MAX_ACTIVITY, 8)
})

/**
 * Build a Host context for the project route.
 * @param {object} options - fixture options.
 * @param {Array<object>} options.workspaces - Workspace entities.
 * @param {Array<object>} [options.records] - corpus listing records.
 * @param {Map<string, object[]>} [options.logs] - Session id → events.
 * @param {Set<string>} [options.running] - running Session ids.
 * @param {Map<string, string>} [options.parentOf] - Session id → parent id.
 * @returns {{ ctx: object, routes: Map<string, object> }} context and registered routes.
 */
function makeContext({ workspaces, records = [], logs = new Map(), running = new Set(), parentOf = new Map(), projectionCache = undefined }) {
  const routes = new Map()
  const archivedSessionIds = workspaces.flatMap((workspace) => workspace.archived ?? [])
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    get: (name) => (name === 'sessionProjectionCache' ? projectionCache : undefined),
    agents: {
      get: (sessionId) => (running.has(sessionId) ? { status: 'running' } : undefined)
    },
    workspaceRegistry: {
      list: () => workspaces,
      get: (id) => workspaces.find((workspace) => workspace.id === id),
      archivedSessionIds
    },
    sessionQuery: {
      async listSessions() {
        return records.length > 0
          ? records
          : [...logs.keys()].map((id) => ({
            live: false,
            persisted: true,
            header: { id, createdAt: 1000, cwd: '/tmp/project', parentSession: parentOf.get(id) }
          }))
      },
      async readSession(sessionId) {
        const log = logs.get(sessionId)
        if (log === undefined) {
          const error = new Error('Session not found')
          error.code = 'SESSION_QUERY_SESSION_NOT_FOUND'
          throw error
        }
        return {
          session: { id: sessionId, createdAt: 1000, cwd: '/tmp/project', parentSession: parentOf.get(sessionId) },
          inheritedEventCount: 0,
          events: log
        }
      }
    },
    connection: {
      fetch: {
        register: (definition) => {
          routes.set(definition.path, definition)
          return () => {}
        }
      }
    }
  }
  return { ctx, routes }
}

/**
 * One Workspace entity fixture.
 * @param {object} overrides - field overrides.
 * @returns {object} the Workspace.
 */
function workspace(overrides = {}) {
  return {
    id: 'workspace-1',
    title: 'Project',
    path: '/tmp/project',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    sessionIds: ['session-a', 'session-b'],
    ...overrides
  }
}

test('project route rejects a request naming neither Workspace nor Session', async () => {
  const { ctx, routes } = makeContext({ workspaces: [workspace()] })
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  assert.equal(typeof route.fetch, 'function')
  const response = await route.fetch(new Request('http://host/api/power-suite.project'))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'bad-request')
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('project route reports an unknown Workspace', async () => {
  const { ctx, routes } = makeContext({ workspaces: [workspace()] })
  installProjectView(ctx)
  const response = await routes.get('/api/power-suite.project').fetch(
    new Request('http://host/api/power-suite.project?workspaceId=missing')
  )
  assert.equal(response.status, 404)
  assert.equal((await response.json()).code, 'workspace-not-found')
})

test('project route resolves a Session through its durable parent and returns a snapshot', async () => {
  const logs = new Map([
    ['session-a', [
      event(1, 1_700_000_000_000, 'session/title', { title: 'Alpha' }),
      turnStart(2, 1_700_000_000_100, 1),
      toolCall(3, 1_700_000_000_150, 1, 'call-a'),
      jobRegistered(4, 1_700_000_000_200, 'job-a', 'call-a'),
      jobSettled(5, 1_700_000_000_300, 'job-a', 'completed', 'call-a'),
      turnEnd(6, 1_700_000_000_400, 1)
    ]],
    ['session-b', [
      turnStart(1, 1_700_000_001_000, 1),
      turnEnd(2, 1_700_000_001_500, 1, { kind: 'interrupted' })
    ]],
    ['session-child', [
      turnStart(1, 1_700_000_002_000, 1)
    ]]
  ])
  const parentOf = new Map([['session-child', 'session-a']])
  const { ctx, routes } = makeContext({
    workspaces: [workspace({ sessionIds: ['session-a', 'session-b'] })],
    logs,
    running: new Set(['session-a']),
    parentOf
  })
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  const response = await route.fetch(new Request('http://host/api/power-suite.project?sessionId=session-child'))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.workspaceId, 'workspace-1')
  assert.equal(payload.focusSessionId, 'session-child')
  assert.equal(payload.project.title, 'Project')
  assert.equal(payload.project.state, 'active')
  assert.equal(payload.project.sessionCount, 2)
  assert.equal(payload.project.runningSessions, 1)
  assert.equal(payload.sessions.length, 2)
  const alpha = payload.sessions.find((session) => session.sessionId === 'session-a')
  assert.equal(alpha.title, 'Alpha')
  assert.equal(alpha.running, true)
  assert.equal(alpha.runCount, 1)
  assert.equal(payload.stats.totalRuns, 2)
  assert.equal(payload.stats.completedRuns, 1)
  assert.equal(payload.stats.runningSessions, 1)
  assert.equal(payload.stats.averageDurationMs, 300)
  assert.equal(payload.stats.completedToday >= 0, true)
  assert.equal(payload.runs.length, 2)
  const run = payload.runs.find((entry) => entry.sessionId === 'session-a')
  assert.equal(run.status, 'completed')
  assert.equal(run.jobs.length, 1)
  assert.equal(run.jobs[0].jobId, 'job-a')
  const interrupted = payload.runs.find((entry) => entry.sessionId === 'session-b')
  assert.equal(interrupted.status, 'interrupted')
  assert.equal(payload.sessions.find((session) => session.sessionId === 'session-b').interrupted, true)
  assert.ok(payload.recentActivity.length >= 1)
  assert.equal(payload.limits.sessions, 20)
  assert.equal(payload.warnings.length, 0)
})

test('project route skips an unreadable Session log with a warning and keeps the rest', async () => {
  const logs = new Map([
    ['session-a', [turnStart(1, 1_700_000_000_000, 1), turnEnd(2, 1_700_000_000_500, 1)]]
  ])
  const records = [
    { live: false, persisted: true, header: { id: 'session-a', createdAt: 1000, cwd: '/tmp/project' } },
    { live: false, persisted: true, header: { id: 'session-missing', createdAt: 900, cwd: '/tmp/project' } }
  ]
  const { ctx, routes } = makeContext({
    workspaces: [workspace({ sessionIds: ['session-a', 'session-missing'] })],
    records,
    logs
  })
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  const response = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.sessions.length, 1)
  assert.equal(payload.warnings.length, 1)
  assert.equal(payload.warnings[0].sessionId, 'session-missing')
})

test('project route warnings keep a bounded error identity for fold/programming failures', async () => {
  const logs = new Map([
    ['session-a', [turnStart(1, 1_700_000_000_000, 1), turnEnd(2, 1_700_000_000_500, 1)]]
  ])
  const { ctx, routes } = makeContext({ workspaces: [workspace({ sessionIds: ['session-a'] })], logs })
  ctx.sessionQuery.readSession = async () => {
    throw new TypeError('fold exploded')
  }
  installProjectView(ctx)
  const response = await routes.get('/api/power-suite.project').fetch(
    new Request('http://host/api/power-suite.project?workspaceId=workspace-1')
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.sessions.length, 0)
  assert.equal(payload.warnings.length, 1)
  assert.match(payload.warnings[0].message, /TypeError: fold exploded/)
})

test('project cache identity includes archived members and the focus Session', async () => {
  let reads = 0
  const logs = new Map([
    ['session-a', [turnStart(1, 1_700_000_000_000, 1), turnEnd(2, 1_700_000_000_500, 1)]],
    ['session-b', [turnStart(1, 1_700_000_001_000, 1), turnEnd(2, 1_700_000_001_500, 1)]]
  ])
  const { ctx, routes } = makeContext({ workspaces: [workspace({ sessionIds: ['session-a', 'session-b'] })], logs })
  const originalRead = ctx.sessionQuery.readSession
  ctx.sessionQuery.readSession = async (sessionId) => {
    reads += 1
    return originalRead(sessionId)
  }
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  const first = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal((await first.json()).sessions.length, 2)
  const readsAfterFirst = reads
  // Same request inside the TTL is warm.
  await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal(reads, readsAfterFirst)
  // A different focus Session changes the payload, so it must not reuse the cache.
  const focused = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1&sessionId=session-a'))
  assert.equal((await focused.json()).focusSessionId, 'session-a')
  assert.ok(reads > readsAfterFirst)
  // Archiving a member changes the payload even though workspace.updatedAt and
  // the member count are unchanged, so the cache must be bypassed.
  const readsBeforeArchive = reads
  ctx.workspaceRegistry.archivedSessionIds.push('session-a')
  const archived = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal((await archived.json()).sessions.length, 1)
  assert.ok(reads > readsBeforeArchive)
  // Archiving an unrelated Session does not affect this Workspace's payload.
  const readsBeforeUnrelated = reads
  ctx.workspaceRegistry.archivedSessionIds.push('session-unrelated')
  await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal(reads, readsBeforeUnrelated)
})

test('project snapshot cache outlives the 15s page poll and refresh=1 still bypasses it', async () => {
  assert.ok(PROJECT_CACHE_TTL_MS >= 20_000 && PROJECT_CACHE_TTL_MS <= 60_000)
  let reads = 0
  const logs = new Map([
    ['session-a', [turnStart(1, 1_700_000_000_000, 1), turnEnd(2, 1_700_000_000_500, 1)]]
  ])
  const { ctx, routes } = makeContext({ workspaces: [workspace({ sessionIds: ['session-a'] })], logs })
  const originalRead = ctx.sessionQuery.readSession
  ctx.sessionQuery.readSession = async (sessionId) => {
    reads += 1
    return originalRead(sessionId)
  }
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
  try {
    await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
    const readsAfterFirst = reads
    assert.ok(readsAfterFirst > 0)
    // One 15s page poll is served warm by the 25s cache.
    mock.timers.tick(15_000)
    await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
    assert.equal(reads, readsAfterFirst)
    // A manual refresh bypasses the warm cache immediately.
    await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1&refresh=1'))
    assert.ok(reads > readsAfterFirst)
    // Past the TTL the next poll is cold again.
    const readsBeforeExpiry = reads
    mock.timers.tick(PROJECT_CACHE_TTL_MS + 1_000)
    await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
    assert.ok(reads > readsBeforeExpiry)
  } finally {
    mock.timers.reset()
  }
})

test('project route serves a warm cache and refresh=1 bypasses it', async () => {
  let reads = 0
  const logs = new Map([
    ['session-a', [turnStart(1, 1_700_000_000_000, 1), turnEnd(2, 1_700_000_000_500, 1)]]
  ])
  const { ctx, routes } = makeContext({ workspaces: [workspace({ sessionIds: ['session-a'] })], logs })
  const originalRead = ctx.sessionQuery.readSession
  ctx.sessionQuery.readSession = async (sessionId) => {
    reads += 1
    return originalRead(sessionId)
  }
  installProjectView(ctx)
  const route = routes.get('/api/power-suite.project')
  const first = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal(first.status, 200)
  const readsAfterFirst = reads
  const second = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1'))
  assert.equal(second.status, 200)
  assert.equal(reads, readsAfterFirst)
  const refreshed = await route.fetch(new Request('http://host/api/power-suite.project?workspaceId=workspace-1&refresh=1'))
  assert.equal(refreshed.status, 200)
  assert.ok(reads > readsAfterFirst)
})
