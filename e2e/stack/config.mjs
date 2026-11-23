// Configuration of the e2e stack, shared by the stack (Node) and the tests (Playwright).
// Every port can be moved with an environment variable; none of them is a port used by the
// development servers (4200 frontend, 3001 backend, 4400 start:prod), so a running dev backend,
// connected to the Atlas `dev` database, can never be reached by the tests.

const port = (name, fallback) => Number(process.env[name] ?? fallback);

/** Frontend (production build + /api/v1 proxy, as Caddy in production). */
export const FRONTEND_PORT = port('E2E_FRONTEND_PORT', 4410);
/** Backend (`next start`, production build). */
export const BACKEND_PORT = port('E2E_BACKEND_PORT', 3110);
/** Fake Clash of Clans API + control API of the stack (`/__e2e/*`). */
export const FAKES_PORT = port('E2E_FAKES_PORT', 4610);
/** SMTP sink: every email the backend sends lands here, nothing leaves the machine. */
export const SMTP_PORT = port('E2E_SMTP_PORT', 4625);

export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const FAKES_URL = `http://127.0.0.1:${FAKES_PORT}`;

/** Main clan (`CLAN_TAG`) and the sister clans of the Crusade, as in the backend. */
export const CLANS = {
  nera: '#2J8JVVCLC',
  rossa: '#2JU8RPR2G',
  oro: '#2RRYUGQYJ',
};

/** In-game API token the fake `verifytoken` accepts for every known player. */
export const VALID_PLAYER_TOKEN = 'e2e-valid-token';
/** A player whose token check always fails on the game's side (503). */
export const VERIFY_UNAVAILABLE_TAG = '#VERIFY503';
/** A tag the fake API does not know (404). */
export const UNKNOWN_PLAYER_TAG = '#NOSUCH999';

/** Administrator created by the stack at start-up (email confirmed: listed in ADMIN_EMAILS). */
export const SHARED_ADMIN = {
  email: 'admin@e2e.test',
  username: 'e2e-admin',
  password: 'E2e-admin-pass-1',
};

/**
 * Extra addresses in ADMIN_EMAILS, handed out to tests that need an administrator of their own and
 * given back when the test's clean-up has deleted that administrator: the limit is administrators
 * alive at the same time (a handful per worker), not tests per stack.
 */
export const ADMIN_POOL_SIZE = 300;
export const adminPoolEmail = (index) => `admin-${String(index).padStart(2, '0')}@e2e.test`;

/** Domain of every account created by the tests. */
export const TEST_EMAIL_DOMAIN = 'e2e.test';
