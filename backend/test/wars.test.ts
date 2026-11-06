import { describe, expect, it } from 'vitest';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { GET as listWars, POST as saveWar } from '@/app/api/v1/wars/route';
import { GET as getWar } from '@/app/api/v1/wars/[warKey]/route';
import { WarModel } from '@/modules/wars/war.model';
import { buildWarKey } from '@/modules/wars/wars.service';
import { call, cocWar } from './helpers';

const WAR_KEY = '20261104T100000-OPP999';

async function token(): Promise<string> {
  const { body } = await call(signUp, {
    body: { email: 'w@x.io', username: 'warrior', password: 'secret123', repeatPassword: 'secret123' },
  });
  return body.result.accessToken;
}

describe('POST /api/v1/wars', () => {
  it('requires authentication', async () => {
    const res = await call(saveWar, { body: cocWar() });
    expect(res.status).toBe(401);
    expect(await WarModel.countDocuments()).toBe(0);
  });

  it('creates the war, then updates it idempotently', async () => {
    const auth = await token();

    const created = await call(saveWar, { body: cocWar(), token: auth });
    expect(created.status).toBe(201);
    expect(created.body.messages).toEqual([{ key: 'SUCCESS.WAR_CREATED' }]);
    expect(created.body.result).toMatchObject({ warKey: WAR_KEY, state: 'inWar', result: null });

    const ended = cocWar({ state: 'warEnded', clan: { ...cocWar().clan, stars: 5 } });
    const updated = await call(saveWar, { body: ended, token: auth });
    expect(updated.status).toBe(200);
    expect(updated.body.messages).toEqual([{ key: 'SUCCESS.WAR_UPDATED' }]);
    expect(updated.body.result).toMatchObject({ state: 'warEnded', result: 'win', clan: { stars: 5 } });

    expect(await WarModel.countDocuments()).toBe(1);
  });

  it('never moves an ended war back to an earlier state', async () => {
    const auth = await token();
    await call(saveWar, { body: cocWar({ state: 'warEnded' }), token: auth });

    const stale = await call(saveWar, { body: cocWar({ state: 'inWar' }), token: auth });
    expect(stale.status).toBe(200);
    expect(stale.body.messages).toEqual([{ key: 'SUCCESS.WAR_UNCHANGED' }]);
    expect((await WarModel.findOne({ warKey: WAR_KEY }))!.state).toBe('warEnded');
  });

  it('rejects wars that cannot be saved or belong to another clan', async () => {
    const auth = await token();

    const notInWar = await call(saveWar, { body: { state: 'notInWar' }, token: auth });
    expect(notInWar.status).toBe(400);
    expect(notInWar.body.messages).toContainEqual({ key: 'ERROR.WAR_IS_NOT_SAVABLE', field: 'state' });

    const otherClan = await call(saveWar, { body: cocWar({ clan: { ...cocWar().clan, tag: '#OTHER1' } }), token: auth });
    expect(otherClan.status).toBe(422);
    expect(otherClan.body.messages).toEqual([{ key: 'ERROR.WAR_CLAN_NOT_ALLOWED' }]);
  });
});

describe('GET /api/v1/wars', () => {
  it('lists summaries and returns the detail with members', async () => {
    const auth = await token();
    await call(saveWar, { body: cocWar(), token: auth });

    const list = await call(listWars, { token: auth, path: '/api/v1/wars?limit=5' });
    expect(list.status).toBe(200);
    expect(list.body.result).toMatchObject({ total: 1, page: 1, limit: 5 });
    expect(list.body.result.items[0]).not.toHaveProperty('clan.members');

    const detail = await call(getWar, { token: auth, params: { warKey: WAR_KEY } });
    expect(detail.status).toBe(200);
    expect(detail.body.result.clan.members).toHaveLength(2);
    expect(detail.body.result.clan.members[0].attacks[0]).toMatchObject({ defenderTag: '#BBB222', stars: 3 });

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
