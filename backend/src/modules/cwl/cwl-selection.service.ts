import { crusadeClanTags, periodSuffix } from '@/lib/coc/crusade-clans';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { UserModel } from '@/modules/auth/user.model';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import { CommendationTier } from '@/modules/commendations/commendation-rules';
import { PlayerModel } from '@/modules/commendations/player.model';
import { toHistoryWar } from '@/modules/wars/history.service';
import { WarModel } from '@/modules/wars/war.model';
import { CwlExclusionModel } from './cwl-exclusion.model';
import {
  Exclusion,
  LastCwl,
  rankCandidates,
  RESERVES,
  SelectionCandidate,
  SelectionRow,
  STARTERS,
  TOWN_HALL_GAP,
  WAR_WINDOW_DAYS,
  WarTotals,
} from './cwl-selection.rules';
import { CwlSeasonModel } from './cwl.model';

export interface CwlSelection {
  generatedAt: string;
  starters: number;
  reserves: number;
  /** Highest town hall of the clan; `null` without members. */
  maxTownHall: number | null;
  /** Lowest eligible town hall; `null` without members. */
  minEligibleTownHall: number | null;
  /** Last ended CWL season of the clans of the Crusade (`YYYY-MM`); `null` if none was saved. */
  cwlSeason: string | null;
  /** Regular wars counted (of every clan of the Crusade): those ended since `from`. */
  warWindow: { from: string; days: number; wars: number };
  players: SelectionRow[];
}

const DAY_MS = 86_400_000;
const NO_WAR: WarTotals = { wars: 0, attacksUsed: 0, attacksAvailable: 0, stars: 0, totalDestruction: 0 };

/** Ranking of the current members of the main clan for the Clan War League line-up. */
export async function getCwlSelection(now = new Date()): Promise<CwlSelection> {
  const from = new Date(now.getTime() - WAR_WINDOW_DAYS * DAY_MS);
  const primary = env().CLAN_TAG ?? null;
  const [members, lastCwl, wars, exclusions] = await Promise.all([
    // Players saved before the clan was tracked (`clanTag: null`) are the main clan's.
    PlayerModel.find({ inClan: true, clanTag: { $in: [primary, null] } })
      .select('tag name role townHallLevel joinedAt heroes equipment')
      .lean(),
    lastCwlSeason(),
    regularWarStats(from),
    CwlExclusionModel.find().lean(),
  ]);
  const excluded = new Map(exclusions.map((e) => [e.playerTag, e]));

  // Highest level of each hero, from the game (`maxLevel`), as seen on any member's profile.
  const heroMaxLevels = new Map<string, number>();
  for (const m of members) {
    for (const h of m.heroes ?? []) heroMaxLevels.set(h.name, Math.max(heroMaxLevels.get(h.name) ?? 0, h.maxLevel));
  }

  const candidates: SelectionCandidate[] = members.map((m) => {
    const exclusion = excluded.get(m.tag);
    return {
      tag: m.tag,
      name: m.name,
      role: m.role ?? null,
      townHallLevel: m.townHallLevel ?? null,
      war: wars.byTag.get(m.tag) ?? NO_WAR,
      cwl: lastCwl.players.get(m.tag) ?? null,
      heroes: m.heroes ?? null,
      equipment: m.equipment ?? null,
      joinedAt: m.joinedAt ?? null,
      exclusion: exclusion ? toExclusion(exclusion) : null,
    };
  });
  const { maxTownHall, rows } = rankCandidates(candidates, { now, heroMaxLevels });
  return {
    generatedAt: now.toISOString(),
    starters: STARTERS,
    reserves: RESERVES,
    maxTownHall,
    minEligibleTownHall: maxTownHall === null ? null : maxTownHall - TOWN_HALL_GAP,
    cwlSeason: lastCwl.season,
    warWindow: { from: from.toISOString(), days: WAR_WINDOW_DAYS, wars: wars.wars },
    players: rows,
  };
}

/**
 * Excludes a current member from the CWL line-up (administrators). Excluding again updates the
 * reason. 404 for a player that is not in the clan.
 */
export async function excludePlayer(tag: string, reason: string | null, adminId: string): Promise<Exclusion & { tag: string }> {
  const playerTag = tag.toUpperCase();
  const clan = { $in: [env().CLAN_TAG ?? null, null] };
  if (!(await PlayerModel.exists({ tag: playerTag, inClan: true, clanTag: clan }))) throwException(404, MessageKey.PLAYER_NOT_FOUND);
  const admin = await UserModel.findById(adminId).select('username').lean();
  const saved = await CwlExclusionModel.findOneAndUpdate(
    { playerTag },
    { $set: { reason: reason || null, excludedBy: admin?.username ?? '?', excludedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return { tag: playerTag, ...toExclusion(saved!) };
}

/** Takes a player back into the CWL line-up (administrators); nothing to do if not excluded. */
export async function readmitPlayer(tag: string): Promise<void> {
  await CwlExclusionModel.deleteOne({ playerTag: tag.toUpperCase() });
}

function toExclusion(e: { reason?: string | null; excludedBy: string; excludedAt: Date }): Exclusion {
  return { reason: e.reason ?? null, excludedBy: e.excludedBy, excludedAt: e.excludedAt.toISOString() };
}

interface LeagueWarMember {
  tag: string;
  attacks?: { stars: number; destructionPercentage: number }[];
}
interface LeagueWar {
  state?: string;
  clan?: { tag: string; members?: LeagueWarMember[] };
  opponent?: { tag: string; members?: LeagueWarMember[] };
}

/**
 * The last ended CWL season of the clans of the Crusade and, per player, the clan they fought it
 * with, their ended league wars in the line-up, attacks, stars, destruction and commendations.
 */
async function lastCwlSeason(): Promise<{ season: string | null; players: Map<string, LastCwl> }> {
  const clans = crusadeClanTags();
  const latest = await CwlSeasonModel.findOne({ clanTag: { $in: clans }, state: 'ended' })
    .sort({ season: -1 })
    .select('season')
    .lean();
  const players = new Map<string, LastCwl>();
  if (!latest) return { season: null, players };

  const docs = await CwlSeasonModel.find({ clanTag: { $in: clans }, season: latest.season, state: 'ended' }).lean();
  for (const doc of docs) {
    for (const { war } of doc.wars) {
      const w = war as LeagueWar;
      if (w.state !== 'warEnded') continue;
      const side = w.clan?.tag === doc.clanTag ? w.clan : w.opponent?.tag === doc.clanTag ? w.opponent : null;
      for (const m of side?.members ?? []) {
        const t = players.get(m.tag) ?? {
          clanTag: doc.clanTag,
          wars: 0,
          attacks: 0,
          stars: 0,
          totalDestruction: 0,
          allAttacks: false,
          striker: null,
        };
        t.wars += 1;
        for (const a of m.attacks ?? []) {
          t.attacks += 1;
          t.stars += a.stars;
          t.totalDestruction += a.destructionPercentage;
        }
        players.set(m.tag, t);
      }
    }
  }

  // Commendations of that season, in whichever clan they were awarded (`cwl:<season>[@<tag>]`).
  const awards = await CommendationAwardModel.find({
    periodKey: { $in: clans.map((tag) => `cwl:${latest.season}${periodSuffix(tag)}`) },
    type: { $in: ['cwlAllAttacks', 'cwlStriker'] },
  })
    .select('playerTag type tier')
    .lean();
  for (const award of awards) {
    const entry = players.get(award.playerTag);
    if (!entry) continue;
    if (award.type === 'cwlAllAttacks') entry.allAttacks = true;
    else entry.striker = award.tier as CommendationTier;
  }
  return { season: latest.season, players };
}

/** Attacks of each player in the regular wars of the clans of the Crusade ended since `from`. */
async function regularWarStats(from: Date): Promise<{ wars: number; byTag: Map<string, WarTotals> }> {
  const docs = await WarModel.find({ state: 'warEnded', endTime: { $gte: from }, clanTag: { $in: crusadeClanTags() } });
  const wars = docs.map(toHistoryWar).filter((w) => w !== null);
  const byTag = new Map<string, WarTotals>();
  for (const war of wars) {
    for (const p of war.players) {
      const t = byTag.get(p.tag) ?? { ...NO_WAR };
      t.wars += 1;
      t.attacksAvailable += p.attacksAvailable;
      t.attacksUsed += p.attacks.length;
      for (const a of p.attacks) {
        t.stars += a.stars;
        t.totalDestruction += a.destruction;
      }
      byTag.set(p.tag, t);
    }
  }
  return { wars: wars.length, byTag };
}
