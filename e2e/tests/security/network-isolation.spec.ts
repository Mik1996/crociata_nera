import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '../../support/fixtures';
import { BACKEND_PORT, FAKES_PORT, FAKES_URL, stack } from '../../support/stack';

/**
 * The stack must not reach anything outside the machine (production, Atlas, Telegram, mail
 * servers, the game's API or CDN), nor any other server of this machine (a development backend is
 * connected to Atlas `dev`). Its servers run with a network guard (e2e/stack/no-egress.cjs) that
 * allows only the stack's own loopback ports; every attempt it blocks is reported, and the run
 * fails if any happened (global teardown).
 */

const GUARD = join(__dirname, '../../stack/no-egress.cjs');

/**
 * Runs, in a new Node process guarded exactly like the stack's servers (allowed: the fake API's
 * port only), one connection attempt per target, and returns how each ended.
 */
async function attemptsUnderGuard(): Promise<{ results: Record<string, string>; log: string }> {
  const script = `
    import net from 'node:net';
    import dns from 'node:dns';
    import dgram from 'node:dgram';
    const tcp = (port, host) => new Promise((resolve) => {
      const socket = net.connect(port, host);
      socket.once('connect', () => { socket.destroy(); resolve('connected'); });
      socket.once('error', (error) => resolve(error.code));
    });
    const get = (url) => fetch(url, { signal: AbortSignal.timeout(5000) }).then(
      (response) => 'HTTP ' + response.status,
      (error) => error.cause?.code ?? error.code ?? String(error),
    );
    const results = {
      'fake API (allowed)': await get('${FAKES_URL}/__e2e/info'),
      'game CDN, as the announcement pictures read it': await get('https://api-assets.clashofclans.com/badges/200/2J8JVVCLC.png'),
      'Clash of Clans API': await get('https://api.clashofclans.com/v1/clans/%232J8JVVCLC'),
      'Telegram Bot API': await get('https://api.telegram.org/bot0/getMe'),
      'production site': await get('https://crociatanera.it/api/v1/health'),
      'SMTP relay': await tcp(587, 'smtp-relay.brevo.com'),
      'public address': await tcp(443, '1.1.1.1'),
      'Atlas cluster (SRV lookup)': await new Promise((resolve) =>
        dns.resolveSrv('_mongodb._tcp.crociata-nera-prod.mongodb.net', (error) => resolve(error?.code ?? 'resolved'))),
      'DNS lookup': await dns.promises.lookup('example.com').then(() => 'resolved', (error) => error.code),
      'stack backend (not in this process’s list)': await tcp(${BACKEND_PORT}, '127.0.0.1'),
      'development backend :3001': await tcp(3001, '127.0.0.1'),
      'local MongoDB :27017': await tcp(27017, '127.0.0.1'),
      'UDP': (() => { try { dgram.createSocket('udp4'); return 'created'; } catch (error) { return error.code; } })(),
    };
    console.log(JSON.stringify(results));
  `;
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      env: {
        PATH: process.env['PATH'],
        NODE_OPTIONS: `--require ${JSON.stringify(GUARD)}`,
        E2E_EGRESS_ALLOW: String(FAKES_PORT),
      },
      timeout: 30_000,
    },
  );
  return { results: JSON.parse(stdout.trim().split('\n').at(-1)!), log: stderr };
}

test.describe('Network isolation of the stack', () => {
  test('both servers run behind the network guard, which refused its own test connections @P0', async () => {
    const egress = await stack.egress();
    for (const server of ['backend', 'frontend'] as const) {
      expect(egress[server], server).toMatchObject({ active: true, selfTest: 'passed' });
      expect(egress[server]!.blocked, `outbound attempts of the ${server}`).toEqual([]);
    }
  });

  test('a guarded process can reach only the approved loopback ports @P0', async () => {
    const { results, log } = await attemptsUnderGuard();
    const { 'fake API (allowed)': allowed, ...forbidden } = results;
    // The approved port works: the guard does not just break the network.
    expect(allowed).toBe('HTTP 200');
    // Everything else is refused by the guard itself, before any packet or DNS query leaves.
    for (const [target, outcome] of Object.entries(forbidden)) {
      expect.soft(outcome, target).toBe('E2E_EGRESS_BLOCKED');
    }
    expect(Object.keys(forbidden)).toHaveLength(12);
    // Each attempt is reported (that is what makes a run fail when the stack tries one).
    expect(log).toContain('[e2e-egress] blocked connection to api-assets.clashofclans.com:443');
    expect(log).toContain('[e2e-egress] blocked connection to 127.0.0.1:3001');
  });

  test('the game data never points at the game’s CDN: pictures come from the fake API @P1', async ({
    users,
  }) => {
    const member = await users.create({ access: 'member' });
    // What the backend serves (live API data and synced wars) and what it saved.
    const served = [
      await member.api.get('/clan'),
      await member.api.get('/wars/archive'),
      await member.api.get('/welcome'),
    ];
    const saved = await stack.find('Wars', {});
    expect(saved.length).toBeGreaterThan(0);
    const text = JSON.stringify([...served.map((r) => r.body), saved]);
    expect(text).not.toContain('api-assets.clashofclans.com');

    const badges = [...text.matchAll(/"(https?:\/\/[^"]+\/badges\/[^"]+\.png)"/g)].map((m) => m[1]!);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((url) => url.startsWith(`${FAKES_URL}/assets/`))).toBe(true);
    // And they are real pictures.
    const picture = await fetch(badges[0]!);
    expect(picture.status).toBe(200);
    expect(picture.headers.get('content-type')).toBe('image/png');
  });
});
