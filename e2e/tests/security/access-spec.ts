/**
 * WHO MAY CALL EACH API OPERATION — the security requirement, written down and reviewed by hand.
 *
 * This table is the expectation of `authorization-matrix.spec.ts`. It is deliberately NOT read from
 * the backend: the matrix fails when
 *   - the backend enforces something else than this table (a route left open, or closed by mistake);
 *   - the backend's OpenAPI document (`x-access`) says something else than this table;
 *   - an operation exists in the API and not here, or here and not in the API.
 * So adding a route or changing who may call it always shows up as a change of this file in review.
 * Change a level only together with the decision behind it (and the `crn-access-control` skill).
 *
 * Levels (each includes the ones before it, from `user` to `admin`):
 *   public    anyone, signed in or not
 *   user      any signed-in user
 *   clan      verified game account in a clan of the Crusade (Nera, Rossa, d'Oro) — or administrator
 *   leader    leader/co-leader of a clan of the Crusade — or administrator
 *   chief     the leader of Crociata Nera (decides the CWL line-up) — or administrator
 *   admin     ADMIN role (the API documentation: administrators only in production)
 *   cron      nobody with a user token: only the scheduler's secret (`CRON_SECRET`)
 *   telegram  nobody: only Telegram, with the webhook secret (not configured in the stack)
 *
 * `probe` is the call made for a caller who IS allowed, and the exact answer expected. Probes never
 * change shared data: writes go to ids that do not exist or carry a body that fails validation, so
 * the answer proves the caller got past the access check without anything being done.
 * Path parameters in `{}` are filled by the matrix with real values of the stack (see `PARAMS`).
 */

export type Access = 'public' | 'user' | 'clan' | 'leader' | 'chief' | 'admin' | 'cron' | 'telegram';

export interface Probe {
  /** Path to call instead of the operation's (e.g. an id that does not exist). */
  path?: string;
  /** JSON body; `INVALID_BODY` fails validation of any route that reads one. */
  body?: unknown;
  /** Extra headers (e.g. an unknown refresh cookie, so the caller's own session is not touched). */
  headers?: Record<string, string>;
  /** Exact status expected for an allowed caller. */
  status: number;
  /** Message key the answer must carry, when it is the point. */
  key?: string;
}

export interface Rule {
  access: Access;
  probe: Probe;
}

/** A JSON body no route accepts (an array where every route expects an object or a form). */
export const INVALID_BODY = ['e2e-invalid-body'];
/** Ids that exist nowhere: writes aimed at them change nothing. */
const NO_ID = '0123456789abcdef01234567';
const NO_TAG = '%23E2ENOPE00';
/** A refresh cookie that opens no session: the cookie routes never touch the caller's own. */
const UNKNOWN_SESSION = { cookie: 'cn_refresh=e2e-unknown-session' };
const TELEGRAM_OFF = { status: 409, key: 'ERROR.TELEGRAM_NOT_CONFIGURED' } as const;

const ok = { status: 200 } as const;
const invalid = (key?: string): Probe => ({ body: INVALID_BODY, status: 400, key });

export const ACCESS_SPEC: Record<string, Rule> = {
  // Authentication: open to everyone (the session itself is the credential).
  'POST /auth/sign-up': { access: 'public', probe: invalid() },
  'POST /auth/sign-in': { access: 'public', probe: invalid() },
  'POST /auth/refresh': {
    access: 'public',
    probe: { headers: UNKNOWN_SESSION, status: 401, key: 'ERROR.INVALID_REFRESH_TOKEN' },
  },
  // Idempotent: an unknown session is simply not there to close.
  'POST /auth/sign-out': { access: 'public', probe: { headers: UNKNOWN_SESSION, status: 200 } },
  'POST /auth/forgot-password': { access: 'public', probe: invalid() },
  'POST /auth/reset-password': { access: 'public', probe: invalid() },
  'POST /auth/verify-email': { access: 'public', probe: invalid() },

  // The signed-in user's own account.
  'GET /auth/me': { access: 'user', probe: ok },
  'GET /auth/me/memberships': { access: 'user', probe: ok },
  'POST /auth/me/player': { access: 'user', probe: invalid() },
  // Idempotent: unlinking an account the user does not have changes nothing.
  'DELETE /auth/me/player/{tag}': {
    access: 'user',
    probe: { path: `/auth/me/player/${NO_TAG}`, status: 200 },
  },
  'POST /auth/change-password': { access: 'user', probe: invalid() },
  'POST /auth/verify-email/resend': { access: 'user', probe: invalid() },

  // Public pages: only what the welcome page shows, and the base pictures (random keys).
  'GET /welcome': { access: 'public', probe: ok },
  'GET /clan/records': { access: 'public', probe: ok },
  'GET /base-images/{key}/{variant}': { access: 'public', probe: { status: 404 } },
  'GET /health': { access: 'public', probe: ok },

  // The clans' data: members of the Crusade only.
  'GET /clan': { access: 'clan', probe: ok },
  'GET /wars': { access: 'clan', probe: ok },
  'GET /wars/archive': { access: 'clan', probe: ok },
  'GET /wars/history': { access: 'clan', probe: ok },
  'GET /wars/current': { access: 'clan', probe: ok },
  'GET /wars/warlog': { access: 'clan', probe: ok },
  'GET /wars/{warKey}': { access: 'clan', probe: ok },
  'GET /wars/{warKey}/participants': { access: 'clan', probe: ok },
  'GET /history': { access: 'clan', probe: ok },
  'GET /history/{period}': { access: 'clan', probe: ok },
  'GET /history/{period}/ranking': { access: 'clan', probe: ok },
  'GET /history/{period}/wars': { access: 'clan', probe: ok },
  'GET /players': { access: 'clan', probe: ok },
  'GET /players/{tag}': { access: 'clan', probe: ok },
  'GET /players/{tag}/wars': { access: 'clan', probe: ok },
  'GET /players/{tag}/profile': { access: 'clan', probe: ok },
  'GET /cwl/seasons': { access: 'clan', probe: ok },
  'GET /cwl/seasons/{season}': { access: 'clan', probe: { status: 404 } },
  'GET /cwl/seasons/{season}/players': { access: 'clan', probe: { status: 404 } },
  'GET /raids/seasons': { access: 'clan', probe: ok },
  'GET /raids/seasons/{startTime}/members': { access: 'clan', probe: ok },
  'GET /donations/seasons': { access: 'clan', probe: ok },
  'GET /legends/seasons/latest': { access: 'clan', probe: ok },
  'GET /bases': { access: 'clan', probe: ok },
  'GET /bases/{id}': { access: 'clan', probe: { path: `/bases/${NO_ID}`, status: 404 } },
  'POST /base-proposals': { access: 'clan', probe: invalid() },
  'GET /base-proposals/mine': { access: 'clan', probe: ok },
  'PATCH /base-proposals/{id}': {
    access: 'clan',
    probe: { path: `/base-proposals/${NO_ID}`, body: INVALID_BODY, status: 400 },
  },
  'DELETE /base-proposals/{id}': {
    access: 'clan',
    probe: { path: `/base-proposals/${NO_ID}`, status: 404 },
  },

  // CWL line-up selection: every member reads it, the leader of Crociata Nera and administrators decide.
  'GET /cwl/selection': { access: 'clan', probe: ok },
  'GET /cwl/selection/players': { access: 'clan', probe: ok },
  'POST /cwl/selection/{season}/close': {
    access: 'chief',
    probe: { path: '/cwl/selection/2000-01/close', status: 404 },
  },
  'POST /cwl/selection/{season}/reopen': {
    access: 'chief',
    probe: { path: '/cwl/selection/2000-01/reopen', status: 404 },
  },
  'PUT /cwl/selection/exclusions/{tag}': {
    access: 'chief',
    probe: { path: `/cwl/selection/exclusions/${NO_TAG}`, body: INVALID_BODY, status: 400 },
  },
  // Idempotent: readmitting a player who was never excluded changes nothing.
  'DELETE /cwl/selection/exclusions/{tag}': {
    access: 'chief',
    probe: { path: `/cwl/selection/exclusions/${NO_TAG}`, status: 200 },
  },

  // Administration.
  'GET /admin/users': { access: 'admin', probe: ok },
  'PATCH /admin/users/{id}': {
    access: 'admin',
    probe: { path: `/admin/users/${NO_ID}`, body: INVALID_BODY, status: 400 },
  },
  'DELETE /admin/users/{id}': {
    access: 'admin',
    probe: { path: `/admin/users/${NO_ID}`, body: INVALID_BODY, status: 400 },
  },
  'POST /admin/users/{id}/players': {
    access: 'admin',
    probe: { path: `/admin/users/${NO_ID}/players`, body: INVALID_BODY, status: 400 },
  },
  'DELETE /admin/users/{id}/players/{tag}': {
    access: 'admin',
    probe: { path: `/admin/users/${NO_ID}/players/${NO_TAG}`, status: 404 },
  },
  'POST /admin/players/sync': { access: 'admin', probe: ok },
  'GET /admin/publishing/pending-count': { access: 'admin', probe: ok },
  'POST /bases': { access: 'admin', probe: invalid() },
  'PATCH /bases/{id}': {
    access: 'admin',
    probe: { path: `/bases/${NO_ID}`, body: INVALID_BODY, status: 400 },
  },
  'DELETE /bases/{id}': { access: 'admin', probe: { path: `/bases/${NO_ID}`, status: 404 } },
  'GET /base-proposals': { access: 'admin', probe: ok },
  'POST /base-proposals/{id}/approve': {
    access: 'admin',
    probe: { path: `/base-proposals/${NO_ID}/approve`, status: 404 },
  },
  'POST /base-proposals/{id}/reject': {
    access: 'admin',
    probe: { path: `/base-proposals/${NO_ID}/reject`, body: INVALID_BODY, status: 400 },
  },
  'GET /admin/telegram': { access: 'admin', probe: ok },
  'POST /admin/telegram/chats': { access: 'admin', probe: invalid() },
  'PATCH /admin/telegram/chats/{chatId}': {
    access: 'admin',
    probe: { path: '/admin/telegram/chats/-1001', body: INVALID_BODY, status: 400 },
  },
  'DELETE /admin/telegram/chats/{chatId}': {
    access: 'admin',
    probe: { path: '/admin/telegram/chats/-1001', status: 404 },
  },
  'POST /admin/telegram/sync': { access: 'admin', probe: TELEGRAM_OFF },
  'GET /admin/announcements': { access: 'admin', probe: ok },
  'GET /admin/announcements/settings': { access: 'admin', probe: ok },
  'PUT /admin/announcements/settings': { access: 'admin', probe: invalid() },
  'PATCH /admin/announcements/{id}': {
    access: 'admin',
    probe: { path: `/admin/announcements/${NO_ID}`, body: INVALID_BODY, status: 400 },
  },
  'POST /admin/announcements/{id}/publish': {
    access: 'admin',
    probe: { path: `/admin/announcements/${NO_ID}/publish`, ...TELEGRAM_OFF },
  },
  'POST /admin/announcements/{id}/discard': {
    access: 'admin',
    probe: { path: `/admin/announcements/${NO_ID}/discard`, status: 404 },
  },
  'GET /admin/announcements/{id}/images/{page}': {
    access: 'admin',
    probe: { path: `/admin/announcements/${NO_ID}/images/1`, status: 404 },
  },
  // The API documentation: administrators only in production (the stack runs in production mode).
  'GET /openapi.json': { access: 'admin', probe: ok },
  'GET /docs': { access: 'admin', probe: ok },

  // Machine-to-machine: no user token opens them.
  'POST /cron/war-sync': { access: 'cron', probe: { status: 401 } },
  'POST /telegram/webhook': { access: 'telegram', probe: { status: 404 } },
};
