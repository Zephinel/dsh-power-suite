/**
 * Host half of the suite's `prompt-history` feature.
 *
 * One authenticated route serves the complete prompt history of one Session,
 * read from the Session log rather than from the loaded chat window. That is
 * what makes Up recall prompts from turns the browser has not paged in.
 */

import { PROMPT_HISTORY_ROUTE, collectPromptHistory } from './history.ts'

/**
 * Answer with JSON and a no-store policy: the history grows with the log.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @returns {Response} the response.
 */
function sendJson(status: any, payload: any) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * `GET /api/prompt-history.list?sessionId=<id>` — one Session's sent prompts.
 * @param {Record<string, any>} ctx - Host context carrying Session query.
 * @param {Request} request - authenticated request.
 * @returns {Promise<Response>} the prompt list or a typed failure.
 */
async function handleList(ctx: any, request: any) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId === null || sessionId.trim().length === 0) {
    return sendJson(400, { code: 'bad-request', message: 'sessionId is required' })
  }
  let snapshot
  try {
    snapshot = await ctx.sessionQuery.readSession(sessionId)
  } catch (error: any) {
    const code = error !== null && typeof error === 'object' ? error.code : undefined
    if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
      return sendJson(404, { code: 'session-not-found', message: 'Session not found' })
    }
    return sendJson(500, {
      code: 'history-failed',
      message: typeof error?.message === 'string' ? error.message : 'Prompt history unavailable'
    })
  }
  return sendJson(200, { sessionId, prompts: collectPromptHistory(snapshot.events) })
}

/**
 * Register the history route inside Connection's authentication fence.
 * @param {Record<string, any>} ctx - Host context.
 * @returns {void}
 */
export function installPromptHistory(ctx: any) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: PROMPT_HISTORY_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request: any) => handleList(ctx, request)
  }), `power-suite: prompt-history GET ${PROMPT_HISTORY_ROUTE}`)
}
