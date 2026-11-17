import { CocApiError, fetchCurrentWar } from '@/lib/coc/coc-client';
import { cachedRead } from '@/lib/coc/live-cache';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { defineTable, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { WarModel } from './war.model';
import { buildWarKey } from './wars.service';
import { cocWarSchema } from './wars.schemas';

/**
 * Players of the clan in a war, with their attacks (`GET /wars/{warKey}/participants`): the war in
 * progress is read from the Clash of Clans API (kept 30 seconds), the others from the saved wars.
 */

export interface AttackTarget {
  mapPosition: number;
  name: string;
  townHall: number;
  stars: number;
  destruction: number;
}

export interface ParticipantRow {
  tag: string;
  name: string;
  mapPosition: number;
  townHall: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  averageDestruction: number;
  hasAttacked: boolean;
  targets: AttackTarget[];
}

export interface ParticipantsSummary {
  /** Town halls of the clan's players in the war, highest first (the options of its filter). */
  townHalls: number[];
}

export type ParticipantsPage = TablePage<ParticipantRow> & { summary: ParticipantsSummary };

export const PARTICIPANTS_TABLE = defineTable<ParticipantRow>(
  {
    mapPosition: { label: 'position in the line-up', sort: true },
    townHall: { label: 'town hall level', filter: 'select', sort: true },
    name: { label: "the player's name or tag", filter: 'text', value: (r) => [r.name, r.tag], sort: (r) => r.name },
    attacks: { label: 'the player has attacked at least once', filter: 'boolean', value: (r) => r.hasAttacked, sort: (r) => r.attacksUsed },
    stars: { label: 'stars', filter: 'number', sort: true },
    averageDestruction: {
      label: 'average destruction (%) of the attacks',
      filter: 'number',
      value: (r) => (r.hasAttacked ? r.averageDestruction : null),
      sort: true,
    },
  },
  { sort: 'mapPosition', order: 'asc' },
);

/** How long the war in progress read from the API is kept. */
const CURRENT_WAR_TTL_MS = 30_000;

interface WarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacks?: { defenderTag: string; stars: number; destructionPercentage: number }[];
}

interface WarSides {
  attacksPerMember: number;
  clan: { members: WarMember[] };
  opponent: { members: WarMember[] };
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** The war in progress of the main clan, when its key is `warKey`; `null` otherwise or when it cannot be read. */
async function currentWar(warKey: string): Promise<WarSides | null> {
  const clanTag = env().CLAN_TAG;
  if (!clanTag) return null;
  try {
    const war = await cachedRead(`currentwar:${clanTag}`, CURRENT_WAR_TTL_MS, async () => {
      const raw = await fetchCurrentWar(clanTag);
      // Not in a war (`notInWar`): nothing to show.
      const parsed = cocWarSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    });
    return war && buildWarKey(war.preparationStartTime, war.opponent.tag) === warKey ? war : null;
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    return null;
  }
}

export function participantRows(war: WarSides): ParticipantRow[] {
  const defenders = new Map(war.opponent.members.map((m) => [m.tag, m]));
  return war.clan.members.map((p) => {
    const attacks = p.attacks ?? [];
    return {
      tag: p.tag,
      name: p.name,
      mapPosition: p.mapPosition,
      townHall: p.townhallLevel,
      attacksUsed: attacks.length,
      attacksAvailable: war.attacksPerMember,
      stars: attacks.reduce((sum, a) => sum + a.stars, 0),
      averageDestruction: attacks.length ? round(attacks.reduce((sum, a) => sum + a.destructionPercentage, 0) / attacks.length) : 0,
      hasAttacked: attacks.length > 0,
      targets: attacks.map((a) => {
        const defender = defenders.get(a.defenderTag);
        return {
          mapPosition: defender?.mapPosition ?? 0,
          name: defender?.name ?? a.defenderTag,
          townHall: defender?.townhallLevel ?? 0,
          stars: a.stars,
          destruction: a.destructionPercentage,
        };
      }),
    };
  });
}

/** `GET /wars/{warKey}/participants`: a page of the clan's players in a war; 404 for an unknown war. */
export async function listParticipants(warKey: string, query: TableQuery): Promise<ParticipantsPage> {
  const saved = await WarModel.findOne({ warKey }).select('state attacksPerMember clan.members opponent.members').lean();
  // A war not ended yet is read live: the saved copy follows it only every few minutes.
  const war = (saved?.state !== 'warEnded' ? await currentWar(warKey) : null) ?? saved;
  if (!war) throwException(404, MessageKey.WAR_NOT_FOUND);
  const rows = participantRows(war);
  return {
    ...queryTable(rows, PARTICIPANTS_TABLE, query),
    summary: { townHalls: [...new Set(rows.map((r) => r.townHall))].sort((a, b) => b - a) },
  };
}
