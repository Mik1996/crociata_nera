#!/usr/bin/env node
// Starts the isolated e2e stack and keeps it running until stopped (Ctrl+C / SIGTERM):
//
//   MongoDB in memory ── backend (`next start`, production build) ── frontend (production build
//   served as by Caddy, /api/v1 proxied) ── fake Clash of Clans API, Telegram stand-in, SMTP sink
//
// Nothing of the developer's environment reaches the backend: it gets a minimal environment with
// every configuration variable set explicitly (Next.js never overrides a variable that is already
// set, so `backend/.env.local`, with the `dev` database and the dev bot, cannot leak in), and every
// external service points at a local fake. On top of that, both servers run with a network guard
// (`no-egress.cjs`): they can connect only to the loopback ports of the stack, nothing else, not even
// a development server on the same machine. Before reporting ready the stack checks that the guard
// is active in both servers (self-test), that the backend really writes to the in-memory database
// and that it reads the fake game API.
//
// Started by Playwright (`webServer` in playwright.config.ts) or by hand: `npm run e2e:stack`.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  ADMIN_POOL_SIZE,
  adminPoolEmail,
  BACKEND_PORT,
  BACKEND_URL,
  CLANS,
  FAKES_PORT,
  FAKES_URL,
  FRONTEND_PORT,
  FRONTEND_URL,
  SHARED_ADMIN,
  SMTP_PORT,
} from './config.mjs';
import { startFakes } from './fakes.mjs';
import { buildGameData } from './game-data.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const BACKEND = join(ROOT, 'backend');
const LOGS = join(ROOT, 'e2e/.artifacts/stack');
const backendRequire = createRequire(join(BACKEND, 'package.json'));
const EGRESS_GUARD = join(ROOT, 'e2e/stack/no-egress.cjs');

const log = (message) => console.log(`[e2e-stack] ${message}`);
const children = [];
/**
 * What the network guard reported in each server: active, self-test result, blocked attempts
 * (self-test attempts excluded). Read by the tests through `/__e2e/egress`.
 */
const egress = {};
let mongo;
let fakes;
let stopping = false;

async function main() {
  checkBuilds();
  mkdirSync(LOGS, { recursive: true });

  // 1. MongoDB in memory (the binary of the backend tests, downloaded once by mongodb-memory-server).
  const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  const databaseUrl = mongo.getUri('crociata-nera-e2e');
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(databaseUrl))
    throw new Error(`unexpected database URL ${databaseUrl}`);
  const { MongoClient, ObjectId } = backendRequire('mongodb');
  const client = await MongoClient.connect(databaseUrl);
  const database = client.db();
  log(`MongoDB in memory on ${new URL(databaseUrl.replace('mongodb', 'http')).host}`);

  // 2. Fake external services.
  const data = buildGameData(new Date());
  const startedAt = new Date().toISOString();
  fakes = startFakes({
    data,
    port: FAKES_PORT,
    smtpPort: SMTP_PORT,
    stackInfo: () => ({
      e2e: true,
      startedAt,
      frontendUrl: FRONTEND_URL,
      admin: SHARED_ADMIN,
      clans: CLANS,
    }),
    db: {
      find: (collection, filter, projection) =>
        findDocuments(database, ObjectId, collection, filter, projection),
    },
    egress: () => egress,
  });
  await fakes.listen();
  log(
    `fake Clash of Clans API and control API on ${FAKES_URL}, SMTP sink on 127.0.0.1:${SMTP_PORT}`,
  );

  // 3. Backend, production build, isolated environment, network limited to the database, the fakes
  //    and the SMTP sink.
  const cronSecret = randomBytes(24).toString('hex');
  const mongoPort = Number(new URL(databaseUrl.replace('mongodb', 'http')).port);
  spawnChild(
    'backend',
    process.execPath,
    [
      backendRequire.resolve('next/dist/bin/next'),
      'start',
      '--port',
      String(BACKEND_PORT),
      '--hostname',
      '127.0.0.1',
    ],
    {
      cwd: BACKEND,
      env: {
        ...backendEnv(databaseUrl, cronSecret),
        ...guardEnv([mongoPort, FAKES_PORT, SMTP_PORT]),
      },
    },
  );

  // 4. Frontend, production build, /api/v1 forwarded to the e2e backend (its only connection).
  spawnChild('frontend', process.execPath, [join(ROOT, 'scripts/serve-prod.mjs')], {
    cwd: ROOT,
    env: {
      ...minimalEnv(),
      PORT: String(FRONTEND_PORT),
      API_TARGET: BACKEND_URL,
      ...guardEnv([BACKEND_PORT]),
    },
  });

  await waitFor(`${FRONTEND_URL}/api/v1/health`, 90_000);
  await waitFor(`${FRONTEND_URL}/`, 30_000);
  await waitForGuards(['backend', 'frontend'], 15_000);
  log(`backend on ${BACKEND_URL}, frontend on ${FRONTEND_URL}, network guard active in both`);

  // 5. Game data through the real synchronisation: each ended war is seen once as `warEnded`, then
  //    the war on its battle day. Every step of the scheduler runs (members, raids, records…).
  for (const war of [...data.endedWars, data.battleDay]) {
    fakes.setCurrentWar(war);
    const response = await api('POST', '/cron/war-sync', undefined, {
      authorization: `Bearer ${cronSecret}`,
    });
    if (response.status !== 200 || response.body.result?.error) {
      throw new Error(`war sync failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }
  const wars = await database.collection('Wars').countDocuments({ clanTag: CLANS.nera });
  if (wars !== 4) throw new Error(`expected 4 wars of the main clan after seeding, found ${wars}`);
  if (!fakes.cocRequests.some((path) => path.startsWith('/clans/')))
    throw new Error('the backend never called the fake Clash of Clans API');

  // 6. Shared administrator, through the real sign-up and email confirmation.
  await createSharedAdmin(database);

  fakes.setReady();
  log(`ready: ${FRONTEND_URL} (logs in e2e/.artifacts/stack)`);
}

/** Only what Node needs; no variable of the developer's shell reaches the servers. */
function minimalEnv() {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'SYSTEMROOT', 'USERPROFILE'];
  return Object.fromEntries(
    keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]),
  );
}

function backendEnv(databaseUrl, cronSecret) {
  // Variables of the backend's env files are blanked first: a variable already set (even empty)
  // is never overridden by Next.js, so no value of `.env.local` can apply.
  const blanked = {};
  for (const file of readdirSync(BACKEND).filter(
    (f) => f.startsWith('.env') && f !== '.env.example',
  )) {
    for (const line of readFileSync(join(BACKEND, file), 'utf8').split('\n')) {
      const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      if (name) blanked[name] = '';
    }
  }
  const admins = [
    SHARED_ADMIN.email,
    ...Array.from({ length: ADMIN_POOL_SIZE }, (_, i) => adminPoolEmail(i + 1)),
  ];
  return {
    ...minimalEnv(),
    ...blanked,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    ACCESS_TOKEN_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '30d',
    FRONTEND_URL,
    APP_URL: FRONTEND_URL,
    CLAN_TAG: CLANS.nera,
    COC_API_TOKEN: 'e2e-fake-coc-token',
    COC_API_BASE_URL: `${FAKES_URL}/v1`,
    // No background runs: the stack runs the sync itself (cron route), so data never moves under the tests.
    WAR_SYNC_INTERVAL_MINUTES: '0',
    CRON_SECRET: cronSecret,
    ADMIN_EMAILS: admins.join(','),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(SMTP_PORT),
    SMTP_USER: '',
    SMTP_PASS: '',
    MAIL_FROM: 'Crociata Nera E2E <no-reply@e2e.test>',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_WEBHOOK_SECRET: '',
    TELEGRAM_API_BASE_URL: `${FAKES_URL}/telegram`,
  };
}

/** Environment that loads the network guard, allowing only the given loopback ports. */
function guardEnv(ports) {
  return {
    NODE_OPTIONS: `--require ${JSON.stringify(EGRESS_GUARD)}`,
    E2E_EGRESS_ALLOW: ports.join(','),
    E2E_EGRESS_SELFTEST: '1',
  };
}

/** Collects the guard's lines from a server's output (see no-egress.cjs). */
function watchEgress(name, stream) {
  const state = (egress[name] ??= { active: false, selfTest: null, blocked: [] });
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('[e2e-egress] ')) continue;
      if (line.includes(' active ')) state.active = true;
      else if (line.includes('self-test passed')) state.selfTest = 'passed';
      else if (line.includes('self-test FAILED')) state.selfTest = line;
      else if (line.includes(' blocked ') && !line.includes('(self-test)')) {
        state.blocked.push(line);
        console.error(`[e2e-stack] ${name}: ${line}`);
      }
    }
  });
}

/** Refuses to go on unless the guard is loaded in every server and refused its test connections. */
async function waitForGuards(names, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (names.every((n) => egress[n]?.active && egress[n].selfTest === 'passed')) return;
    const failed = names.find((n) => egress[n]?.selfTest && egress[n].selfTest !== 'passed');
    if (failed) throw new Error(`network guard of ${failed}: ${egress[failed].selfTest}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `network guard not confirmed: ${JSON.stringify(egress)} (see e2e/.artifacts/stack/*.log)`,
  );
}

function spawnChild(name, command, args, options) {
  const out = createWriteStream(join(LOGS, `${name}.log`), { flags: 'w' });
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  watchEgress(name, child.stdout);
  watchEgress(name, child.stderr);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(
      `[e2e-stack] ${name} exited (${signal ?? code}); see e2e/.artifacts/stack/${name}.log`,
    );
    void stop(1);
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers: { 'x-forwarded-for': '10.255.0.1' } });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} not ready after ${timeoutMs} ms (${last})`);
}

let seedIp = 0;
/** A call to the backend through the frontend's proxy, each from its own address (rate limits). */
async function api(method, path, body, headers = {}) {
  const response = await fetch(`${FRONTEND_URL}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.254.0.${++seedIp}`,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function createSharedAdmin(database) {
  const signUp = await api('POST', '/auth/sign-up', {
    ...SHARED_ADMIN,
    repeatPassword: SHARED_ADMIN.password,
    language: 'en-US',
  });
  if (signUp.status !== 201 && signUp.status !== 200)
    throw new Error(`admin sign-up failed: ${signUp.status} ${JSON.stringify(signUp.body)}`);
  // The user must be in the in-memory database: proves the backend is not connected anywhere else.
  if (!(await database.collection('Users').findOne({ email: SHARED_ADMIN.email }))) {
    throw new Error('the backend did not write to the in-memory database: refusing to continue');
  }
  const deadline = Date.now() + 15_000;
  let link;
  while (!link && Date.now() < deadline) {
    link = fakes.mailbox
      .find((m) => m.to.includes(SHARED_ADMIN.email))
      ?.links.find((l) => l.includes('/verify-email?token='));
    if (!link) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!link) throw new Error('no confirmation email for the shared administrator');
  const token = new URL(link).searchParams.get('token');
  const verified = await api('POST', '/auth/verify-email', { token });
  if (verified.status !== 200 || !verified.body.result.roles.includes('ADMIN')) {
    throw new Error(
      `admin email confirmation failed: ${verified.status} ${JSON.stringify(verified.body)}`,
    );
  }
}

async function findDocuments(database, ObjectId, collection, filter, projection) {
  // References are ObjectIds in MongoDB and strings in JSON: `_id`, `…Id` and `…By` fields are
  // converted (e.g. `userId`, `createdBy`).
  const toIds = (value, key) =>
    typeof value === 'string' &&
    /^[0-9a-f]{24}$/i.test(value) &&
    (key === '_id' || /(Id|By)$/.test(key))
      ? new ObjectId(value)
      : value;
  const query = Object.fromEntries(
    Object.entries(filter).map(([key, value]) => [key, toIds(value, key)]),
  );
  return database.collection(collection).find(query, { projection }).limit(100).toArray();
}

/** Refuses to test an old build: a change not built yet would go untested without anyone noticing. */
function checkBuilds() {
  if (process.env.E2E_ALLOW_STALE_BUILD === '1') return;
  const newest = (dir) => {
    let latest = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      latest = Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
    }
    return latest;
  };
  const builds = [
    {
      name: 'frontend',
      output: join(ROOT, 'dist/crociata_nera/browser/index.html'),
      sources: [join(ROOT, 'src'), join(ROOT, 'public')],
    },
    { name: 'backend', output: join(BACKEND, '.next/BUILD_ID'), sources: [join(BACKEND, 'src')] },
  ];
  for (const build of builds) {
    if (!existsSync(build.output)) fail(`no ${build.name} build: run \`npm run e2e:build\` first`);
    const builtAt = statSync(build.output).mtimeMs;
    if (build.sources.some((dir) => newest(dir) > builtAt)) {
      fail(
        `the ${build.name} build is older than its sources: run \`npm run e2e:build\` (or set E2E_ALLOW_STALE_BUILD=1)`,
      );
    }
  }
}

function fail(message) {
  console.error(`[e2e-stack] ${message}`);
  process.exit(1);
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await Promise.allSettled([fakes?.close(), mongo?.stop()]);
  process.exit(code);
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
main().catch((error) => {
  console.error(`[e2e-stack] ${error.stack ?? error}`);
  void stop(1);
});
