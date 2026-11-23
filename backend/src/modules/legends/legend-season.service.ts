import { z } from 'zod';
import { primaryClanTag } from '@/lib/coc/crusade-clans';
import {
  CocApiError,
  fetchClan,
  fetchLegendSeasonRankings,
  fetchLegendSeasons,
  fetchPlayer,
  fetchPlayerRankings,
} from '@/lib/coc/coc-client';
import { PlayerModel } from '@/modules/commendations/player.model';
import { LegendSeasonModel, LegendSeasonResult } from './legend-season.model';

/**
 * End of the Legend League seasons and the results of the members in Legend League I.
 *
 * How the game works: every league from Skeleton 1 to Legend League II is a weekly tournament (Monday
 * 05:00 UTC, seven days). Legend League I has its own tournament of four weeks (28 days: at most 224
 * attacks won), ending on Monday at 05:00 UTC; every Monday in between the players outside the first
 * 10,000 of the world go down to Legend League II and the best of Legend League II come up. A week
 * outside the tournament may come between two of them (26 October – 2 November 2026).
 *
 * The API lists the ended tournaments (`GET /leagues/29000022/seasons`, ids `v2-<end>`); the one in
 * progress is known from a member in Legend League I, whose profile gives its start
 * (`currentLeagueSeasonId`, seconds, the same for every player in Legend League I; for the other leagues
 * it is the weekly tournament): its end is four weeks later.
 * - A few minutes before that end the country ranking of the clan is read (top 200: the API resets it
 *   when the season ends) with the members in Legend League I at that moment.
 * - Once the season is listed, its final world ranking (`/seasons/{id}`, the first 10,000: those who
 *   stay in Legend League I) gives each member's trophies and world position; the country position is
 *   worked out from the final positions of the players read in the country ranking.
 */

export const SEASON_LENGTH_MS = 28 * 24 * 3_600_000;
/** The country ranking is read this long before the end of the season. */
export const COUNTRY_READ_BEFORE_MS = 3 * 60_000;
/** Legend League I (`leagueTier`). */
export const LEGEND_LEAGUE_ONE = 105000036;
/** The first 10,000 of the world stay in Legend League I; the others go down to Legend League II. */
export const LEGEND_ONE_PLACES = 10_000;
/**
 * A season the API still does not list a week after its end was guessed wrong: it is forgotten (the
 * final ranking of a real season is listed within minutes).
 */
const UNLISTED_GIVE_UP_MS = 7 * 24 * 3_600_000;

export interface LegendSeasonReport {
  /** Wake up then: the country reading before the end, or right after the end. */
  nextCheckAt: string | null;
  /** Season processed in this run. */
  processed: string | null;
  error: { status: number; reason: string; message: string } | null;
}

const seasonsSchema = z.object({
  items: z.array(z.object({ id: z.string() })),
  paging: z.object({ cursors: z.object({ after: z.string().optional() }).optional() }).optional(),
});
const rankingSchema = z.object({
  items: z.array(z.object({ tag: z.string(), name: z.string().optional(), rank: z.number().int(), trophies: z.number().int() })),
});
const profileSchema = z.object({ currentLeagueSeasonId: z.number().int().optional() });
const clanSchema = z.object({
  location: z.object({ id: z.number().int(), isCountry: z.boolean().optional(), countryCode: z.string().optional() }).optional(),
});

/** `v2-2026-10-26T05:00:00Z` of a season ending at `end`. */
export function legendSeasonId(end: Date): string {
  return `v2-${end.toISOString().replace('.000Z', 'Z')}`;
}

/** End of a season from its id; `null` for the seasons before the four-week ones (`2026-04`). */
function endOf(seasonId: string): Date | null {
  const match = /^v2-(.+)$/.exec(seasonId);
  const end = match?.[1] ? new Date(match[1]) : null;
  return end && !Number.isNaN(end.getTime()) ? end : null;
}

async function listedSeasons(): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const parsed = seasonsSchema.parse(await fetchLegendSeasons(after));
    ids.push(...parsed.items.map((item) => item.id));
    after = parsed.paging?.cursors?.after;
    if (!after) break;
  }
  return ids;
}

export async function syncLegendSeason(now = new Date()): Promise<LegendSeasonReport> {
  const report: LegendSeasonReport = { nextCheckAt: null, processed: null, error: null };
  if (!primaryClanTag()) return report;
  try {
    let last = await LegendSeasonModel.findOne({ processedAt: { $ne: null } }).sort({ endTime: -1 }).lean();
    if (!last) {
      // First run: the last ended season is the starting point (its results are read just below).
      const ended = (await listedSeasons()).map(endOf).filter((end): end is Date => end !== null);
      const latest = ended.at(-1);
      if (!latest) return report;
      await LegendSeasonModel.updateOne(
        { seasonId: legendSeasonId(latest) },
        { $setOnInsert: { seasonId: legendSeasonId(latest), endTime: latest, processedAt: now } },
        { upsert: true },
      );
      last = await LegendSeasonModel.findOne({ seasonId: legendSeasonId(latest) }).lean();
      if (!last) return report;
    }

    await readLateResults(now);

    // The season in progress: known already, or learned from a member in Legend League I.
    let season = await LegendSeasonModel.findOne({ processedAt: null, endTime: { $gt: last.endTime } }).sort({ endTime: 1 }).lean();
    if (!season) {
      const end = await seasonInProgressEnd();
      // Nobody in Legend League I (no result possible), or the profile still points at the last season.
      if (!end || end <= last.endTime) return report;
      await LegendSeasonModel.updateOne(
        { seasonId: legendSeasonId(end) },
        { $setOnInsert: { seasonId: legendSeasonId(end), endTime: end, processedAt: null } },
        { upsert: true },
      );
      season = await LegendSeasonModel.findOne({ seasonId: legendSeasonId(end) }).lean();
      if (!season) return report;
    }

    const end = season.endTime;
    const readAt = new Date(end.getTime() - COUNTRY_READ_BEFORE_MS);
    if (now < end) {
      if (now >= readAt) await readCountryRanking(season.seasonId, end, now);
      report.nextCheckAt = (now < readAt ? readAt : new Date(end.getTime() + 60_000)).toISOString();
      return report;
    }
    // Ended: its final ranking comes once the API lists it.
    if (!(await listedSeasons()).includes(season.seasonId)) {
      if (now.getTime() - end.getTime() > UNLISTED_GIVE_UP_MS) {
        console.warn(`[legends] season ${season.seasonId} never listed by the API: forgotten`);
        await LegendSeasonModel.deleteOne({ seasonId: season.seasonId, processedAt: null });
      }
      return report;
    }
    await processSeason(season.seasonId, end, now);
    report.processed = season.seasonId;
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}

/**
 * End of the Legend League season in progress: start of the tournament of a member in Legend League I
 * (`currentLeagueSeasonId` of the profile) plus four weeks; `null` when no member is in Legend League I.
 */
async function seasonInProgressEnd(): Promise<Date | null> {
  const member = await PlayerModel.findOne({ inClan: true, 'league.id': LEGEND_LEAGUE_ONE }).select('tag').lean();
  if (!member) return null;
  const start = profileSchema.parse(await fetchPlayer(member.tag)).currentLeagueSeasonId;
  return start ? new Date(start * 1000 + SEASON_LENGTH_MS) : null;
}

/** The country's top 200 and the members in Legend League I, just before the end (once). */
async function readCountryRanking(seasonId: string, end: Date, now: Date): Promise<void> {
  if (await LegendSeasonModel.exists({ seasonId, countryRankingAt: { $ne: null } })) return;
  const clan = clanSchema.parse(await fetchClan(primaryClanTag()!));
  const location = clan.location?.isCountry ? clan.location : null;
  const ranking = location ? rankingSchema.parse(await fetchPlayerRankings(location.id)).items : [];
  const legendOne = await PlayerModel.find({ inClan: true, 'league.id': LEGEND_LEAGUE_ONE }).select('tag').lean();
  await LegendSeasonModel.updateOne(
    { seasonId },
    {
      $set: {
        countryCode: location?.countryCode ?? null,
        locationId: location?.id ?? null,
        countryRanking: ranking.map(({ tag, rank, trophies }) => ({ tag, rank, trophies })),
        countryRankingAt: now,
        legendOneTags: legendOne.map((p) => p.tag),
      },
      $setOnInsert: { seasonId, endTime: end },
    },
    { upsert: true },
  );
}

/** The results of the members from the final world ranking; then the season is processed. */
async function processSeason(seasonId: string, end: Date, now: Date): Promise<void> {
  const results = await seasonResults(seasonId);
  await LegendSeasonModel.updateOne(
    { seasonId },
    { $set: { results, processedAt: now }, $setOnInsert: { seasonId, endTime: end } },
    { upsert: true },
  );
}

/**
 * Seasons processed without results, because they ended before the backend tracked Legend League (the
 * starting season of the first run): their results are read once afterwards from the final world
 * ranking, which the API keeps for the ended seasons. Nothing was read before their end, so country
 * positions stay unknown and Legend League I is the league saved for the current members. A season
 * whose ranking cannot be read is tried again at the next sync.
 */
async function readLateResults(now: Date): Promise<void> {
  const late = await LegendSeasonModel.find({
    processedAt: { $ne: null },
    countryRankingAt: null,
    resultsReadLateAt: null,
    'results.0': { $exists: false },
  })
    .select('seasonId')
    .lean();
  if (!late.length) return;
  const listed = new Set(await listedSeasons());
  for (const { seasonId } of late) {
    if (!listed.has(seasonId)) continue;
    try {
      await LegendSeasonModel.updateOne({ seasonId }, { $set: { results: await seasonResults(seasonId), resultsReadLateAt: now } });
    } catch (error) {
      // Never blocks the season in progress: tried again at the next sync.
      if (!(error instanceof CocApiError)) throw error;
      console.warn(`[legends] results of ${seasonId} not read: ${error.message}`);
    }
  }
}

/** The members who ended a season among the first 10,000 of the world in Legend League I, best first. */
async function seasonResults(seasonId: string): Promise<LegendSeasonResult[]> {
  const final = rankingSchema.parse(await fetchLegendSeasonRankings(seasonId, LEGEND_ONE_PLACES)).items;
  const finalByTag = new Map(final.map((item) => [item.tag, item]));
  const season = await LegendSeasonModel.findOne({ seasonId }).lean();
  const legendOne = season?.legendOneTags ? new Set(season.legendOneTags) : null;
  const members = await PlayerModel.find({ inClan: true }).select('tag name clanTag league').lean();

  const results: LegendSeasonResult[] = [];
  for (const member of members) {
    const placed = finalByTag.get(member.tag);
    if (!placed || placed.rank > LEGEND_ONE_PLACES) continue;
    // In Legend League I at the end: read before it, or (no reading) the league saved now.
    const inLegendOne = legendOne ? legendOne.has(member.tag) : member.league?.id === LEGEND_LEAGUE_ONE;
    if (!inLegendOne) continue;
    results.push({
      tag: member.tag,
      name: member.name,
      clanTag: member.clanTag ?? primaryClanTag()!,
      rank: placed.rank,
      trophies: placed.trophies,
      countryRank: countryRank(member.tag, placed.rank, season?.countryRanking ?? null, finalByTag),
    });
  }
  return results.sort((a, b) => a.rank - b.rank);
}

/**
 * Position in the country at the end: one plus the players of the country ranking (read just before
 * the end) with a better final world position. `null` without a reading, or when the player was not in
 * it and all of its players finished ahead (the position is beyond the top 200).
 */
export function countryRank(
  tag: string,
  worldRank: number,
  countryRanking: readonly { tag: string }[] | null,
  finalByTag: ReadonlyMap<string, { rank: number }>,
): number | null {
  if (!countryRanking?.length) return null;
  const others = countryRanking.filter((player) => player.tag !== tag);
  const ahead = others.filter((player) => (finalByTag.get(player.tag)?.rank ?? Infinity) < worldRank).length;
  const inRanking = others.length < countryRanking.length;
  if (!inRanking && ahead === countryRanking.length) return null;
  return ahead + 1;
}

/** The last processed Legend League season with the members who ended it among the first 10,000 of the world. */
export interface LatestLegendSeason {
  seasonId: string;
  endTime: string;
  results: { tag: string; name: string; clanTag: string; rank: number }[];
}

/**
 * The last processed Legend League season (`null` before the first one), with its members among the
 * first 10,000 of the world, best first: the site shows their `legendTop` commendation.
 */
export async function latestLegendSeason(): Promise<LatestLegendSeason | null> {
  const season = await LegendSeasonModel.findOne({ processedAt: { $ne: null } }).sort({ endTime: -1 }).lean();
  if (!season) return null;
  return {
    seasonId: season.seasonId,
    endTime: season.endTime.toISOString(),
    results: season.results.map(({ tag, name, clanTag, rank }) => ({ tag, name, clanTag, rank })),
  };
}
