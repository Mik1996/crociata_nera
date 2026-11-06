import { sampleWar } from '../../testing/fixtures';
import {
  closeExpiredWars,
  mapClan,
  mapWar,
  mapWarLogEntry,
  mergeWarHistory,
  parseCocDate,
} from './coc-api.mappers';
import { CocWar, CocWarLogEntry } from './coc-api.types';

describe('coc-api mappers', () => {
  it('parseCocDate converts the API format to ISO 8601', () => {
    expect(parseCocDate('20261105T120000.000Z')).toBe('2026-11-05T12:00:00.000Z');
    expect(parseCocDate(undefined)).toBe('');
  });

  it('mapClan maps roles, members, league and war log visibility', () => {
    const clan = mapClan({
      tag: '#2J8JVVCLC',
      name: 'Crociata Nera',
      clanLevel: 10,
      warWins: 3,
      isWarLogPublic: true,
      warLeague: { id: 48000012, name: 'Crystal League I' },
      memberList: [
        { tag: '#P1', name: 'Uno', role: 'leader', expLevel: 200, trophies: 5000, donations: 10, donationsReceived: 5, townHallLevel: 16 },
        { tag: '#P2', name: 'Due', role: 'admin', expLevel: 150, trophies: 4000, donations: 0, donationsReceived: 0 },
      ],
    });
    expect(clan.warWins).toBe(3);
    expect(clan.warLosses).toBe(0);
    expect(clan.isWarLogPublic).toBe(true);
    expect(clan.warLeague).toEqual({ id: 48000012, name: 'Crystal League I' });
    expect(clan.members.map((m) => m.role)).toEqual(['leader', 'elder']);
    expect(clan.members[0].townHall).toBe(16);
  });

  it('mapClan ignores the "Unranked" league', () => {
    const clan = mapClan({ tag: '#X', name: 'X', clanLevel: 1, warLeague: { id: 48000000, name: 'Unranked' } });
    expect(clan.warLeague).toBeUndefined();
    expect(clan.isWarLogPublic).toBe(false);
  });

  it('mapClan maps Clan Capital, leagues, location and labels', () => {
    const clan = mapClan({
      tag: '#2J8JVVCLC',
      name: 'Crociata Nera',
      clanLevel: 16,
      clanPoints: 140174,
      clanCapitalPoints: 5365,
      capitalLeague: { id: 85000022, name: 'Legend League' },
      warLeague: { id: 48000015, name: 'Master League I' },
      clanCapital: { capitalHallLevel: 10 },
      location: { id: 32000120, name: 'Italy', isCountry: true, countryCode: 'IT' },
      chatLanguage: { id: 75000004, name: 'Italiano', languageCode: 'IT' },
      labels: [{ id: 56000000, name: 'Clan Wars', iconUrls: { small: 's.png', medium: 'm.png' } }],
      requiredTownhallLevel: 17,
    });
    expect(clan).toMatchObject({
      capitalHallLevel: 10,
      capitalLeague: 'Legend League',
      warLeague: { id: 48000015, name: 'Master League I' },
      clanPoints: 140174,
      capitalPoints: 5365,
      location: 'Italy',
      countryCode: 'IT',
      chatLanguage: 'Italiano',
      labels: [{ name: 'Clan Wars', iconUrl: 'm.png' }],
      requiredTownHall: 17,
    });
    expect(mapClan({ tag: '#X', name: 'X', clanLevel: 1 })).toMatchObject({ capitalHallLevel: 0, labels: [] });
  });

  it('mapWar returns null when the clan is not at war', () => {
    expect(mapWar({ state: 'notInWar' })).toBeNull();
  });

  it('mapWar converts state, dates and participants, normalising positions', () => {
    const raw: CocWar = {
      state: 'inWar',
      teamSize: 2,
      attacksPerMember: 2,
      preparationStartTime: '20261104T100000.000Z',
      startTime: '20261105T090000.000Z',
      endTime: '20261106T090000.000Z',
      clan: {
        tag: '#2J8JVVCLC',
        name: 'Crociata Nera',
        clanLevel: 10,
        attacks: 1,
        stars: 3,
        destructionPercentage: 50,
        members: [
          { tag: '#B', name: 'B', townhallLevel: 14, mapPosition: 7, opponentAttacks: 0 },
          {
            tag: '#A',
            name: 'A',
            townhallLevel: 15,
            mapPosition: 3,
            opponentAttacks: 1,
            attacks: [{ attackerTag: '#A', defenderTag: '#X', stars: 3, destructionPercentage: 100, order: 1, duration: 100 }],
          },
        ],
      },
      opponent: { tag: '#OPP', name: 'Opp', clanLevel: 8, attacks: 0, stars: 0, destructionPercentage: 0, members: [] },
    };
    const w = mapWar(raw)!;
    expect(w.state).toBe('battle');
    expect(w.hasDetails).toBe(true);
    expect(w.id).toBe('20261104T100000-OPP');
    expect(w.startTime).toBe('2026-11-05T09:00:00.000Z');
    expect(w.clan.members.map((p) => [p.tag, p.mapPosition])).toEqual([
      ['#A', 1],
      ['#B', 2],
    ]);
    expect(w.clan.members[0].attacks[0].stars).toBe(3);
    expect(w.clan.members[1].attacks).toEqual([]);
  });

  describe('war log', () => {
    const entry: CocWarLogEntry = {
      result: 'win',
      endTime: '20261003T090000.000Z',
      teamSize: 15,
      attacksPerMember: 2,
      clan: { tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 10, attacks: 27, stars: 40, destructionPercentage: 91.2, expEarned: 200 },
      opponent: { tag: '#OPP', name: 'Opponents', clanLevel: 9, stars: 35, destructionPercentage: 80.5 },
    };

    it('mapWarLogEntry creates an ended war without participants', () => {
      const w = mapWarLogEntry(entry)!;
      expect(w.state).toBe('ended');
      expect(w.hasDetails).toBe(false);
      expect(w.endTime).toBe('2026-10-03T09:00:00.000Z');
      expect(w.startTime).toBe('2026-10-02T09:00:00.000Z');
      expect(w.clan.attacksUsed).toBe(27);
      expect(w.opponent.attacksUsed).toBe(0);
      expect(w.clan.members).toEqual([]);
    });

    it('mapWarLogEntry discards League (CWL) entries', () => {
      const cwl: CocWarLogEntry = { ...entry, result: null, opponent: { clanLevel: 0, stars: 0, destructionPercentage: 0 } };
      expect(mapWarLogEntry(cwl)).toBeNull();
    });

    it('mergeWarHistory prefers the archived war but uses the final war log totals', () => {
      const archived = sampleWar({ state: 'battle', endTime: '2026-10-03T09:00:00.000Z' });
      archived.opponent.tag = '#OPP';
      const warLogOnly = mapWarLogEntry({ ...entry, endTime: '20260920T090000.000Z' })!;
      const result = mergeWarHistory([archived], [mapWarLogEntry(entry)!, warLogOnly]);

      expect(result).toHaveLength(2);
      expect(result[0].hasDetails).toBe(true);
      expect(result[0].state).toBe('ended');
      expect(result[0].clan.stars).toBe(40);
      expect(result[0].clan.members.length).toBe(3);
      expect(result[1].hasDetails).toBe(false);
    });

    it('closeExpiredWars closes only wars whose end time has passed', () => {
      const now = new Date('2026-10-05T00:00:00.000Z');
      const expired = sampleWar({ state: 'battle', endTime: '2026-10-03T09:00:00.000Z' });
      const active = sampleWar({ state: 'battle', endTime: '2026-10-06T09:00:00.000Z' });
      expect(closeExpiredWars([expired, active], now).map((w) => w.state)).toEqual(['ended', 'battle']);
    });
  });
});
