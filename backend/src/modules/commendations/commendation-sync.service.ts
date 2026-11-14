import { z } from 'zod';
import { env } from '@/lib/config/env';
import { CocApiError, fetchClan } from '@/lib/coc/coc-client';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { DonationSeasonRecord, endedSeasons, ongoingSeason, recordDonations } from '@/modules/donations/donation.service';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { getPeriod, listMonths, monthOf } from '@/modules/wars/history.service';
import { CommendationAwardModel, CommendationPeriodModel } from './commendation-award.model';
import {
  awardCwlCommendations,
  awardDonationCommendations,
  awardMonthCommendations,
  awardRaidCommendations,
  Commendation,
  commendationId,
  commendationName,
  commendationOf,
  CommendationTier,
  CwlPlayerResult,
} from './commendation-rules';
import { PlayerModel } from './player.model';

export interface CommendationSyncReport {
  /** Current members whose Clash of Clans data was updated. */
  membersUpdated: number;
  /** Periods whose commendations were awarded in this run. */
  periodsProcessed: string[];
  awards: number;
  /** Read the members again just before the game season ends, to count the last donations. */
  nextCheckAt: string | null;
  error: { status: number; reason: string; message: string } | null;
}

/** A closed period with the commendations it awards (player tag -> commendations). */
interface ClosedPeriod {
  key: string;
  awards: Map<string, Commendation[]>;
  /** Player names, for players that are not current members anymore. */
  names: Map<string, string>;
}

const memberSchema = z
  .object({
    tag: z.string(),
    name: z.string(),
    role: z.string().optional(),
    townHallLevel: z.number().optional(),
    expLevel: z.number().optional(),
    donations: z.number().default(0),
    trophies: z.number().optional(),
    leagueTier: z
      .object({ id: z.number(), name: z.string(), iconUrls: z.object({ small: z.string().optional(), large: z.string().optional() }).optional() })
      .optional(),
  })
  .passthrough();
const clanSchema = z.object({ memberList: z.array(memberSchema).default([]) }).passthrough();

/** Last completed month in the Italian time zone (`YYYY-MM`). */
export function previousMonth(now: Date): string {
  const [year = 0, month = 1] = monthOf(now).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 1. Updates the Clash of Clans data of the current members (`Players`).
 * 2. Awards the commendations of every period closed since the last run (completed months,
 *    ended Raid Weekends with their members, ended CWL seasons), once: the period is then
 *    marked as processed and never recomputed, so the history survives rule changes.
 * 3. Awards `donor` during the game season, as soon as a tier is reached (raised later to the
 *    higher tiers); an ended season is frozen after one last pass.
 *
 * Safe to interrupt and to run twice: awards are unique per period, player and commendation,
 * the players' totals are recounted from the awards, and the period is marked last.
 */
export async function syncCommendations(now = new Date()): Promise<CommendationSyncReport> {
  const report: CommendationSyncReport = { membersUpdated: 0, periodsProcessed: [], awards: 0, nextCheckAt: null, error: null };
  const clanTag = env().CLAN_TAG;
  if (!clanTag) return report;

  try {
    const members = await syncMembers(now);
    report.membersUpdated = members.created.length + members.updated;
    report.nextCheckAt = members.nextCheckAt;
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    // The commendations do not depend on the API: keep going with the saved data.
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }

  await migrateToCatalogueIds();

  const processed = new Set((await CommendationPeriodModel.find().select('periodKey')).map((p) => p.periodKey));
  for (const period of await closedPeriods(now, processed)) {
    report.awards += await awardPeriod(period, now);
    report.periodsProcessed.push(period.key);
  }

  // `donor`: awarded during the season as soon as a tier is reached. An ended season gets one
  // last pass (the final read before its end may raise a tier), then it is frozen.
  for (const season of await endedSeasons(now)) {
    const key = donationPeriodKey(season.season);
    if (processed.has(key)) continue;
    report.awards += await awardDonorTiers(season, now);
    const awards = await CommendationAwardModel.countDocuments({ periodKey: key });
    await CommendationPeriodModel.updateOne(
      { periodKey: key },
      { $setOnInsert: { periodKey: key, awards, processedAt: now } },
      { upsert: true },
    );
    report.periodsProcessed.push(key);
  }
  const ongoing = await ongoingSeason(now);
  if (ongoing) report.awards += await awardDonorTiers(ongoing, now);
  return report;
}

/**
 * Awards saved in an earlier format, when the id was `<type>-<tier>`: given the catalogue id,
 * `type` and `tier`. Only the format changes, never the counts. No-op once done.
 */
async function migrateToCatalogueIds(): Promise<void> {
  const legacy = await CommendationAwardModel.find({ type: { $exists: false } }).lean();
  const tags = new Set<string>();
  for (const award of legacy) {
    const [type, tier] = award.commendationId.split('-') as [Commendation['type'], Commendation['tier']];
    const commendation = commendationOf(award.commendationId) ?? { type, tier };
    await CommendationAwardModel.updateOne(
      { _id: award._id },
      { $set: { commendationId: commendationId(commendation), type: commendation.type, tier: commendation.tier }, $unset: { name: '' } },
    );
    tags.add(award.playerTag);
  }
  const outdated = await PlayerModel.find({ commendations: { $elemMatch: { type: { $exists: false } } } }).select('tag name');
  for (const player of outdated) tags.add(player.tag);
  for (const tag of tags) {
    const player = await PlayerModel.findOne({ tag }).select('name');
    await recountPlayer(tag, player?.name ?? tag);
  }
}

/** Outcome of {@link syncMembers}. */
export interface MembersSyncResult {
  /** Members that were not in the database yet. */
  created: { tag: string; name: string }[];
  /** Members already saved, whose data was refreshed. */
  updated: number;
  /** Saved players no longer in the clan (marked `inClan: false`). */
  left: number;
  /** Last read of the donations before the game season ends (ISO 8601), if known. */
  nextCheckAt: string | null;
}

/**
 * Saves the current members of the clan in `Players`: creates the missing ones and refreshes the
 * Clash of Clans data of the others; players no longer listed are marked as gone. Also counts
 * the troops donated since the last read (`recordDonations`). Commendations are left untouched.
 * Throws {@link CocApiError} if the clan cannot be read.
 */
export async function syncMembers(now = new Date()): Promise<MembersSyncResult> {
  const clanTag = env().CLAN_TAG;
  if (!clanTag) throw new CocApiError(0, 'config.missingClanTag', 'CLAN_TAG is not set');
  const { memberList } = clanSchema.parse(await fetchClan(clanTag));
  const result: MembersSyncResult = { created: [], updated: 0, left: 0, nextCheckAt: null };
  // Members not in the clan at the last read have just joined (or come back).
  const known = new Set((await PlayerModel.find({ inClan: true }).select('tag').lean()).map((p) => p.tag));
  for (const m of memberList) {
    const write = await PlayerModel.updateOne(
      { tag: m.tag },
      {
        $set: {
          name: m.name,
          role: m.role ?? null,
          townHallLevel: m.townHallLevel ?? null,
          expLevel: m.expLevel ?? null,
          trophies: m.trophies ?? null,
          league: m.leagueTier
            ? { id: m.leagueTier.id, name: m.leagueTier.name, iconUrl: m.leagueTier.iconUrls?.large ?? m.leagueTier.iconUrls?.small }
            : null,
          inClan: true,
          lastSeenAt: now,
          ...(known.has(m.tag) ? {} : { joinedAt: now }),
        },
      },
      { upsert: true },
    );
    if (write.upsertedCount) result.created.push({ tag: m.tag, name: m.name });
    else result.updated++;
  }
  const gone = await PlayerModel.updateMany(
    { tag: { $nin: memberList.map((m) => m.tag) }, inClan: true },
    { $set: { inClan: false } },
  );
  result.left = gone.modifiedCount;
  result.nextCheckAt = (await recordDonations(memberList, now))?.toISOString() ?? null;
  return result;
}

/** Periods closed and not processed yet, with their commendations computed now. */
async function closedPeriods(now: Date, processed: Set<string>): Promise<ClosedPeriod[]> {
  const periods: ClosedPeriod[] = [];
  const clanTag = env().CLAN_TAG!;

  // Completed months of the war history.
  const lastMonth = previousMonth(now);
  for (const { month } of await listMonths()) {
    const key = `month:${month}`;
    if (month > lastMonth || processed.has(key)) continue;
    const period = await getPeriod(month);
    periods.push({ key, awards: awardMonthCommendations(period), names: new Map(period.players.map((p) => [p.tag, p.name])) });
  }

  // Ended Raid Weekends whose members were saved.
  for (const raid of await RaidSeasonModel.find({ clanTag, state: 'ended', hasMembers: true })) {
    const key = `raid:${raid.startTime.toISOString()}`;
    if (processed.has(key)) continue;
    const members = ((raid.season as Record<string, unknown>)['members'] ?? []) as {
      tag: string;
      name: string;
      capitalResourcesLooted: number;
    }[];
    periods.push({ key, awards: awardRaidCommendations(members), names: new Map(members.map((m) => [m.tag, m.name])) });
  }

  // Ended Clan War League seasons.
  for (const season of await CwlSeasonModel.find({ clanTag, state: 'ended' })) {
    const key = `cwl:${season.season}`;
    if (processed.has(key)) continue;
    const players = cwlPlayers(season.wars.map((w) => w.war as LeagueWar), clanTag);
    periods.push({ key, awards: awardCwlCommendations(players), names: new Map(players.map((p) => [p.tag, p.name])) });
  }

  return periods;
}

const donationPeriodKey = (season: string) => `donations:${season}`;
const TIER_RANK: Record<CommendationTier, number> = { bronze: 1, silver: 2, gold: 3, legendary: 4 };

/**
 * `donor` of a game season from the troops donated so far: one award per player and season,
 * raised to the higher tier when one is reached (bronze, then silver, then gold), never lowered.
 * Returns the awards created or raised.
 */
async function awardDonorTiers(season: DonationSeasonRecord, now: Date): Promise<number> {
  const periodKey = donationPeriodKey(season.season);
  const names = new Map(season.players.map((p) => [p.tag, p.name]));
  let changed = 0;
  for (const [playerTag, [award]] of awardDonationCommendations(season.players)) {
    if (!award) continue;
    const filter = { periodKey, playerTag, type: award.type };
    const current = await CommendationAwardModel.findOne(filter).select('tier').lean();
    if (current && TIER_RANK[current.tier as CommendationTier] >= TIER_RANK[award.tier]) continue;
    await CommendationAwardModel.updateOne(
      filter,
      {
        $set: { commendationId: commendationId(award), tier: award.tier, playerName: names.get(playerTag) ?? playerTag, awardedAt: now },
      },
      { upsert: true },
    );
    await recountPlayer(playerTag, names.get(playerTag) ?? playerTag);
    changed++;
  }
  return changed;
}

/** Saves the awards of a period, recounts the totals of its players, then marks it as processed. */
async function awardPeriod(period: ClosedPeriod, now: Date): Promise<number> {
  const docs = [...period.awards].flatMap(([playerTag, items]) =>
    items.map((c) => ({
      periodKey: period.key,
      playerTag,
      playerName: period.names.get(playerTag) ?? playerTag,
      commendationId: commendationId(c),
      type: c.type,
      tier: c.tier,
      awardedAt: now,
    })),
  );
  if (docs.length) {
    await CommendationAwardModel.bulkWrite(
      docs.map((doc) => ({
        updateOne: {
          filter: { periodKey: doc.periodKey, playerTag: doc.playerTag, commendationId: doc.commendationId },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      })),
    );
  }

  for (const tag of period.awards.keys()) await recountPlayer(tag, period.names.get(tag) ?? tag);
  await CommendationPeriodModel.updateOne(
    { periodKey: period.key },
    { $setOnInsert: { periodKey: period.key, awards: docs.length, processedAt: now } },
    { upsert: true },
  );
  return docs.length;
}

/** Totals of a player, counted from the saved awards. */
async function recountPlayer(tag: string, name: string): Promise<void> {
  const totals = await CommendationAwardModel.aggregate<{
    _id: string;
    type: Commendation['type'];
    tier: Commendation['tier'];
    quantity: number;
  }>([
    { $match: { playerTag: tag } },
    { $group: { _id: '$commendationId', type: { $first: '$type' }, tier: { $first: '$tier' }, quantity: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  await PlayerModel.updateOne(
    { tag },
    {
      $set: {
        commendations: totals.map((t) => ({
          id: t._id,
          name: commendationName(t),
          type: t.type,
          tier: t.tier,
          quantity: t.quantity,
        })),
      },
      $setOnInsert: { tag, name },
    },
    { upsert: true },
  );
}

interface LeagueWar {
  state: string;
  clan?: { tag: string; members?: LeagueWarMember[] };
  opponent?: { tag: string; members?: LeagueWarMember[] };
}

interface LeagueWarMember {
  tag: string;
  name: string;
  attacks?: { stars: number }[];
}

/** Days, attacks and stars of the clan's players over the season (wars still in preparation excluded). */
function cwlPlayers(wars: LeagueWar[], clanTag: string): CwlPlayerResult[] {
  const players = new Map<string, CwlPlayerResult>();
  for (const war of wars) {
    if (war.state === 'preparation') continue;
    const side = war.clan?.tag === clanTag ? war.clan : war.opponent?.tag === clanTag ? war.opponent : null;
    for (const m of side?.members ?? []) {
      const p = players.get(m.tag) ?? { tag: m.tag, name: m.name, wars: 0, attacks: 0, stars: 0 };
      p.name = m.name;
      p.wars += 1;
      p.attacks += m.attacks?.length ?? 0;
      p.stars += (m.attacks ?? []).reduce((s, a) => s + a.stars, 0);
      players.set(m.tag, p);
    }
  }
  return [...players.values()];
}
