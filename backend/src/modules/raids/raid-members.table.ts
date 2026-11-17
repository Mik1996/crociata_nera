import { z } from 'zod';
import { CocApiError, fetchRaidSeasons } from '@/lib/coc/coc-client';
import { cocDate } from '@/lib/coc/coc-date';
import { cachedRead } from '@/lib/coc/live-cache';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { defineTable, filterRows, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { RaidSeasonModel } from './raid.model';

/**
 * Members of the main clan who attacked in a Raid Weekend (`GET /raids/seasons/{startTime}/members`):
 * from the saved weekend, or from the Clash of Clans API when the backend has not saved it.
 */

export interface RaidMemberRow {
  /** Position in the whole list (most Capital Gold looted first). */
  rank: number;
  tag: string;
  name: string;
  attacks: number;
  /** Attacks available, bonus attacks included. */
  attackLimit: number;
  /** Capital Gold looted. */
  looted: number;
}

/** Totals over the matching members, for the footer of the table. */
export interface RaidMembersSummary {
  attacks: number;
  attackLimit: number;
  looted: number;
}

export type RaidMembersPage = TablePage<RaidMemberRow> & { summary: RaidMembersSummary };

export const RAID_MEMBERS_TABLE = defineTable<RaidMemberRow>(
  {
    rank: { label: 'position in the list', sort: true },
    name: { label: "the player's name or tag", filter: 'text', value: (m) => [m.name, m.tag], sort: (m) => m.name },
    attacks: { label: 'attacks', filter: 'number', sort: true },
    looted: { label: 'Capital Gold looted', filter: 'number', sort: true },
  },
  { sort: 'rank', order: 'asc' },
);

/** How long the weekends read from the API are kept. */
const RAIDS_TTL_MS = 60_000;
/** Weekends read from the API when the one asked for is not saved. */
const API_SEASONS = 10;

const memberSchema = z.object({
  tag: z.string(),
  name: z.string(),
  attacks: z.number().int().min(0),
  attackLimit: z.number().int().min(0),
  bonusAttackLimit: z.number().int().min(0).default(0),
  capitalResourcesLooted: z.number().min(0),
});
const seasonSchema = z.object({ startTime: cocDate, members: z.array(z.unknown()).optional() });

/** The members of a weekend as the API lists them (`members` of a `capitalraidseasons` item). */
export function raidMemberRows(members: unknown[]): RaidMemberRow[] {
  return members
    .flatMap((raw) => {
      const parsed = memberSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .map((m) => ({
      tag: m.tag,
      name: m.name,
      attacks: m.attacks,
      attackLimit: m.attackLimit + m.bonusAttackLimit,
      looted: m.capitalResourcesLooted,
    }))
    .sort((a, b) => b.looted - a.looted)
    .map((m, i) => ({ rank: i + 1, ...m }));
}

/** Members of a weekend not saved, from the API; `null` when the API does not list it. */
async function apiMembers(clanTag: string, startTime: Date): Promise<unknown[] | null> {
  try {
    const items = await cachedRead(`raids:${clanTag}`, RAIDS_TTL_MS, async () => {
      const list = (await fetchRaidSeasons(clanTag, API_SEASONS)) as { items?: unknown[] } | null;
      return list?.items ?? [];
    });
    for (const item of items) {
      const parsed = seasonSchema.safeParse(item);
      if (parsed.success && parsed.data.startTime.getTime() === startTime.getTime()) return parsed.data.members ?? [];
    }
    return null;
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    return null;
  }
}

/** `GET /raids/seasons/{startTime}/members`: a page of the members of a weekend; 404 for an unknown weekend. */
export async function listRaidMembers(startTime: Date, query: TableQuery): Promise<RaidMembersPage> {
  const clanTag = env().CLAN_TAG;
  const doc = await RaidSeasonModel.findOne({ ...(clanTag ? { clanTag } : {}), startTime }).lean();
  const saved = doc ? (((doc.season as { members?: unknown[] }).members ?? []) as unknown[]) : null;
  const members = saved ?? (clanTag ? await apiMembers(clanTag, startTime) : null);
  if (!members) throwException(404, MessageKey.RAID_SEASON_NOT_FOUND);
  const rows = raidMemberRows(members);
  const matching = filterRows(rows, RAID_MEMBERS_TABLE.columns, query.filters);
  const sum = (field: keyof RaidMembersSummary) => matching.reduce((total, m) => total + m[field], 0);
  return {
    ...queryTable(rows, RAID_MEMBERS_TABLE, query),
    summary: { attacks: sum('attacks'), attackLimit: sum('attackLimit'), looted: sum('looted') },
  };
}
