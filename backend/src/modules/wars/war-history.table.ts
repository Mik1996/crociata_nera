import { CocApiError, fetchWarLog } from '@/lib/coc/coc-client';
import { cachedRead } from '@/lib/coc/live-cache';
import { env } from '@/lib/config/env';
import { defineTable, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { WarModel } from './war.model';
import { buildWarKey } from './wars.service';
import { cocWarLogSchema, CocWarLogEntry } from './wars.schemas';

/**
 * War history of the main clan (`GET /wars/history`): the saved wars, completed by the war log of
 * the Clash of Clans API (summaries of the wars fought before the backend saved them). Same rules
 * as the frontend's history: a saved war whose end has passed counts as ended; the war log's final
 * numbers replace those of the matching saved war.
 */

export type WarOutcome = 'victory' | 'defeat' | 'draw';

export interface WarHistoryRow {
  /** War id: the `warKey` of a saved war, `warlog-<end>-<opponent>` for a war known only from the war log. */
  id: string;
  /** End of the battle day. */
  date: string;
  opponent: string;
  opponentTag: string;
  teamSize: number;
  result: WarOutcome;
  stars: number;
  starsConceded: number;
  destruction: number;
  destructionConceded: number;
  /** Players and attacks are known (saved war). */
  hasDetails: boolean;
}

export interface WarHistorySummary {
  wars: number;
  victories: number;
  defeats: number;
  draws: number;
}

export type WarHistoryPage = TablePage<WarHistoryRow> & { summary: WarHistorySummary };

export const WAR_RESULTS: readonly WarOutcome[] = ['victory', 'defeat', 'draw'];

export const WAR_HISTORY_TABLE = defineTable<WarHistoryRow>(
  {
    date: { label: 'the end of the war', filter: 'date', sort: true },
    opponent: { label: "the opponent's name or tag", filter: 'text', value: (r) => [r.opponent, r.opponentTag], sort: (r) => r.opponent },
    teamSize: { label: 'players per side', filter: 'number', sort: true },
    result: { label: 'the result', filter: 'select', options: WAR_RESULTS, sort: true },
    stars: { label: 'stars of the clan', filter: 'number', sort: true },
    destruction: { label: 'destruction by the clan (%)', filter: 'number', sort: true },
  },
  { sort: 'date', order: 'desc' },
);

/** How long the war log read for the history is kept. */
const WAR_LOG_TTL_MS = 5 * 60_000;
/** Tolerance between the end of a saved war and that of its war log entry. */
const WAR_END_TOLERANCE_MS = 60_000;

const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** Winner by stars, then destruction. */
export function outcome(clan: { stars: number; destruction: number }, opponent: { stars: number; destruction: number }): WarOutcome {
  const diff = clan.stars - opponent.stars || clan.destruction - opponent.destruction;
  return diff > 0 ? 'victory' : diff < 0 ? 'defeat' : 'draw';
}

/** The war log of the main clan (every war it lists); empty when private or unreachable. */
async function warLog(clanTag: string): Promise<CocWarLogEntry[]> {
  try {
    return await cachedRead(`warlog:${clanTag}`, WAR_LOG_TTL_MS, async () =>
      cocWarLogSchema.parse(await fetchWarLog(clanTag, null)).items,
    );
  } catch (error) {
    if (!(error instanceof CocApiError)) console.warn(`[wars] war log not read: ${(error as Error).message}`);
    return [];
  }
}

/** Every ended war of the main clan, most recent first. */
export async function warHistoryRows(now = new Date()): Promise<WarHistoryRow[]> {
  const clanTag = env().CLAN_TAG;
  const [saved, log] = await Promise.all([
    WarModel.find({
      ...(clanTag ? { clanTag } : {}),
      $or: [{ state: 'warEnded' }, { endTime: { $lt: now } }],
    })
      .select({ 'clan.members': { $slice: 1 }, 'opponent.members': 0 })
      .lean(),
    clanTag ? warLog(clanTag) : Promise.resolve([]),
  ]);
  // League (CWL) entries have neither opponent tag nor result.
  const summaries = log.filter((entry) => entry.opponent.tag && entry.result !== null);

  const rows: WarHistoryRow[] = saved.map((war) => {
    const end = war.endTime.getTime();
    const index = summaries.findIndex(
      (s) =>
        s.opponent.tag === war.opponent.tag &&
        s.endTime.getTime() >= war.startTime.getTime() - WAR_END_TOLERANCE_MS &&
        s.endTime.getTime() <= end + WAR_END_TOLERANCE_MS,
    );
    // The war log's numbers are final: they replace those of a possibly stale snapshot.
    const [summary] = index < 0 ? [] : summaries.splice(index, 1);
    const clan = summary?.clan ?? war.clan;
    const opponent = summary?.opponent ?? war.opponent;
    return row({
      id: war.warKey,
      endTime: war.endTime,
      opponent: war.opponent.name,
      opponentTag: war.opponent.tag,
      teamSize: war.teamSize,
      clan,
      enemy: opponent,
      hasDetails: war.clan.members.length > 0,
    });
  });
  for (const s of summaries) {
    rows.push(
      row({
        // Same id as the frontend gives it: `buildWarKey` of the end instead of the preparation start.
        id: `warlog-${buildWarKey(s.endTime, s.opponent.tag!)}`,
        endTime: s.endTime,
        opponent: s.opponent.name ?? s.opponent.tag!,
        opponentTag: s.opponent.tag!,
        teamSize: s.teamSize,
        clan: s.clan,
        enemy: s.opponent,
        hasDetails: false,
      }),
    );
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function row(war: {
  id: string;
  endTime: Date;
  opponent: string;
  opponentTag: string;
  teamSize: number;
  clan: { stars: number; destructionPercentage: number };
  enemy: { stars: number; destructionPercentage: number };
  hasDetails: boolean;
}): WarHistoryRow {
  const clan = { stars: war.clan.stars, destruction: war.clan.destructionPercentage };
  const enemy = { stars: war.enemy.stars, destruction: war.enemy.destructionPercentage };
  return {
    id: war.id,
    date: war.endTime.toISOString(),
    opponent: war.opponent,
    opponentTag: war.opponentTag,
    teamSize: war.teamSize,
    result: outcome(clan, enemy),
    stars: clan.stars,
    starsConceded: enemy.stars,
    destruction: round(clan.destruction, 2),
    destructionConceded: round(enemy.destruction, 2),
    hasDetails: war.hasDetails,
  };
}

/** `GET /wars/history`: a page of the history, with the record of every war (not only the matching ones). */
export async function listWarHistory(query: TableQuery, now = new Date()): Promise<WarHistoryPage> {
  const rows = await warHistoryRows(now);
  const count = (result: WarOutcome) => rows.filter((r) => r.result === result).length;
  return {
    ...queryTable(rows, WAR_HISTORY_TABLE, query),
    summary: { wars: rows.length, victories: count('victory'), defeats: count('defeat'), draws: count('draw') },
  };
}
