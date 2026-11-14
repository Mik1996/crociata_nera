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
  CWL_SEASONS,
  CwlSeasonTotals,
  Exclusion,
  INACTIVE_DAYS,
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
  /** Ended CWL seasons whose commendations and wars count, most recent first. */
  seasons: string[];
  /** Regular wars counted: those ended since `from`. */
  warWindow: { from: string; days: number; wars: number };
  players: SelectionRow[];
}

const DAY_MS = 86_400_000;
const CWL_PERIOD_PREFIX = 'cwl:';
const NO_WAR: WarTotals = { wars: 0, attacksUsed: 0, attacksAvailable: 0, stars: 0, totalDestruction: 0 };
const NO_CWL_WARS: CwlSeasonTotals = { wars: 0, attacks: 0, stars: 0, totalDestruction: 0 };

/** Ranking of the current members of the clan for the Clan War League line-up. */
export async function getCwlSelection(now = new Date()): Promise<CwlSelection> {
  const from = new Date(now.getTime() - WAR_WINDOW_DAYS * DAY_MS);
  const recentFrom = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS);
  const [members, cwlSeasons, wars, exclusions] = await Promise.all([
    PlayerModel.find({ inClan: true }).select('tag name role townHallLevel joinedAt heroes equipment').lean(),
    endedCwlSeasons(),
    regularWarStats(from, recentFrom),
    CwlExclusionModel.find().lean(),
  ]);
  const seasons = cwlSeasons.map((s) => s.season);
  const commendations = await cwlCommendations(seasons);
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
      recentAttacks: wars.recentAttacks.get(m.tag) ?? 0,
      cwl: seasons.map((season) => commendations.get(`${season}|${m.tag}`) ?? { allAttacks: false, striker: null }),
      cwlWars: cwlSeasons.map((s) => s.players.get(m.tag) ?? NO_CWL_WARS),
      heroes: m.heroes ?? null,
      equipment: m.equipment ?? null,
      joinedAt: m.joinedAt ?? null,
      exclusion: exclusion ? toExclusion(exclusion) : null,
    };
  });
  const { maxTownHall, rows } = rankCandidates(candidates, {
    now,
    recentClanWars: wars.recentClanWars,
    heroMaxLevels,
  });
  return {
    generatedAt: now.toISOString(),
    starters: STARTERS,
    reserves: RESERVES,
    maxTownHall,
    minEligibleTownHall: maxTownHall === null ? null : maxTownHall - TOWN_HALL_GAP,
    seasons,
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
  if (!(await PlayerModel.exists({ tag: playerTag, inClan: true }))) throwException(404, MessageKey.PLAYER_NOT_FOUND);
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
 * The last ended CWL seasons of the clan (most recent first) with, per player, the ended league
 * wars in the line-up, attacks done, stars and destruction.
 */
async function endedCwlSeasons(): Promise<{ season: string; players: Map<string, CwlSeasonTotals> }[]> {
  const clanTag = env().CLAN_TAG;
  const docs = await CwlSeasonModel.find({ state: 'ended', ...(clanTag ? { clanTag } : {}) })
    .sort({ season: -1 })
    .limit(CWL_SEASONS)
    .lean();
  return docs.map((doc) => {
    const players = new Map<string, CwlSeasonTotals>();
    for (const { war } of doc.wars) {
      const w = war as LeagueWar;
      if (w.state !== 'warEnded') continue;
      const side = w.clan?.tag === doc.clanTag ? w.clan : w.opponent?.tag === doc.clanTag ? w.opponent : null;
      for (const m of side?.members ?? []) {
        const t = players.get(m.tag) ?? { ...NO_CWL_WARS };
        t.wars += 1;
        for (const a of m.attacks ?? []) {
          t.attacks += 1;
          t.stars += a.stars;
          t.totalDestruction += a.destructionPercentage;
        }
        players.set(m.tag, t);
      }
    }
    return { season: doc.season, players };
  });
}

/** CWL commendations of the given seasons, keyed by `<season>|<player tag>`. */
async function cwlCommendations(seasons: string[]): Promise<Map<string, SelectionCandidate['cwl'][number]>> {
  const awards = await CommendationAwardModel.find({
    periodKey: { $in: seasons.map((s) => CWL_PERIOD_PREFIX + s) },
    type: { $in: ['cwlAllAttacks', 'cwlStriker'] },
  })
    .select('periodKey playerTag type tier')
    .lean();
  const result = new Map<string, SelectionCandidate['cwl'][number]>();
  for (const award of awards) {
    const key = `${award.periodKey.slice(CWL_PERIOD_PREFIX.length)}|${award.playerTag}`;
    const entry = result.get(key) ?? { allAttacks: false, striker: null };
    if (award.type === 'cwlAllAttacks') entry.allAttacks = true;
    else entry.striker = award.tier as CommendationTier;
    result.set(key, entry);
  }
  return result;
}

/**
 * Attacks of each player in the regular wars of the clan ended since `from`, and those since
 * `recentFrom` (activity).
 */
async function regularWarStats(
  from: Date,
  recentFrom: Date,
): Promise<{ wars: number; byTag: Map<string, WarTotals>; recentClanWars: number; recentAttacks: Map<string, number> }> {
  const clanTag = env().CLAN_TAG;
  const docs = await WarModel.find({ state: 'warEnded', endTime: { $gte: from }, ...(clanTag ? { clanTag } : {}) });
  const wars = docs.map(toHistoryWar).filter((w) => w !== null);
  const byTag = new Map<string, WarTotals>();
  const recentAttacks = new Map<string, number>();
  let recentClanWars = 0;
  for (const war of wars) {
    const recent = new Date(war.endTime) >= recentFrom;
    if (recent) recentClanWars += 1;
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
      if (recent) recentAttacks.set(p.tag, (recentAttacks.get(p.tag) ?? 0) + p.attacks.length);
    }
  }
  return { wars: wars.length, byTag, recentClanWars, recentAttacks };
}
