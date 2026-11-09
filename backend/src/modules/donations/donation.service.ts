import { z } from 'zod';
import { CocApiError, fetchGoldPassSeason } from '@/lib/coc/coc-client';
import { cocDate } from '@/lib/coc/coc-date';
import { DonationCounterModel, DonationSeasonModel, DonationTotalModel } from './donation.model';

/** A clan member as listed by `GET /clans/{tag}`, with the in-game donation counter. */
export interface MemberDonations {
  tag: string;
  name: string;
  donations: number;
}

/** Season with the troops donated by each player (most first). */
export interface DonationSeasonRecord {
  season: string;
  startTime: string;
  endTime: string;
  state: 'ongoing' | 'ended';
  players: { tag: string; name: string; donations: number }[];
}

/** The last read happens this long before the end of the season. */
const BEFORE_END_MS = 60_000;

const goldPassSchema = z.object({ startTime: cocDate, endTime: cocDate });

/** `YYYY-MM` of the middle of the season (robust to seasons starting or ending near a month change). */
export function seasonId(startTime: Date, endTime: Date): string {
  const middle = new Date((startTime.getTime() + endTime.getTime()) / 2);
  return `${middle.getUTCFullYear()}-${String(middle.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The season in progress: from the database or, when none covers `now`, from the Gold Pass
 * season of the API (then saved). `null` if the API cannot tell.
 */
export async function currentSeason(now: Date): Promise<{ season: string; startTime: Date; endTime: Date } | null> {
  const saved = await DonationSeasonModel.findOne({ startTime: { $lte: now }, endTime: { $gt: now } }).lean();
  if (saved) return saved;
  let parsed: z.infer<typeof goldPassSchema>;
  try {
    parsed = goldPassSchema.parse(await fetchGoldPassSeason());
  } catch (error) {
    if (error instanceof CocApiError || error instanceof z.ZodError) return null;
    throw error;
  }
  const { startTime, endTime } = parsed;
  if (!(startTime <= now && now < endTime)) return null;
  const season = seasonId(startTime, endTime);
  await DonationSeasonModel.updateOne({ season }, { $set: { startTime, endTime } }, { upsert: true });
  return { season, startTime, endTime };
}

/**
 * Adds to the season in progress the troops donated since the last read.
 *
 * The in-game counter only grows during a season, but restarts from 0 when the player leaves
 * the clan and at the end of the season. So, for each member:
 * - counter >= last read: donated `counter - last`;
 * - counter < last read: the counter was reset in between, donated `counter` (since the reset).
 * Players no longer in the clan get their last read set to 0, so what they donate after coming
 * back is counted from zero. The last read is updated only if nobody else changed it meanwhile,
 * so two concurrent runs never count the same troops twice.
 *
 * Returns when to read again for the last time before the season ends (`null` if no season).
 */
export async function recordDonations(members: MemberDonations[], now: Date): Promise<Date | null> {
  const season = await currentSeason(now);
  // Without a season the reads are kept as they are: the next run counts the difference.
  if (!season) return null;

  const tags = members.map((m) => m.tag);
  const last = new Map(
    (await DonationCounterModel.find({ playerTag: { $in: tags } }).lean()).map((c) => [c.playerTag, c.counter]),
  );
  for (const m of members) {
    const previous = last.get(m.tag);
    const donated = previous === undefined || m.donations < previous ? m.donations : m.donations - previous;
    if (previous === m.donations) continue;
    if (!(await advanceCounter(m.tag, previous, m.donations, now)) || donated <= 0) continue;
    await DonationTotalModel.updateOne(
      { season: season.season, playerTag: m.tag },
      { $inc: { donations: donated }, $set: { playerName: m.name, updatedAt: now } },
      { upsert: true },
    );
  }
  await DonationCounterModel.updateMany(
    { playerTag: { $nin: tags }, counter: { $gt: 0 } },
    { $set: { counter: 0, readAt: now } },
  );

  const lastRead = new Date(season.endTime.getTime() - BEFORE_END_MS);
  return lastRead > now ? lastRead : null;
}

/** Saves the new read if the previous one is still `previous` (`undefined`: never read). */
async function advanceCounter(tag: string, previous: number | undefined, counter: number, now: Date): Promise<boolean> {
  if (previous === undefined) {
    const write = await DonationCounterModel.updateOne(
      { playerTag: tag },
      { $setOnInsert: { playerTag: tag, counter, readAt: now } },
      { upsert: true },
    );
    return write.upsertedCount === 1;
  }
  const write = await DonationCounterModel.updateOne({ playerTag: tag, counter: previous }, { $set: { counter, readAt: now } });
  return write.modifiedCount === 1;
}

/** Ended seasons, most recent first, with their totals. */
export async function endedSeasons(now: Date): Promise<DonationSeasonRecord[]> {
  const seasons = await DonationSeasonModel.find({ endTime: { $lte: now } }).sort({ startTime: -1 }).lean();
  return Promise.all(seasons.map((s) => seasonRecord(s, now)));
}

/** The season in progress with its totals so far, `null` if none is saved. */
export async function ongoingSeason(now: Date): Promise<DonationSeasonRecord | null> {
  const season = await DonationSeasonModel.findOne({ startTime: { $lte: now }, endTime: { $gt: now } }).lean();
  return season ? seasonRecord(season, now) : null;
}

/** Saved seasons, most recent first (the one in progress included), with their totals. */
export async function listDonationSeasons(limit: number, now = new Date()): Promise<DonationSeasonRecord[]> {
  const seasons = await DonationSeasonModel.find().sort({ startTime: -1 }).limit(limit).lean();
  return Promise.all(seasons.map((s) => seasonRecord(s, now)));
}

async function seasonRecord(
  s: { season: string; startTime: Date; endTime: Date },
  now: Date,
): Promise<DonationSeasonRecord> {
  const totals = await DonationTotalModel.find({ season: s.season }).sort({ donations: -1 }).lean();
  return {
    season: s.season,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    state: s.endTime <= now ? 'ended' : 'ongoing',
    players: totals.map((t) => ({ tag: t.playerTag, name: t.playerName, donations: t.donations })),
  };
}
