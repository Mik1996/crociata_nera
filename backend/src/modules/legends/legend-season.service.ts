import { z } from 'zod';
import { primaryClanTag } from '@/lib/coc/crusade-clans';
import { CocApiError, fetchClan, fetchLegendSeasonRankings, fetchLegendSeasons, fetchPlayerRankings } from '@/lib/coc/coc-client';
import { PlayerModel } from '@/modules/commendations/player.model';
import { LegendSeasonModel, LegendSeasonResult } from './legend-season.model';

/**
 * End of the Legend League seasons and the results of the members in Legend League I.
 *
 * The API lists the ended seasons (`GET /leagues/29000022/seasons`, ids `v2-<end>`): seasons last four
 * weeks and end on Monday at 05:00 UTC, so the one in progress ends four weeks after the last listed.
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
      // First run: the last ended season is the starting point (no results for the past).
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

    const end = new Date(last.endTime.getTime() + SEASON_LENGTH_MS);
    const seasonId = legendSeasonId(end);
    const readAt = new Date(end.getTime() - COUNTRY_READ_BEFORE_MS);
    if (now < end) {
      if (now >= readAt) await readCountryRanking(seasonId, end, now);
      report.nextCheckAt = (now < readAt ? readAt : new Date(end.getTime() + 60_000)).toISOString();
      return report;
    }
    // Ended: its final ranking comes once the API lists it.
    if (!(await listedSeasons()).includes(seasonId)) return report;
    await processSeason(seasonId, end, now);
    report.processed = seasonId;
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
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
  await LegendSeasonModel.updateOne(
    { seasonId },
    { $set: { results: results.sort((a, b) => a.rank - b.rank), processedAt: now }, $setOnInsert: { seasonId, endTime: end } },
    { upsert: true },
  );
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
