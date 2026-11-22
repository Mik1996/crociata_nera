import { crusadeClanTags, periodSuffix, primaryClanTag } from '@/lib/coc/crusade-clans';
import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { UserModel } from '@/modules/auth/user.model';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import { CommendationTier } from '@/modules/commendations/commendation-rules';
import { PlayerModel } from '@/modules/commendations/player.model';
import { toHistoryWar } from '@/modules/wars/history.service';
import { WarModel } from '@/modules/wars/war.model';
import { createLineupDraft, dropLineupDrafts } from '@/modules/announcements/announcement-drafts.service';
import { CwlExclusionModel } from './cwl-exclusion.model';
import { CwlSelectionModel, SelectionState } from './cwl-selection.model';
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

/** The ranking for the line-up, live (open selection) or frozen at the closing. */
export interface CwlRanking {
  generatedAt: string;
  starters: number;
  reserves: number;
  /** Highest town hall of the clans of the Crusade; `null` without members. */
  maxTownHall: number | null;
  /** Lowest eligible town hall; `null` without members. */
  minEligibleTownHall: number | null;
  /** Last ended CWL season of the clans of the Crusade (`YYYY-MM`); `null` if none was saved. */
  cwlSeason: string | null;
  /** Regular wars counted (of every clan of the Crusade): those ended since `from`. */
  warWindow: { from: string; days: number; wars: number };
  players: SelectionRow[];
}

/** The selection of a season: its ranking, whether it is closed, and the other seasons. */
export interface CwlSelection extends CwlRanking {
  /** Season of the CWL the selection is for (`YYYY-MM`). */
  season: string;
  state: SelectionState;
  /** First day of the season (UTC): the CWL sign-ups open then, the selection should be closed by it. */
  signupStart: string;
  closedAt: string | null;
  /** Username of the administrator who closed it; `null` while open or when closed automatically. */
  closedBy: string | null;
  closedAutomatically: boolean;
  /** Closed, its CWL not started yet and no later season closed: an administrator can open it again. */
  canReopen: boolean;
  /** Every selection, most recent first. */
  seasons: { season: string; state: SelectionState }[];
}

const DAY_MS = 86_400_000;
const NO_WAR: WarTotals = { wars: 0, attacksUsed: 0, attacksAvailable: 0, stars: 0, totalDestruction: 0 };

/** Current members of the clans of the Crusade; those saved before the clan was tracked (`clanTag: null`) are the main clan's. */
function crusadeMemberFilter() {
  return { inClan: true, clanTag: { $in: [...crusadeClanTags(), null] } };
}

/**
 * Live ranking of the current members of every clan of the Crusade for the line-up of a season's
 * Clan War League (exclusions of that season and those until revoked).
 */
export async function computeRanking(season: string, now = new Date()): Promise<CwlRanking> {
  const from = new Date(now.getTime() - WAR_WINDOW_DAYS * DAY_MS);
  // The main clan comes first.
  const primary = crusadeClanTags()[0]!;
  const [members, lastCwl, wars, exclusions] = await Promise.all([
    PlayerModel.find(crusadeMemberFilter())
      .select('tag name clanTag role league townHallLevel joinedAt heroes equipment')
      .lean(),
    lastCwlSeason(),
    regularWarStats(from),
    CwlExclusionModel.find({ season: { $in: [season, null] } }).lean(),
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
      clanTag: m.clanTag ?? primary,
      role: m.role ?? null,
      league: m.league?.id && m.league.name ? { id: m.league.id, name: m.league.name, iconUrl: m.league.iconUrl ?? null } : null,
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
 * Excludes a current member of the clans of the Crusade from the line-up of the open selection, or
 * from every season until revoked (administrators). Excluding again updates the reason and the
 * duration. 404 for a player that is not in any of them.
 */
export async function excludePlayer(
  tag: string,
  options: { reason: string | null; untilRevoked: boolean },
  adminId: string,
  now = new Date(),
): Promise<Exclusion & { tag: string }> {
  const playerTag = tag.toUpperCase();
  if (!(await PlayerModel.exists({ tag: playerTag, ...crusadeMemberFilter() }))) throwException(404, MessageKey.PLAYER_NOT_FOUND);
  const season = await ensureOpenSelection(now);
  const admin = await UserModel.findById(adminId).select('username').lean();
  const kept = options.untilRevoked ? null : season;
  const saved = await CwlExclusionModel.findOneAndUpdate(
    { playerTag, season: kept },
    { $set: { reason: options.reason || null, excludedBy: admin?.username ?? '?', excludedAt: now } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  // One exclusion per player: the other duration goes.
  await CwlExclusionModel.deleteOne({ playerTag, season: options.untilRevoked ? season : null });
  return { tag: playerTag, ...toExclusion(saved!) };
}

/** Takes a player back into the line-up of the open selection and the next ones (administrators). */
export async function readmitPlayer(tag: string, now = new Date()): Promise<void> {
  const season = await ensureOpenSelection(now);
  await CwlExclusionModel.deleteMany({ playerTag: tag.toUpperCase(), season: { $in: [season, null] } });
}

function toExclusion(e: { reason?: string | null; season?: string | null; excludedBy: string; excludedAt: Date }): Exclusion {
  return { reason: e.reason ?? null, untilRevoked: !e.season, excludedBy: e.excludedBy, excludedAt: e.excludedAt.toISOString() };
}

// --- seasons of the selection ------------------------------------------------

/** `2026-11` of a moment (UTC). */
export function seasonOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** The season after `season` (`2026-12` -> `2027-01`). */
export function nextSeason(season: string): string {
  const [year = 0, month = 1] = season.split('-').map(Number);
  return seasonOf(new Date(Date.UTC(year, month, 1)));
}

/** The CWL of a season started: the main clan's group of that season was saved. */
async function cwlStarted(season: string): Promise<boolean> {
  const clanTag = primaryClanTag();
  return !!clanTag && !!(await CwlSeasonModel.exists({ clanTag, season }));
}

/**
 * The season of the open selection, created when missing: the first season from the current month
 * whose CWL has not started and whose selection was not closed. An open selection left behind (its
 * CWL never came: the clan did not sign up) is dropped. Returns the season.
 */
export async function ensureOpenSelection(now = new Date()): Promise<string> {
  let season = seasonOf(now);
  for (let i = 0; i < 24; i++) {
    const doc = await CwlSelectionModel.findOne({ season }).select('state').lean();
    if (doc?.state === SelectionState.OPEN) break;
    if (!doc && !(await cwlStarted(season))) break;
    season = nextSeason(season);
  }
  await CwlSelectionModel.updateOne({ season }, { $setOnInsert: { season, state: SelectionState.OPEN } }, { upsert: true });
  await CwlSelectionModel.deleteMany({ state: SelectionState.OPEN, season: { $lt: season } });
  return season;
}

/**
 * Closes the open selection of `season`: the ranking of now is frozen, the draft of the line-up
 * announcement is prepared and the next season opens. `adminId` `null`: closed by the scheduler.
 * 404 for an unknown season, 409 when it is not open.
 */
export async function closeSelection(season: string, adminId: string | null, now = new Date()): Promise<CwlSelection> {
  await ensureOpenSelection(now);
  const doc = await CwlSelectionModel.findOne({ season }).select('state').lean();
  if (!doc) throwException(404, MessageKey.CWL_SELECTION_NOT_FOUND);
  if (doc.state !== SelectionState.OPEN) throwException(409, MessageKey.CWL_SELECTION_NOT_OPEN);
  const ranking = await computeRanking(season, now);
  const admin = adminId ? await UserModel.findById(adminId).select('username').lean() : null;
  const closed = await CwlSelectionModel.findOneAndUpdate(
    { season, state: SelectionState.OPEN },
    {
      $set: {
        state: SelectionState.CLOSED,
        closedAt: now,
        closedBy: adminId ? (admin?.username ?? '?') : null,
        closedAutomatically: !adminId,
        ranking,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  // Closed meanwhile by someone else.
  if (!closed) throwException(409, MessageKey.CWL_SELECTION_NOT_OPEN);
  try {
    await createLineupDraft(season, ranking.players, now);
  } catch (error) {
    console.error(`[cwl-selection] draft of the ${season} line-up not prepared:`, error);
  }
  await ensureOpenSelection(now);
  return getCwlSelection(season, now);
}

/**
 * Opens a closed selection again (administrators), while its CWL has not started and no later
 * season was closed: the frozen ranking goes, the next season's selection waits (its exclusions are
 * kept), the line-up drafts not published yet are dropped.
 */
export async function reopenSelection(season: string, now = new Date()): Promise<CwlSelection> {
  const doc = await CwlSelectionModel.findOne({ season }).lean();
  if (!doc) throwException(404, MessageKey.CWL_SELECTION_NOT_FOUND);
  if (doc.state !== SelectionState.CLOSED) throwException(409, MessageKey.CWL_SELECTION_NOT_CLOSED);
  if (!(await canReopen(season))) throwException(409, MessageKey.CWL_SELECTION_CANNOT_REOPEN);
  await CwlSelectionModel.updateOne(
    { season, state: SelectionState.CLOSED },
    { $set: { state: SelectionState.OPEN, closedAt: null, closedBy: null, closedAutomatically: false, ranking: null } },
  );
  await CwlSelectionModel.deleteMany({ state: SelectionState.OPEN, season: { $gt: season } });
  await dropLineupDrafts(season);
  return getCwlSelection(season, now);
}

async function canReopen(season: string): Promise<boolean> {
  if (await cwlStarted(season)) return false;
  return !(await CwlSelectionModel.exists({ state: SelectionState.CLOSED, season: { $gt: season } }));
}

/**
 * Scheduler: closes the open selection whose CWL started (its group was saved) and makes sure a
 * selection is open. Returns the seasons closed.
 */
export async function syncCwlSelections(now = new Date()): Promise<string[]> {
  const closed: string[] = [];
  for (const doc of await CwlSelectionModel.find({ state: SelectionState.OPEN }).select('season').lean()) {
    if (!(await cwlStarted(doc.season))) continue;
    try {
      await closeSelection(doc.season, null, now);
      closed.push(doc.season);
    } catch (error) {
      // Closed meanwhile by an administrator.
      if (!(error instanceof ApiError && error.statusCode === 409)) throw error;
    }
  }
  await ensureOpenSelection(now);
  return closed;
}

/**
 * The selection of a season (the open one by default): live while open, frozen once closed.
 * 404 for a season without a selection.
 */
export async function getCwlSelection(season?: string, now = new Date()): Promise<CwlSelection> {
  const open = await ensureOpenSelection(now);
  const wanted = season ?? open;
  const doc = await CwlSelectionModel.findOne({ season: wanted }).lean();
  if (!doc) throwException(404, MessageKey.CWL_SELECTION_NOT_FOUND);
  const closed = doc.state === SelectionState.CLOSED && doc.ranking;
  const ranking = closed ? (doc.ranking as CwlRanking) : await computeRanking(wanted, now);
  const seasons = await CwlSelectionModel.find().select('season state').sort({ season: -1 }).lean();
  const [year = 0, month = 1] = wanted.split('-').map(Number);
  return {
    ...ranking,
    season: wanted,
    state: closed ? SelectionState.CLOSED : SelectionState.OPEN,
    signupStart: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    closedAt: closed ? (doc.closedAt?.toISOString() ?? null) : null,
    closedBy: closed ? (doc.closedBy ?? null) : null,
    closedAutomatically: closed ? !!doc.closedAutomatically : false,
    canReopen: closed ? await canReopen(wanted) : false,
    seasons: seasons.map((s) => ({ season: s.season, state: s.state as SelectionState })),
  };
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
