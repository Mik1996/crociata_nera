import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as cronSync } from '@/app/api/v1/cron/war-sync/route';
import { GET as getWar } from '@/app/api/v1/wars/[warKey]/route';
import { GET as listWars } from '@/app/api/v1/wars/route';
import { resetEnvCache } from '@/lib/config/env';
import { WarModel } from '@/modules/wars/war.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { buildWarKey } from '@/modules/wars/wars.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar } from './helpers';

const WAR_KEY = '20261104T100000-OPP999';
/** During the battle day of the fixture war (ends 2026-11-06 10:00 UTC). */
const BATTLE_DAY = new Date('2026-11-05T20:00:00Z');
const AFTER_END = new Date('2026-11-06T10:05:00Z');

const warLogEntry = (overrides: Record<string, unknown> = {}) => ({
  result: 'win',
  endTime: '20261106T100000.000Z',
  teamSize: 2,
  attacksPerMember: 2,
  clan: { tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 12, attacks: 4, stars: 6, destructionPercentage: 100, expEarned: 310 },
  opponent: { tag: '#OPP999', name: 'Rivals', clanLevel: 10, stars: 2, destructionPercentage: 61.5 },
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
  resetEnvCache();
});

describe('war sync', () => {
  it('reads the current war with the server token and saves the battle-day snapshot', async () => {
    const fetchMock = mockCocApi({ '/currentwar': { body: cocWar() } });

    const report = await syncWars(BATTLE_DAY);

    expect(report).toMatchObject({ currentState: 'inWar', warKey: WAR_KEY, outcome: 'created', error: null });
    // Wakes up one minute after the end of the war to catch the final state.
    expect(report.nextCheckAt).toBe('2026-11-06T10:01:00.000Z');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://coc.test/v1/clans/%232J8JVVCLC/currentwar');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-coc-token' });

    const war = await WarModel.findOne({ warKey: WAR_KEY });
    expect(war).toMatchObject({ state: 'inWar', result: null, finalizedFrom: null });
    expect(war!.clan.members).toHaveLength(2);
    expect(war!.clan.members[0]!.attacks[0]).toMatchObject({ defenderTag: '#BBB222', stars: 3, duration: 120 });

    expect((await syncWars(BATTLE_DAY)).outcome).toBe('updated');
    expect(await WarModel.countDocuments()).toBe(1);
  });

  it('saves an ended war with every detail, then completes it with the war log', async () => {
    const ended = cocWar({ state: 'warEnded', clan: { ...cocWar().clan, stars: 6, destructionPercentage: 100 } });
    mockCocApi({ '/currentwar': { body: ended }, '/warlog': { body: { items: [warLogEntry()] } } });

    const report = await syncWars(AFTER_END);

    expect(report).toMatchObject({ outcome: 'created', warLogMatched: [WAR_KEY], nextCheckAt: null });
    const war = await WarModel.findOne({ warKey: WAR_KEY });
    expect(war).toMatchObject({ state: 'warEnded', result: 'win', finalizedFrom: 'currentWar', warLogMatched: true });
    expect(war!.clan.expEarned).toBe(310);
    expect(war!.endedAt!.toISOString()).toBe('2026-11-06T10:00:00.000Z');

    // An older snapshot never reopens it.
    mockCocApi({ '/currentwar': { body: cocWar() } });
    expect((await syncWars(AFTER_END)).outcome).toBe('unchanged');
    expect((await WarModel.findOne({ warKey: WAR_KEY }))!.state).toBe('warEnded');
  });

  it('closes a war whose end was never seen, using the last snapshot and the war log', async () => {
    mockCocApi({ '/currentwar': { body: cocWar() } });
    await syncWars(BATTLE_DAY);

    // Next read: the clan already started a new war, the previous one never showed `warEnded`.
    const next = cocWar({
      state: 'preparation',
      preparationStartTime: '20261106T120000.000Z',
      startTime: '20261107T120000.000Z',
      endTime: '20261108T120000.000Z',
      opponent: { ...cocWar().opponent, tag: '#NEW777', name: 'Next' },
    });
    mockCocApi({ '/currentwar': { body: next }, '/warlog': { body: { items: [warLogEntry()] } } });
    const report = await syncWars(new Date('2026-11-06T13:00:00Z'));

    expect(report.finalized).toEqual([WAR_KEY]);
    expect(report.warLogMatched).toEqual([WAR_KEY]);
    const closed = await WarModel.findOne({ warKey: WAR_KEY });
    expect(closed).toMatchObject({ state: 'warEnded', finalizedFrom: 'lastSnapshot', result: 'win', warLogMatched: true });
    // Final numbers come from the war log, attacks from the last snapshot.
    expect(closed!.clan.stars).toBe(6);
    expect(closed!.opponent.destructionPercentage).toBe(61.5);
    expect(closed!.clan.members[0]!.attacks).toHaveLength(1);
    expect((await WarModel.findOne({ warKey: '20261106T120000-NEW777' }))!.state).toBe('preparation');
  });

  it('keeps a war closed from its snapshot when the war log is private', async () => {
    mockCocApi({ '/currentwar': { body: cocWar() } });
    await syncWars(BATTLE_DAY);
    mockCocApi({ '/currentwar': { body: { state: 'notInWar' } }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });

    const report = await syncWars(AFTER_END);

    expect(report).toMatchObject({ currentState: 'notInWar', finalized: [WAR_KEY], warLogMatched: [], error: null });
    expect(await WarModel.findOne({ warKey: WAR_KEY })).toMatchObject({ state: 'warEnded', result: 'win', warLogMatched: false });
  });

  it('saves nothing when the clan is not at war', async () => {
    const fetchMock = mockCocApi({ '/currentwar': { body: { state: 'notInWar' } } });
    const report = await syncWars(BATTLE_DAY);
    expect(report).toMatchObject({ currentState: 'notInWar', warKey: null, error: null });
    expect(await WarModel.countDocuments()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no war log read without ended wars
  });

  it('reports API errors such as a key bound to another IP, without throwing', async () => {
    mockCocApi({ '/currentwar': { status: 403, body: { reason: 'accessDenied.invalidIp', message: 'Invalid authorization: API key does not allow access from IP 1.2.3.4' } } });
    const report = await syncWars(BATTLE_DAY);
    expect(report.error).toMatchObject({ status: 403, reason: 'accessDenied.invalidIp' });
  });

  it('reports a missing API key', async () => {
    const token = process.env.COC_API_TOKEN;
    delete process.env.COC_API_TOKEN;
    resetEnvCache();
    try {
      expect((await syncWars(BATTLE_DAY)).error).toMatchObject({ reason: 'config.missingToken' });
    } finally {
      process.env.COC_API_TOKEN = token;
    }
  });
});

describe('POST /api/v1/cron/war-sync', () => {
  const SECRET = 'cron-secret-that-is-at-least-32-chars!';

  it('is disabled without CRON_SECRET', async () => {
    expect((await call(cronSync, { body: {} })).status).toBe(404);
  });

  it('requires the secret and runs the sync', async () => {
    process.env.CRON_SECRET = SECRET;
    resetEnvCache();
    mockCocApi({ '/currentwar': { body: cocWar() } });

    expect((await call(cronSync, { body: {}, token: 'wrong' })).status).toBe(401);

    const ok = await call(cronSync, { body: {}, token: SECRET });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ currentState: 'inWar', warKey: WAR_KEY });
    expect(await WarModel.countDocuments()).toBe(1);
  });
});

describe('GET /api/v1/wars', () => {
  async function token(): Promise<string> {
    const { body } = await call(signUp, {
      body: { email: 'w@x.io', username: 'warrior', password: 'secret123', repeatPassword: 'secret123' },
    });
    return body.result.accessToken;
  }

  it('requires authentication', async () => {
    expect((await call(listWars)).status).toBe(401);
  });

  it('lists summaries (filterable by state) and returns the detail with members', async () => {
    const auth = await token();
    mockCocApi({ '/currentwar': { body: cocWar({ state: 'warEnded' }) }, '/warlog': { body: { items: [warLogEntry()] } } });
    await syncWars(AFTER_END);

    const list = await call(listWars, { token: auth, path: '/api/v1/wars?state=warEnded&limit=5' });
    expect(list.status).toBe(200);
    expect(list.body.result).toMatchObject({ total: 1, page: 1, limit: 5 });
    const [summary] = list.body.result.items;
    expect(summary).toMatchObject({ warKey: WAR_KEY, result: 'win', finalizedFrom: 'currentWar', clan: { expEarned: 310 } });
    expect(summary).not.toHaveProperty('clan.members');

    expect((await call(listWars, { token: auth, path: '/api/v1/wars?state=inWar' })).body.result.total).toBe(0);

    const detail = await call(getWar, { token: auth, params: { warKey: WAR_KEY } });
    expect(detail.body.result.clan.members).toHaveLength(2);

    const missing = await call(getWar, { token: auth, params: { warKey: 'nope' } });
    expect(missing.status).toBe(404);
    expect(missing.body.messages).toEqual([{ key: 'ERROR.WAR_NOT_FOUND' }]);
  });
});

describe('buildWarKey', () => {
  it('matches the id used by the proxy archive and the frontend', () => {
    expect(buildWarKey(new Date('2026-11-04T10:00:00Z'), '#OPP999')).toBe(WAR_KEY);
  });
});
