import { z } from 'zod';
import { env } from '@/lib/config/env';
import { CocApiError, fetchCapitalRankings, fetchClan, fetchClanRankings } from '@/lib/coc/coc-client';
import { WarModel } from '@/modules/wars/war.model';
import { ClanRecordsModel } from './clan-records.model';

/** Records reached before the backend tracked them (November 2026), the starting point. */
export const INITIAL_CLAN_RECORDS = {
  perfectWars: 137,
  warWinStreak: 50,
  cwlLeague: { id: 48000015, name: 'Master League I' },
  localRank: 37,
  localCapitalRank: 12,
  capitalPoints: 5380,
} as const;

/** A best value; `achievedAt` is `null` for the records of the seed. */
export interface RecordValue {
  value: number;
  achievedAt: string | null;
}

/** `GET /api/v1/clan/records`. */
export interface ClanRecordsView {
  perfectWars: RecordValue;
  warWinStreak: RecordValue;
  cwlLeague: { id: number; name: string; achievedAt: string | null };
  localRank: RecordValue;
  localCapitalRank: RecordValue;
  capitalPoints: RecordValue;
}

export interface RecordSyncReport {
  /** Wars added to the perfect wars record in this run. */
  perfectWars: string[];
  /** Records improved in this run. */
  improved: string[];
  error: { status: number; reason: string; message: string } | null;
}

type NumericRecord = 'warWinStreak' | 'localRank' | 'localCapitalRank' | 'capitalPoints';

const clanSchema = z.object({
  warWinStreak: z.number().int().nonnegative().optional(),
  clanCapitalPoints: z.number().int().nonnegative().optional(),
  warLeague: z.object({ id: z.number().int(), name: z.string() }).optional(),
  location: z.object({ id: z.number().int(), isCountry: z.boolean().optional() }).optional(),
});
const rankingSchema = z.object({ items: z.array(z.object({ tag: z.string(), rank: z.number().int().positive() })) });

/**
 * Creates the records document from the seed if missing (idempotent). Wars ended before `now` are
 * already part of the seeded perfect wars count.
 */
export async function ensureClanRecords(clanTag: string, now: Date): Promise<void> {
  const seed = INITIAL_CLAN_RECORDS;
  const record = (value: number) => ({ value, achievedAt: null });
  await ClanRecordsModel.updateOne(
    { clanTag },
    {
      $setOnInsert: {
        clanTag,
        perfectWars: record(seed.perfectWars),
        perfectWarsSince: now,
        warWinStreak: record(seed.warWinStreak),
        cwlLeague: { ...seed.cwlLeague, achievedAt: null },
        localRank: record(seed.localRank),
        localCapitalRank: record(seed.localCapitalRank),
        capitalPoints: record(seed.capitalPoints),
      },
    },
    { upsert: true },
  );
}

/**
 * 1. Counts the ended wars won with every star (saved by the war sync, never twice).
 * 2. Reads the clan and its country rankings, and keeps every value better than the record:
 *    win streak, Clan War League, Clan Capital trophies, positions in the rankings.
 *
 * Every update is conditional on the stored value, so concurrent runs cannot lower a record.
 */
export async function syncClanRecords(now = new Date()): Promise<RecordSyncReport> {
  const report: RecordSyncReport = { perfectWars: [], improved: [], error: null };
  const clanTag = env().CLAN_TAG;
  if (!clanTag) return report;

  await ensureClanRecords(clanTag, now);
  report.perfectWars = await countPerfectWars(clanTag, now);

  try {
    const clan = clanSchema.parse(await fetchClan(clanTag));
    const improve = async (name: NumericRecord, value: number | undefined) => {
      if (value !== undefined && (await improveRecord(clanTag, name, value, now))) report.improved.push(name);
    };
    await improve('warWinStreak', clan.warWinStreak);
    await improve('capitalPoints', clan.clanCapitalPoints);
    if (clan.warLeague && (await improveLeague(clanTag, clan.warLeague, now))) report.improved.push('cwlLeague');

    // Rankings of the clan's country (none for "International" or no location).
    if (clan.location?.isCountry) {
      await improve('localRank', await rankIn(fetchClanRankings(clan.location.id), clanTag));
      await improve('localCapitalRank', await rankIn(fetchCapitalRankings(clan.location.id), clanTag));
    }
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}

/** Position of the clan in a ranking; `undefined` if it is not in it (beyond the top 200). */
async function rankIn(ranking: Promise<unknown>, clanTag: string): Promise<number | undefined> {
  const parsed = rankingSchema.safeParse(await ranking);
  return parsed.success ? parsed.data.items.find((c) => c.tag === clanTag)?.rank : undefined;
}

/**
 * Adds to the record the ended wars with every star, ended after the seed. Each war is marked
 * first, so it is counted once even if two runs overlap.
 */
async function countPerfectWars(clanTag: string, now: Date): Promise<string[]> {
  const records = await ClanRecordsModel.findOne({ clanTag }).select('perfectWarsSince').lean();
  if (!records) return [];
  const perfect = await WarModel.find({
    clanTag,
    state: 'warEnded',
    perfectCounted: { $ne: true },
    endTime: { $gte: records.perfectWarsSince },
    $expr: { $gte: ['$clan.stars', { $multiply: ['$teamSize', 3] }] },
  })
    .select('warKey')
    .lean();

  const counted: string[] = [];
  for (const war of perfect) {
    const mark = await WarModel.updateOne({ _id: war._id, perfectCounted: { $ne: true } }, { $set: { perfectCounted: true } });
    if (mark.modifiedCount !== 1) continue;
    await ClanRecordsModel.updateOne({ clanTag }, { $inc: { 'perfectWars.value': 1 }, $set: { 'perfectWars.achievedAt': now } });
    counted.push(war.warKey);
  }
  return counted;
}

/** Saves `value` if better than the record: higher, or lower for the rankings. */
async function improveRecord(clanTag: string, name: NumericRecord, value: number, now: Date): Promise<boolean> {
  const better = name === 'localRank' || name === 'localCapitalRank' ? '$gt' : '$lt';
  const write = await ClanRecordsModel.updateOne(
    { clanTag, [`${name}.value`]: { [better]: value } },
    { $set: { [name]: { value, achievedAt: now } } },
  );
  return write.modifiedCount === 1;
}

/** Saves the Clan War League if higher than the record (league ids grow with the rank). */
async function improveLeague(clanTag: string, league: { id: number; name: string }, now: Date): Promise<boolean> {
  const write = await ClanRecordsModel.updateOne(
    { clanTag, 'cwlLeague.id': { $lt: league.id } },
    { $set: { cwlLeague: { ...league, achievedAt: now } } },
  );
  return write.modifiedCount === 1;
}

/** The clan's records; the seed while the sync has not run yet. */
export async function getClanRecords(): Promise<ClanRecordsView> {
  const clanTag = env().CLAN_TAG;
  const saved = clanTag ? await ClanRecordsModel.findOne({ clanTag }).lean() : null;
  const seed = INITIAL_CLAN_RECORDS;
  const view = (r: { value: number; achievedAt?: Date | null } | undefined, fallback: number): RecordValue => ({
    value: r?.value ?? fallback,
    achievedAt: r?.achievedAt?.toISOString() ?? null,
  });
  return {
    perfectWars: view(saved?.perfectWars, seed.perfectWars),
    warWinStreak: view(saved?.warWinStreak, seed.warWinStreak),
    cwlLeague: {
      id: saved?.cwlLeague.id ?? seed.cwlLeague.id,
      name: saved?.cwlLeague.name ?? seed.cwlLeague.name,
      achievedAt: saved?.cwlLeague.achievedAt?.toISOString() ?? null,
    },
    localRank: view(saved?.localRank, seed.localRank),
    localCapitalRank: view(saved?.localCapitalRank, seed.localCapitalRank),
    capitalPoints: view(saved?.capitalPoints, seed.capitalPoints),
  };
}
