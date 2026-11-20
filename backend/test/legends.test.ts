import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatedCaption } from '@/modules/announcements/announcement-caption';
import { LegendSeasonData } from '@/modules/announcements/announcement-data';
import { syncAnnouncementDrafts } from '@/modules/announcements/announcement-drafts.service';
import { AnnouncementModel } from '@/modules/announcements/announcement.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { LegendSeasonModel } from '@/modules/legends/legend-season.model';
import { countryRank, syncLegendSeason } from '@/modules/legends/legend-season.service';
import { mockCocApi } from './coc-mock';

afterEach(() => vi.unstubAllGlobals());

const ITALY = 32000120;
const LAST_ENDED = 'v2-2026-10-26T05:00:00Z';
const NEXT = 'v2-2026-11-23T05:00:00Z';
const NOW = new Date('2026-11-20T12:00:00Z');
const READ_AT = new Date('2026-11-23T04:57:30Z');
const AFTER_END = new Date('2026-11-23T05:20:00Z');

const LEGEND_ONE = { id: 105000036, name: 'Legend League I' };
const LEGEND_TWO = { id: 105000035, name: 'Legend League II' };

async function member(tag: string, name: string, league: { id: number; name: string }, clanTag = '#2J8JVVCLC') {
  await PlayerModel.create({ tag, name, inClan: true, clanTag, league });
}

/** Fake API: the list of ended seasons (with or without the next one), rankings and the clan. */
function api(options: { nextListed?: boolean } = {}) {
  const seasons = [{ id: '2026-04' }, { id: 'v2-2026-09-28T05:00:00Z' }, { id: LAST_ENDED }, ...(options.nextListed ? [{ id: NEXT }] : [])];
  return mockCocApi({
    '/leagues/29000022/seasons': { body: { items: seasons, paging: { cursors: {} } } },
    [`/seasons/${encodeURIComponent(NEXT)}`]: {
      body: {
        items: [
          { tag: '#ITA1', name: 'Italian ahead', rank: 120, trophies: 5600 },
          { tag: '#MIK', name: 'Mik', rank: 3752, trophies: 5091 },
          { tag: '#ITA2', name: 'Italian behind', rank: 4100, trophies: 5080 },
          { tag: '#DEMOTED', name: 'In Legend II', rank: 9000, trophies: 4990 },
        ],
      },
    },
    '/clans/%232J8JVVCLC': { body: { tag: '#2J8JVVCLC', location: { id: ITALY, isCountry: true, countryCode: 'IT' } } },
    [`/locations/${ITALY}/rankings/players`]: {
      body: {
        items: [
          { tag: '#ITA1', rank: 1, trophies: 5590 },
          { tag: '#ITA2', rank: 2, trophies: 5085 },
          { tag: '#MIK', rank: 3, trophies: 5080 },
        ],
      },
    },
  });
}

describe('Legend League seasons', () => {
  it('starts from the last ended season and wakes up just before the end of the next one', async () => {
    api();
    const report = await syncLegendSeason(NOW);
    expect(report).toMatchObject({ processed: null, error: null, nextCheckAt: '2026-11-23T04:57:00.000Z' });
    expect(await LegendSeasonModel.findOne({ seasonId: LAST_ENDED }).lean()).toMatchObject({ results: [] });
    expect((await LegendSeasonModel.findOne({ seasonId: LAST_ENDED }).lean())!.processedAt).not.toBeNull();
  });

  it('reads the country ranking before the end, then the members in Legend League I among the first 10,000', async () => {
    await member('#MIK', 'Mik', LEGEND_ONE);
    await member('#DEMOTED', 'In Legend II', LEGEND_TWO, '#2JU8RPR2G');
    await member('#FAR', 'Far away', LEGEND_ONE);
    api();
    await syncLegendSeason(NOW);

    const before = await syncLegendSeason(READ_AT);
    expect(before.nextCheckAt).toBe('2026-11-23T05:01:00.000Z');
    const read = await LegendSeasonModel.findOne({ seasonId: NEXT }).lean();
    expect(read).toMatchObject({ countryCode: 'IT', locationId: ITALY, processedAt: null });
    expect(read!.legendOneTags!.sort()).toEqual(['#FAR', '#MIK']);
    expect(read!.countryRanking).toHaveLength(3);

    // Ended, but the API does not list it yet.
    expect((await syncLegendSeason(AFTER_END)).processed).toBeNull();

    api({ nextListed: true });
    expect((await syncLegendSeason(AFTER_END)).processed).toBe(NEXT);
    const season = await LegendSeasonModel.findOne({ seasonId: NEXT }).lean();
    // #FAR is not among the first 10,000; #DEMOTED was not in Legend League I.
    expect(season!.results).toEqual([
      { tag: '#MIK', name: 'Mik', clanTag: '#2J8JVVCLC', rank: 3752, trophies: 5091, countryRank: 2 },
    ]);

    // The next run waits for the season after.
    expect((await syncLegendSeason(AFTER_END)).nextCheckAt).toBe('2026-12-21T04:57:00.000Z');
  });

  it('prepares one draft per member and season, with trophies, country and world positions', async () => {
    await member('#MIK', 'Mik', LEGEND_ONE);
    await syncAnnouncementDrafts(NOW);
    api();
    await syncLegendSeason(NOW);
    await syncLegendSeason(READ_AT);
    api({ nextListed: true });
    await syncLegendSeason(AFTER_END);

    expect((await syncAnnouncementDrafts(AFTER_END)).created).toEqual([`legend:${NEXT}:#MIK`]);
    expect((await syncAnnouncementDrafts(AFTER_END)).created).toEqual([]);
    const draft = await AnnouncementModel.findOne({ kind: 'legendSeason' }).lean();
    const data = draft!.data as LegendSeasonData;
    expect(data).toMatchObject({ trophies: 5091, worldRank: 3752, countryRank: 2, countryCode: 'IT', clanName: 'Crociata Nera' });
    const caption = generatedCaption(data, 'it-IT');
    expect(caption).toContain('🏆 **5.091** trofei');
    expect(caption).toContain('🇮🇹 **2°** in Italia');
    expect(caption).toContain('🌍 **3752°** nel mondo');
    expect(caption).toContain('Tra i migliori 10.000 giocatori del pianeta. Complimenti da tutti i clan della Crociata! ⚔️');
    expect(generatedCaption(data, 'en-US')).toContain('🇮🇹 **#2** in Italy');
  });

  it('country position: unknown without a reading, or beyond the top 200', () => {
    const final = new Map([
      ['#A', { rank: 10 }],
      ['#B', { rank: 20 }],
    ]);
    expect(countryRank('#ME', 30, null, final)).toBeNull();
    expect(countryRank('#ME', 30, [{ tag: '#A' }, { tag: '#B' }], final)).toBeNull();
    expect(countryRank('#ME', 15, [{ tag: '#A' }, { tag: '#B' }], final)).toBe(2);
    expect(countryRank('#ME', 30, [{ tag: '#A' }, { tag: '#ME' }, { tag: '#B' }], final)).toBe(3);
  });
});
