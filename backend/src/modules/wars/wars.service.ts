import { Types } from 'mongoose';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { WAR_STATE_RANK, WarDocument, WarModel } from './war.model';
import { ListWarsQuery, SaveWarInput } from './wars.schemas';

export type SaveOutcome = 'created' | 'updated' | 'unchanged';

/** Compact view used in lists and as the response of a save. */
export interface WarSummary {
  warKey: string;
  clanTag: string;
  state: string;
  result: string | null;
  teamSize: number;
  attacksPerMember: number;
  preparationStartTime: string;
  startTime: string;
  endTime: string;
  clan: SideSummary;
  opponent: SideSummary;
  updatedAt: string;
}

interface SideSummary {
  tag: string;
  name: string;
  badgeUrl: string | null;
  stars: number;
  destructionPercentage: number;
  attacks: number;
}

export interface WarDetail extends Omit<WarSummary, 'clan' | 'opponent'> {
  battleModifier: string;
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

export function warResult(war: SaveWarInput): 'win' | 'lose' | 'tie' | null {
  if (war.state !== 'warEnded') return null;
  const { clan, opponent } = war;
  if (clan.stars !== opponent.stars) return clan.stars > opponent.stars ? 'win' : 'lose';
  if (clan.destructionPercentage !== opponent.destructionPercentage) {
    return clan.destructionPercentage > opponent.destructionPercentage ? 'win' : 'lose';
  }
  return 'tie';
}

/**
 * Creates or updates a war (idempotent upsert keyed by `warKey`). The frontend sends wars
 * automatically, so the same war arrives many times: a snapshot is applied only if its
 * state is not older than the stored one (an ended war is never overwritten by `inWar`).
 */
export async function saveWar(input: SaveWarInput, userId: string): Promise<{ outcome: SaveOutcome; war: WarSummary }> {
  const allowedClan = env().CLAN_TAG;
  if (allowedClan && input.clan.tag !== allowedClan) throwException(422, MessageKey.WAR_CLAN_NOT_ALLOWED);

  const warKey = buildWarKey(input.preparationStartTime, input.opponent.tag);
  const stateRank = WAR_STATE_RANK[input.state];
  const savedBy = new Types.ObjectId(userId);

  try {
    const response = await WarModel.findOneAndUpdate(
      { warKey, stateRank: { $lte: stateRank } },
      {
        $set: {
          clanTag: input.clan.tag,
          state: input.state,
          stateRank,
          teamSize: input.teamSize,
          attacksPerMember: input.attacksPerMember,
          battleModifier: input.battleModifier,
          preparationStartTime: input.preparationStartTime,
          startTime: input.startTime,
          endTime: input.endTime,
          result: warResult(input),
          clan: toSide(input.clan),
          opponent: toSide(input.opponent),
          lastSavedBy: savedBy,
        },
        $setOnInsert: { firstSavedBy: savedBy },
      },
      { upsert: true, new: true, runValidators: true, includeResultMetadata: true },
    );
    const war = response.value!;
    return { outcome: response.lastErrorObject?.updatedExisting ? 'updated' : 'created', war: toSummary(war) };
  } catch (error) {
    // The filter did not match because the stored war is in a later state; the upsert
    // then hit the unique `warKey` index. Keep the stored war.
    if ((error as { code?: number })?.code === 11000) {
      const existing = await WarModel.findOne({ warKey });
      if (existing) return { outcome: 'unchanged', war: toSummary(existing) };
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
  return {
    ...summary,
    battleModifier: war.battleModifier ?? 'none',
    clan: war.toObject().clan,
    opponent: war.toObject().opponent,
    createdAt: war.createdAt.toISOString(),
  };
}

function toSide(side: SaveWarInput['clan']) {
  return {
    tag: side.tag,
    name: side.name,
    clanLevel: side.clanLevel,
    badgeUrl: side.badgeUrls?.large ?? side.badgeUrls?.medium ?? side.badgeUrls?.small ?? null,
    attacks: side.attacks,
    stars: side.stars,
    destructionPercentage: side.destructionPercentage,
    members: side.members.map((member) => ({
      ...member,
      attacks: member.attacks ?? [],
      bestOpponentAttack: member.bestOpponentAttack ?? null,
    })),
  };
}

function toSummary(war: WarDocument): WarSummary {
  const side = (s: WarDocument['clan']): SideSummary => ({
    tag: s.tag,
    name: s.name,
    badgeUrl: s.badgeUrl ?? null,
    stars: s.stars,
    destructionPercentage: s.destructionPercentage,
    attacks: s.attacks ?? 0,
  });
  return {
    warKey: war.warKey,
    clanTag: war.clanTag,
    state: war.state,
    result: war.result ?? null,
    teamSize: war.teamSize,
    attacksPerMember: war.attacksPerMember,
    preparationStartTime: war.preparationStartTime.toISOString(),
    startTime: war.startTime.toISOString(),
    endTime: war.endTime.toISOString(),
    clan: side(war.clan),
    opponent: side(war.opponent),
    updatedAt: war.updatedAt.toISOString(),
  };
}
