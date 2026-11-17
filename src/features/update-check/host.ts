/**
 * Host route that serves the suite's cached npm update check to the browser.
 *
 * The route lives inside Connection's authentication and Host/Origin fence, so
 * only the owner's browser reaches it. It always answers `200` with the view: a
 * failed registry read is a `latest: null` answer, not an error surface.
 */

import { createUpdateChecker } from './checker.ts'

/** Same-origin exact route serving the cached update check. */
export const UPDATE_ROUTE = '/api/power-suite.update'

/**
 * Register the update-check route inside Connection's authentication fence.
 * @param {Record<string, any>} ctx - Host context carrying `connection`.
 * @returns {void}
 */
export function installUpdateCheck(ctx) {
  const check = createUpdateChecker()
  ctx.effect(() => ctx.connection.fetch.register({
    path: UPDATE_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const language = new URL(request.url).searchParams.get('lang')
      return Response.json(await check(language), { headers: { 'cache-control': 'no-store' } })
    }
  }), `power-suite: update check GET ${UPDATE_ROUTE}`)
}
