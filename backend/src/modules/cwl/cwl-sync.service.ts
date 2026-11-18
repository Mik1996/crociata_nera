import { z } from 'zod';
import { env } from '@/lib/config/env';
import { CocApiError, fetchLeagueGroup, fetchLeagueWar } from '@/lib/coc/coc-client';
import { CwlSeasonDocument, CwlSeasonModel } from './cwl.model';

/** Outcome of one Clan War League synchronisation. */
export interface CwlSyncReport {
  season: string | null;
  /** Group state, or `notInWar` outside the CWL days. */
  state: string | null;
  /** Wars read from the API in this run (ended wars are read only once). */
  warsFetched: number;
  /** Saved seasons marked `ended` after the API stopped returning their group. */
  closed: string[];
  /**
   * Of {@link closed}, the seasons closed with the wars saved so far: a war is no longer in the
   * API (404), or the season is long over ({@link STALE_SEASON_MS}).
   */
  closedIncomplete: string[];
  error: { status: number; reason: string; message: string } | null;
}

/** Placeholder of the API for wars not scheduled yet. */
const UNSCHEDULED = '#0';
/**
 * A saved season still open this long after the end of its month is closed with the wars saved
 * so far (the group is gone and its wars cannot be completed anymore), so its commendations are awarded.
 */
export const STALE_SEASON_MS = 7 * 24 * 3_600_000;

const groupSchema = z.object({
  state: z.string(),
  season: z.string(),
  clans: z.array(z.object({ tag: z.string() }).passthrough()),
  rounds: z.array(z.object({ warTags: z.array(z.string()) })),
});

const warSchema = z.object({ state: z.string() }).passthrough();

/**
 * Saves the current Clan War League group and its wars. Outside the CWL days the API answers
 * 404 (or `notInWar`): then only saved seasons not marked `ended` yet are completed (see
 * `closeOpenSeasons`). Wars already ended are not read again; the season is marked `ended` once
 * all its scheduled wars have ended. Idempotent. Runs for one clan: the main one (`CLAN_TAG`)
 * unless another clan of the Crusade is given.
 */
export async function syncCwl(now = new Date(), clanTag: string | null = env().CLAN_TAG ?? null): Promise<CwlSyncReport> {
  const report: CwlSyncReport = { season: null, state: null, warsFetched: 0, closed: [], closedIncomplete: [], error: null };
  if (!clanTag) return report;

  try {
    let raw: unknown;
    try {
      raw = await fetchLeagueGroup(clanTag);
    } catch (error) {
      if (!(error instanceof CocApiError && error.status === 404)) throw error;
      raw = null;
    }
    const parsed = groupSchema.safeParse(raw);
    if (!parsed.success || parsed.data.state === 'notInWar' || parsed.data.state === 'groupNotFound') {
      report.state = 'notInWar';
      await closeOpenSeasons(clanTag, now, report);
      return report;
    }
    const group = parsed.data;
    // Normalised to `YYYY-MM` (the API may also answer `YYYY-MM-DD`): the key used by the frontend.
    const key = group.season.slice(0, 7);
    report.season = key;

    const season = (await CwlSeasonModel.findOne({ clanTag, season: key })) ?? new CwlSeasonModel({ clanTag, season: key });
    const wars = await readWars(season, group.rounds, report);
    const state = group.state === 'ended' || allWarsEnded(group.rounds, wars) ? 'ended' : group.state;
    report.state = state;

    season.set({ clanTag, state, clans: group.clans, rounds: group.rounds, wars: [...wars.values()], lastSyncedAt: now });
    season.markModified('clans');
    season.markModified('wars');
    await season.save();
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}

type Rounds = { warTags: string[] }[];
type SavedWar = { warTag: string; state: string; war: unknown };

/**
 * Wars of the season with the ones not ended yet read again from the API. With `missing`, a war
 * the API no longer has (404) is kept as saved and its tag added there; otherwise it is an error.
 */
async function readWars(
  season: CwlSeasonDocument,
  rounds: Rounds,
  report: CwlSyncReport,
  missing?: string[],
): Promise<Map<string, SavedWar>> {
  const wars = savedWars(season);
  for (const tag of rounds.flatMap((r) => r.warTags)) {
    if (tag === UNSCHEDULED || wars.get(tag)?.state === 'warEnded') continue;
    let raw: unknown;
    try {
      raw = await fetchLeagueWar(tag);
    } catch (error) {
      if (!(missing && error instanceof CocApiError && error.status === 404)) throw error;
      missing.push(tag);
      continue;
    }
    const war = warSchema.parse(raw);
    wars.set(tag, { warTag: tag, state: war.state, war });
    report.warsFetched++;
  }
  return wars;
}

/** Wars of the season as saved. */
function savedWars(season: CwlSeasonDocument): Map<string, SavedWar> {
  return new Map(season.wars.map((w) => [w.warTag, { warTag: w.warTag, state: w.state, war: w.war }]));
}

/** Every round scheduled and every war of the group ended. */
function allWarsEnded(rounds: Rounds, wars: Map<string, SavedWar>): boolean {
  const tags = rounds.flatMap((r) => r.warTags);
  return tags.length > 0 && tags.every((tag) => tag !== UNSCHEDULED && wars.get(tag)?.state === 'warEnded');
}

/**
 * The API stops returning the group soon after the last round ends (as soon as the clan starts a
 * regular war, for instance), possibly before a sync has seen the last wars ended. The seasons
 * saved and still open are completed by reading their wars directly, which the API keeps for a while.
 * A season is closed with the wars saved so far when one of them is no longer in the API, or
 * {@link STALE_SEASON_MS} after the end of its month (without reading the API).
 */
async function closeOpenSeasons(clanTag: string, now: Date, report: CwlSyncReport): Promise<void> {
  for (const season of await CwlSeasonModel.find({ clanTag, state: { $ne: 'ended' } })) {
    const rounds = season.rounds.map((r) => ({ warTags: [...r.warTags] }));
    const stale = now.getTime() >= seasonMonthEnd(season.season).getTime() + STALE_SEASON_MS;
    const missing: string[] = [];
    const wars = stale ? savedWars(season) : await readWars(season, rounds, report, missing);
    const complete = allWarsEnded(rounds, wars);
    const incomplete = !complete && (stale || missing.length > 0);
    const ended = complete || incomplete;
    season.set({ wars: [...wars.values()], lastSyncedAt: now, ...(ended ? { state: 'ended' } : {}) });
    season.markModified('wars');
    await season.save();
    if (ended) report.closed.push(season.season);
    if (incomplete) {
      report.closedIncomplete.push(season.season);
      const why = missing.length ? `no longer in the API: ${missing.join(', ')}` : 'season long over';
      console.warn(`[cwl-sync] ${clanTag}: season ${season.season} closed with the wars saved so far (${why})`);
    }
  }
}

/** First moment (UTC) after the month of a `YYYY-MM` season. */
function seasonMonthEnd(season: string): Date {
  const [year = 0, month = 1] = season.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1));
}
