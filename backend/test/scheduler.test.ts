import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Steps of a run, as called by the scheduler (some once per clan of the Crusade). */
const calls: string[] = [];
/** The steps in the order they first ran. */
const steps = () => [...new Set(calls)];
const report = (overrides = {}) => ({
  ranAt: new Date().toISOString(),
  currentState: 'notInWar',
  warKey: null,
  outcome: null,
  finalized: [],
  warLogMatched: [],
  nextCheckAt: null,
  error: null,
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  syncWars: vi.fn(),
  syncCommendations: vi.fn(),
  syncMembers: vi.fn(),
}));

vi.mock('@/modules/wars/war-sync.service', () => ({ syncWars: mocks.syncWars }));
vi.mock('@/modules/commendations/commendation-sync.service', () => ({
  syncCommendations: mocks.syncCommendations,
  syncMembers: mocks.syncMembers,
}));
vi.mock('@/modules/cwl/cwl-sync.service', () => ({
  syncCwl: vi.fn(async () => {
    calls.push('cwl');
    return { season: null, state: 'notInWar', warsFetched: 0, closed: [], error: null };
  }),
}));
vi.mock('@/modules/raids/raid-sync.service', () => ({
  syncRaids: vi.fn(async () => {
    calls.push('raids');
    return { nextCheckAt: null, error: null };
  }),
}));
vi.mock('@/modules/records/clan-records.service', () => ({
  syncClanRecords: vi.fn(async () => {
    calls.push('records');
    return { perfectWars: [], improved: [], error: null };
  }),
}));
vi.mock('@/modules/commendations/player-profile-sync.service', () => ({
  syncPlayerProfiles: vi.fn(async () => {
    calls.push('profiles');
    return { refreshed: 0, failed: 0 };
  }),
}));

/** A fresh scheduler (its state lives on `globalThis` to survive hot reloads). */
async function loadScheduler() {
  delete (globalThis as { __warSync?: unknown }).__warSync;
  vi.resetModules();
  return import('@/lib/scheduler/war-sync-scheduler');
}

beforeEach(() => {
  calls.length = 0;
  mocks.syncWars.mockReset().mockImplementation(async () => {
    calls.push('wars');
    return report();
  });
  mocks.syncMembers.mockReset().mockImplementation(async () => {
    calls.push('members');
    return { created: [], updated: 0, left: 0, nextCheckAt: null };
  });
  mocks.syncCommendations.mockReset().mockImplementation(async () => {
    calls.push('commendations');
    return { membersUpdated: 0, periodsProcessed: [], awards: 0, nextCheckAt: null, error: null };
  });
});

describe('war sync scheduler', () => {
  it('runs every step even when the war sync of the main clan fails unexpectedly', async () => {
    const { runWarSync } = await loadScheduler();
    mocks.syncWars.mockImplementation(async () => {
      calls.push('wars');
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await runWarSync();

    expect(result!.error).toMatchObject({ status: 500, reason: 'internal', message: 'boom' });
    expect(steps()).toEqual(['wars', 'cwl', 'raids', 'records', 'commendations', 'profiles']);
  });

  it('reads the donations first when the game season is about to end', async () => {
    const { runWarSync } = await loadScheduler();
    mocks.syncCommendations.mockImplementation(async () => {
      calls.push('commendations');
      return { membersUpdated: 0, periodsProcessed: [], awards: 0, nextCheckAt: new Date(Date.now() + 10_000).toISOString(), error: null };
    });
    await runWarSync();
    expect(steps()[0]).toBe('wars');

    calls.length = 0;
    await runWarSync();
    expect(steps().slice(0, 3)).toEqual(['members', 'wars', 'cwl']);
  });

  it('skips a run while another one is in progress', async () => {
    const { runWarSync } = await loadScheduler();
    let release: () => void = () => undefined;
    mocks.syncWars.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(report()))));
    const first = runWarSync();
    await vi.waitFor(() => expect(mocks.syncWars).toHaveBeenCalled());
    expect(await runWarSync()).toBeNull();
    release();
    expect(await first).not.toBeNull();
  });

  it('stops waiting for a run that takes too long', async () => {
    const { withTimeout } = await loadScheduler();
    expect(await withTimeout(new Promise(() => undefined), 10)).toEqual({ timedOut: true });
    expect(await withTimeout(Promise.resolve(3), 1_000)).toEqual({ timedOut: false, value: 3 });
  });
});
