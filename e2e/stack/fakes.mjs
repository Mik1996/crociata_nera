// Fake external services of the e2e stack, all on the loopback interface:
// - the Clash of Clans API (`/v1/*`), answering from `game-data.mjs`;
// - a Telegram Bot API stand-in (`/telegram/*`) that refuses everything: Telegram is off in the
//   stack (no bot token), this only guarantees no request could ever reach the real one;
// - an SMTP sink: the backend's emails are kept in memory and read by the tests;
// - the pictures of the fake data (`/assets/*`, clan badges);
// - the control API of the tests (`/__e2e/*`): game accounts handed out to tests, mailbox,
//   read-only lookups in the test database, network guard report, stack information.

import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import {
  ADMIN_POOL_SIZE,
  adminPoolEmail,
  CLANS,
  UNKNOWN_PLAYER_TAG,
  VALID_PLAYER_TOKEN,
  VERIFY_UNAVAILABLE_TAG,
} from './config.mjs';

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const notFound = (res) => json(res, 404, { reason: 'notFound', message: 'Not found' });

/** Picture served for every clan badge of the fake data (a valid 1×1 PNG). */
const BADGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/**
 * Game accounts handed out to the tests. A verified account belongs to one user only, and tests run
 * in parallel: each test takes its own tags and gives them back when it ends.
 */
function buildPools(data) {
  const tags = (list) => list.map((m) => m.tag);
  const { nera, rossa, oro } = data.rosters;
  return {
    // Elders and members of Crociata Nera: full access to the clans' pages, no leaders' pages.
    member: tags(nera.filter((m) => m.role === 'admin' || m.role === 'member')),
    // Co-leaders of Crociata Nera and Crociata Rossa: also the leaders' pages (CWL selections).
    leader: tags([...nera, ...rossa].filter((m) => m.role === 'coLeader')),
    // Members of the sister clans: full access too.
    sister: tags([...rossa, ...oro].filter((m) => m.role === 'member')),
    // Real game accounts outside the Crusade: no access to the clans' pages.
    outside: [...data.players.keys()].filter((tag) => tag.startsWith('#OUTSIDE')),
    // Addresses of ADMIN_EMAILS for tests that need an administrator of their own; given back by the
    // test's clean-up once it has deleted that administrator.
    admin: Array.from({ length: ADMIN_POOL_SIZE }, (_, i) => adminPoolEmail(i + 1)),
  };
}

export function startFakes({ data, port, smtpPort, stackInfo, db, egress }) {
  const pools = buildPools(data);
  const taken = new Set();
  /** Main clan's `currentwar`, switched while seeding. */
  let currentWar = { state: 'notInWar' };
  /** Every request the fake CoC API received (path), for the stack's own checks. */
  const cocRequests = [];
  /** Emails received by the SMTP sink. */
  const mailbox = [];
  let ready = false;

  function cocApi(req, res, path, body) {
    cocRequests.push(path);
    if (req.headers.authorization !== 'Bearer e2e-fake-coc-token') {
      return json(res, 403, { reason: 'accessDenied.invalidIp', message: 'Invalid authorization' });
    }
    const clanMatch = path.match(/^\/clans\/([^/]+)(\/.*)?$/);
    if (clanMatch) {
      const tag = decodeURIComponent(clanMatch[1]).toUpperCase();
      const sub = clanMatch[2] ?? '';
      const clan = data.clans[tag];
      if (!clan) return notFound(res);
      if (sub === '') return json(res, 200, clan);
      if (sub === '/currentwar/leaguegroup') return notFound(res);
      if (tag === CLANS.oro && (sub === '/currentwar' || sub === '/warlog')) {
        // A clan with a private war log (official answer).
        return json(res, 403, {
          reason: 'accessDenied',
          message: 'Access denied, clan war log is private.',
        });
      }
      if (sub === '/currentwar')
        return json(res, 200, tag === CLANS.nera ? currentWar : { state: 'notInWar' });
      if (sub === '/warlog')
        return json(res, 200, {
          items: tag === CLANS.nera ? data.warLog : [],
          paging: { cursors: {} },
        });
      if (sub === '/capitalraidseasons') {
        return json(res, 200, {
          items: tag === CLANS.nera ? data.raids : [],
          paging: { cursors: {} },
        });
      }
      return notFound(res);
    }
    const playerMatch = path.match(/^\/players\/([^/]+)(\/verifytoken)?$/);
    if (playerMatch) {
      const tag = decodeURIComponent(playerMatch[1]).toUpperCase();
      const player = data.players.get(tag);
      if (!player || tag === UNKNOWN_PLAYER_TAG) return notFound(res);
      if (!playerMatch[2]) return json(res, 200, player);
      if (req.method !== 'POST') return notFound(res);
      if (tag === VERIFY_UNAVAILABLE_TAG) {
        return json(res, 503, {
          reason: 'inMaintenance',
          message: 'Service is temporarily unavailable',
        });
      }
      const ok = body?.token === VALID_PLAYER_TOKEN;
      return json(res, 200, { tag, token: body?.token ?? '', status: ok ? 'ok' : 'invalid' });
    }
    if (path === '/goldpass/seasons/current') return json(res, 200, data.goldPass);
    if (/^\/locations\/\d+\/rankings\//.test(path))
      return json(res, 200, { items: [], paging: { cursors: {} } });
    if (/^\/leagues\/\d+\/seasons/.test(path))
      return json(res, 200, { items: [], paging: { cursors: {} } });
    if (/^\/clanwarleagues\/wars\//.test(path)) return notFound(res);
    return notFound(res);
  }

  async function control(req, res, path, query) {
    if (path === '/__e2e/ready')
      return ready ? json(res, 200, { e2e: true }) : json(res, 503, { e2e: true, ready: false });
    if (path === '/__e2e/info') return json(res, 200, stackInfo());
    if (path === '/__e2e/accounts/take' && req.method === 'POST') {
      const { pool } = await readBody(req);
      const free = pools[pool]?.find((tag) => !taken.has(tag));
      if (!free) {
        return json(res, 409, {
          error: `no free account in pool "${pool}": more tests at once than accounts, or a clean-up failed (restart the stack to start over)`,
        });
      }
      taken.add(free);
      return json(res, 200, { tag: free, name: data.players.get(free)?.name ?? null });
    }
    if (path === '/__e2e/accounts/release' && req.method === 'POST') {
      const { tag } = await readBody(req);
      taken.delete(tag);
      return json(res, 200, { released: tag });
    }
    if (path === '/__e2e/mail') {
      const to = (query.get('to') ?? '').toLowerCase();
      return json(
        res,
        200,
        mailbox.filter((m) => !to || m.to.includes(to)),
      );
    }
    if (path === '/__e2e/game') {
      // What the tests compare the pages with (the same data the backend synced).
      return json(res, 200, {
        clans: data.clans,
        endedWars: data.endedWars,
        warLog: data.warLog,
        battleDay: data.battleDay,
        raids: data.raids,
      });
    }
    if (path === '/__e2e/db/find' && req.method === 'POST') {
      // Read-only lookup in the test database (persistence checks). Never writes.
      const { collection, filter = {}, projection } = await readBody(req);
      return json(res, 200, await db.find(collection, filter, projection));
    }
    if (path === '/__e2e/coc-requests') return json(res, 200, cocRequests);
    // Network guard of each server: active, self-test, outbound attempts it blocked.
    if (path === '/__e2e/egress') return json(res, 200, egress());
    return notFound(res);
  }

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/__e2e/'))
        return await control(req, res, url.pathname, url.searchParams);
      if (url.pathname.startsWith('/v1/')) {
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        return cocApi(req, res, url.pathname.slice('/v1'.length), body);
      }
      if (url.pathname.startsWith('/telegram/'))
        return json(res, 401, { ok: false, description: 'Unauthorized (e2e)' });
      if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.png')) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        return res.end(BADGE_PNG);
      }
      return notFound(res);
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const smtp = startSmtpSink(mailbox);

  return {
    pools,
    setCurrentWar: (war) => (currentWar = war),
    setReady: () => (ready = true),
    cocRequests,
    mailbox,
    listen: () =>
      Promise.all([
        new Promise((resolve, reject) =>
          http.once('error', reject).listen(port, '127.0.0.1', () => resolve(undefined)),
        ),
        new Promise((resolve, reject) =>
          smtp.once('error', reject).listen(smtpPort, '127.0.0.1', () => resolve(undefined)),
        ),
      ]),
    close: () =>
      Promise.all([new Promise((r) => http.close(r)), new Promise((r) => smtp.close(r))]),
  };
}

/**
 * Minimal SMTP server (enough for nodemailer, no TLS, no auth): every message is decoded and kept
 * with the links it contains.
 */
function startSmtpSink(mailbox) {
  return createTcpServer((socket) => {
    let buffer = '';
    let inData = false;
    let data = [];
    let rcpt = [];
    const reply = (line) => socket.write(`${line}\r\n`);
    reply('220 e2e-smtp ESMTP ready');
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            mailbox.push(parseMail(rcpt, data.join('\r\n')));
            data = [];
            rcpt = [];
            reply('250 OK: queued');
          } else {
            data.push(line.startsWith('..') ? line.slice(1) : line);
          }
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') reply('250 e2e-smtp');
        else if (command === 'MAIL') reply('250 OK');
        else if (command === 'RCPT') {
          rcpt.push((line.match(/<([^>]+)>/)?.[1] ?? '').toLowerCase());
          reply('250 OK');
        } else if (command === 'DATA') {
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'QUIT') {
          reply('221 Bye');
          socket.end();
        } else reply('250 OK');
      }
    });
  });
}

/** Decodes quoted-printable soft breaks and escapes (nodemailer's default for text parts). */
function decodeQuotedPrintable(text) {
  return text.replace(/=\r?\n/g, '').replace(/(?:=[0-9A-F]{2})+/g, (run) =>
    Buffer.from(
      run
        .split('=')
        .slice(1)
        .map((h) => parseInt(h, 16)),
    ).toString('utf8'),
  );
}

function decodeHeader(value) {
  return value.replace(/=\?utf-8\?([QB])\?([^?]*)\?=/gi, (_, encoding, text) =>
    encoding.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64').toString('utf8')
      : decodeQuotedPrintable(text.replace(/_/g, ' ')),
  );
}

function parseMail(rcpt, raw) {
  const [head] = raw.split(/\r\n\r\n/);
  const header = (name) => {
    const match = head.replace(/\r\n[ \t]+/g, ' ').match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
    return match ? decodeHeader(match[1].trim()) : '';
  };
  const body = decodeQuotedPrintable(raw.slice(head.length));
  const links = [...new Set(body.match(/https?:\/\/[^\s"'<>]+/g) ?? [])].map((l) =>
    l.replace(/&amp;/g, '&'),
  );
  return {
    to: rcpt,
    subject: header('Subject'),
    from: header('From'),
    body,
    links,
    receivedAt: new Date().toISOString(),
  };
}
