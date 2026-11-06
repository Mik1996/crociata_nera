import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { WAR_STATE_RANK, WarDocument, WarModel } from './war.model';
import { CocWar, ListWarsQuery } from './wars.schemas';

export type SaveOutcome = 'created' | 'updated' | 'unchanged';
export type WarResult = 'win' | 'lose' | 'tie';

/** Compact view used in the war list (no members). */
export interface WarSummary {
  warKey: string;
  clanTag: string;
  state: string;
  result: WarResult | null;
  teamSize: number;
  attacksPerMember: number;
  battleModifier: string;
  preparationStartTime: string;
  startTime: string;
  endTime: string;
  endedAt: string | null;
  finalizedFrom: string | null;
  warLogMatched: boolean;
  clan: SideSummary;
  opponent: SideSummary;
  lastSyncedAt: string;
}

interface SideSummary {
  tag: string;
  name: string;
  clanLevel: number;
  badgeUrl: string | null;
  stars: number;
  destructionPercentage: number;
  attacks: number;
  expEarned: number | null;
}

export interface WarDetail extends Omit<WarSummary, 'clan' | 'opponent'> {
  clan: WarDocument['clan'];
  opponent: WarDocument['opponent'];
  createdAt: string;
}

export interface WarPage {
  items: WarSummary[];
  total: number;
  page: number;
  limit: number;
}

/** `20261104T100000-ABC123`: preparation start (UTC) + opponent tag, as the proxy archive. */
export function buildWarKey(preparationStartTime: Date, opponentTag: string): string {
  const date = preparationStartTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `${date}-${opponentTag.replace('#', '')}`;
}

/** Winner by stars, then by destruction (the game's rule). */
export function computeResult(
  clan: { stars: number; destructionPercentage: number },
  opponent: { stars: number; destructionPercentage: number },
): WarResult {
  if (clan.stars !== opponent.stars) return clan.stars > opponent.stars ? 'win' : 'lose';
  if (clan.destructionPercentage !== opponent.destructionPercentage) {
    return clan.destructionPercentage > opponent.destructionPercentage ? 'win' : 'lose';
  }
  return 'tie';
}

/**
 * Creates or updates a war from a `currentwar` snapshot (idempotent, keyed by `warKey`).
 * A snapshot is applied only if its state is not older than the stored one.
 */
export async function upsertWarSnapshot(
  war: CocWar,
  now = new Date(),
): Promise<{ outcome: SaveOutcome; war: WarDocument }> {
  const warKey = buildWarKey(war.preparationStartTime, war.opponent.tag);
  const stateRank = WAR_STATE_RANK[war.state];
  const ended = war.state === 'warEnded';

  try {
    const response = await WarModel.findOneAndUpdate(
      { warKey, stateRank: { $lte: stateRank } },
      {
        $set: {
          clanTag: war.clan.tag,
          state: war.state,
          stateRank,
          teamSize: war.teamSize,
          attacksPerMember: war.attacksPerMember,
          battleModifier: war.battleModifier,
          preparationStartTime: war.preparationStartTime,
          startTime: war.startTime,
          endTime: war.endTime,
          result: ended ? computeResult(war.clan, war.opponent) : null,
          clan: toSide(war.clan),
          opponent: toSide(war.opponent),
          lastSyncedAt: now,
          ...(ended ? { finalizedFrom: 'currentWar', endedAt: war.endTime } : {}),
        },
      },
      { upsert: true, new: true, runValidators: true, includeResultMetadata: true },
    );
    return { outcome: response.lastErrorObject?.updatedExisting ? 'updated' : 'created', war: response.value! };
  } catch (error) {
    // Stored war already in a later state: the filter did not match and the upsert hit the
    // unique `warKey` index. Keep the stored war.
    if ((error as { code?: number })?.code === 11000) {
      const existing = await WarModel.findOne({ warKey });
      if (existing) return { outcome: 'unchanged', war: existing };
    }
    throw error;
  }
}

export async function listWars(query: ListWarsQuery): Promise<WarPage> {
  const filter: Record<string, unknown> = {};
  const clanTag = env().CLAN_TAG;
  if (clanTag) filter.clanTag = clanTag;
  if (query.state) filter.state = query.state;

  const [docs, total] = await Promise.all([
    WarModel.find(filter)
      .select('-clan.members -opponent.members')
      .sort({ preparationStartTime: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    WarModel.countDocuments(filter),
  ]);
  return { items: docs.map(toSummary), total, page: query.page, limit: query.limit };
}

export async function getWar(warKey: string): Promise<WarDetail> {
  const war = await WarModel.findOne({ warKey });
  if (!war) throwException(404, MessageKey.WAR_NOT_FOUND);
  const { clan: _c, opponent: _o, ...summary } = toSummary(war);
  const plain = war.toObject();
  return { ...summary, clan: plain.clan, opponent: plain.opponent, createdAt: war.createdAt.toISOString() };
}

function toSide(side: CocWar['clan']) {
  return {
    tag: side.tag,
    name: side.name,
    clanLevel: side.clanLevel,
    badgeUrl: side.badgeUrls?.large ?? side.badgeUrls?.medium ?? side.badgeUrls?.small ?? null,
    attacks: side.attacks,
    stars: side.stars,
    destructionPercentage: side.destructionPercentage,
    expEarned: side.expEarned ?? null,
    members: side.members.map((member) => ({
      ...member,
      attacks: member.attacks ?? [],
      bestOpponentAttack: member.bestOpponentAttack ?? null,
    })),
  };
}

export function toSummary(war: WarDocument): WarSummary {
  const side = (s: WarDocument['clan']): SideSummary => ({
    tag: s.tag,
    name: s.name,
    clanLevel: s.clanLevel,
    badgeUrl: s.badgeUrl ?? null,
    stars: s.stars,
    destructionPercentage: s.destructionPercentage,
    attacks: s.attacks ?? 0,
    expEarned: s.expEarned ?? null,
  });
  return {
    warKey: war.warKey,
    clanTag: war.clanTag,
    state: war.state,
    result: (war.result as WarResult | null) ?? null,
    teamSize: war.teamSize,
    attacksPerMember: war.attacksPerMember,
    battleModifier: war.battleModifier ?? 'none',
    preparationStartTime: war.preparationStartTime.toISOString(),
    startTime: war.startTime.toISOString(),
    endTime: war.endTime.toISOString(),
    endedAt: war.endedAt?.toISOString() ?? null,
    finalizedFrom: war.finalizedFrom ?? null,
    warLogMatched: war.warLogMatched ?? false,
    clan: side(war.clan),
    opponent: side(war.opponent),
    lastSyncedAt: war.lastSyncedAt.toISOString(),
  };
}
