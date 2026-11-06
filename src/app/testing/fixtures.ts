import { provideCocApi } from '../core/api/provide-coc-api';
import { AppConfig } from '../core/config/app-config';
import { Attack, ClanMember, War, WarParticipant } from '../core/models';

export const TEST_CONFIG: AppConfig = {
  production: false,
  useMockApi: true,
  apiBaseUrl: '/api/coc',
  backendBaseUrl: '/api/v1',
  clanTag: '#TEST',
  clanName: 'Crociata Nera',
  mockLatencyMs: 0,
  statsWindow: 20,
};

/** Data layer provider with zero-latency mock, for tests. */
export const provideCocApiTest = (override: Partial<AppConfig> = {}) =>
  provideCocApi({ ...TEST_CONFIG, ...override });

export function attack(attackerTag: string, defenderTag: string, stars: number, destruction: number): Attack {
  return {
    attackerTag,
    defenderTag,
    stars,
    destructionPercentage: destruction,
    order: 1,
    durationSeconds: 120,
  };
}

export function participant(
  tag: string,
  mapPosition: number,
  attacks: Attack[] = [],
  townHall = 15,
): WarParticipant {
  return { tag, name: `Player ${tag}`, mapPosition, townHall, attacks, opponentAttacks: 0 };
}

export function member(tag: string, townHall = 15): ClanMember {
  return {
    tag,
    name: `Player ${tag}`,
    role: 'member',
    townHall,
    expLevel: 200,
    trophies: 5000,
    donations: 0,
    donationsReceived: 0,
  };
}

/**
 * Sample 3 vs 3 war:
 * - #A: 3★ (100%) + 2★ (80%)
 * - #B: 1★ (50%)
 * - #C: no attacks
 */
export function sampleWar(override: Partial<War> = {}): War {
  const ours = [
    participant('#A', 1, [attack('#A', '#X', 3, 100), attack('#A', '#Y', 2, 80)], 16),
    participant('#B', 2, [attack('#B', '#Y', 1, 50)], 15),
    participant('#C', 3, [], 14),
  ];
  const theirs = [
    participant('#X', 1, [attack('#X', '#A', 2, 70)], 16),
    participant('#Y', 2, [attack('#Y', '#B', 3, 100)], 15),
    participant('#Z', 3, [], 14),
  ];
  return {
    id: 'g1',
    state: 'ended',
    preparationStartTime: '2026-10-01T10:00:00.000Z',
    startTime: '2026-10-02T09:00:00.000Z',
    endTime: '2026-10-03T09:00:00.000Z',
    teamSize: 3,
    attacksPerMember: 2,
    hasDetails: true,
    clan: { tag: '#TEST', name: 'Crociata Nera', level: 18, stars: 5, destructionPercentage: 60, attacksUsed: 3, members: ours },
    opponent: { tag: '#OPP', name: 'Opponents', level: 12, stars: 5, destructionPercentage: 56.67, attacksUsed: 2, members: theirs },
    ...override,
  };
}
