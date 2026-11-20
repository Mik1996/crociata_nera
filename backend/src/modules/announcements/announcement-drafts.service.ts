import { crusadeClanTags, periodSuffix, primaryClanTag } from '@/lib/coc/crusade-clans';
import { CommendationPeriodModel } from '@/modules/commendations/commendation-award.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { ClanRecordsModel } from '@/modules/records/clan-records.model';
import { monthBounds } from '@/modules/wars/history.service';
import {
  AnnouncementData,
  buildCwlData,
  buildDonationsData,
  buildMonthData,
  clanName,
  PromotionData,
  RECORD_NAMES,
  RecordData,
  RecordName,
} from './announcement-data';
import {
  AnnouncementBaselineModel,
  AnnouncementKind,
  AnnouncementModel,
  AnnouncementState,
  PlayerLeagueBestModel,
} from './announcement.model';

/**
 * Prepares the drafts of the announcements from what the syncs saved, for every clan of the Crusade:
 * - a closed month (`month:` commendation period): wars, Raid Weekends and commendations of the month;
 * - an ended Clan War League season (`cwl:`);
 * - an ended game season (`donations:`), per clan;
 * - a record better than the last one announced (one draft per record, following it while open);
 * - a player in a league higher than any reached before, from Electro League 31 up to Legend League I
 *   (one draft per player, following the player while open).
 *
 * Reads the saved state rather than reacting to events, so nothing is missed while the server is down.
 * Only periods closed after the clan was first seen get a draft (no drafts for the past). Idempotent.
 */

/** Leagues whose promotions are announced (`leagueTier` ids): Electro League 31 … Legend League I. */
export const PROMOTION_LEAGUES = { first: 105000031, last: 105000036 } as const;
/** Perfect wars are announced at every multiple of this. */
export const PERFECT_WARS_STEP = 25;
/** Name of the league of a clan that never played a Clan War League. */
const UNRANKED = /^unranked$/i;
/** A publication still in progress after this long was interrupted: back to draft, to be checked. */
const STUCK_PUBLISHING_MS = 10 * 60_000;

export interface DraftSyncReport {
  created: string[];
  updated: string[];
  /** Record drafts that are no longer news, deleted. */
  removed: string[];
}

/** Values of the records of a clan (league id for `cwlLeague`), and the league's name. */
type RecordValues = Record<RecordName, number> & { cwlLeagueName?: string };

export async function syncAnnouncementDrafts(now = new Date()): Promise<DraftSyncReport> {
  const report: DraftSyncReport = { created: [], updated: [], removed: [] };
  if (!primaryClanTag()) return report;

  await AnnouncementModel.updateMany(
    { state: AnnouncementState.PUBLISHING, updatedAt: { $lt: new Date(now.getTime() - STUCK_PUBLISHING_MS) } },
    { $set: { state: AnnouncementState.DRAFT, interrupted: true } },
  );

  for (const clanTag of crusadeClanTags()) {
    const baseline = await AnnouncementBaselineModel.findOneAndUpdate(
      { clanTag },
      { $setOnInsert: { clanTag, since: now, records: null } },
      { upsert: true, returnDocument: 'after' },
    ).lean();
    await periodDrafts(clanTag, baseline.since, report);
    await recordDrafts(clanTag, (baseline.records as RecordValues | null) ?? null, report);
  }
  await promotionDrafts(now, report);
  await refreshDrafts(report);
  return report;
}

// --- periods -----------------------------------------------------------------

async function periodDrafts(clanTag: string, since: Date, report: DraftSyncReport): Promise<void> {
  const suffix = periodSuffix(clanTag);
  const periods = await CommendationPeriodModel.find({
    processedAt: { $gte: since },
    periodKey: { $regex: /^(month|cwl|donations):/ },
  })
    .select('periodKey')
    .lean();
  for (const { periodKey } of periods) {
    const match = /^(month|cwl|donations):(\d{4}-\d{2})(@.+)?$/.exec(periodKey);
    if (!match) continue;
    const [, kind, period] = match as unknown as [string, 'month' | 'cwl' | 'donations', string];
    // Months and CWL seasons are per clan (suffix of the clan); donations are for the whole Crusade.
    if (kind !== 'donations' && (match[3] ?? '') !== suffix) continue;
    const key = `${kind}:${period}@${clanTag}`;
    if (await AnnouncementModel.exists({ key })) continue;
    // A month waits for its Raid Weekends (one may start on the last days and end in the next month).
    if (kind === 'month' && (await raidsInProgress(clanTag, period))) continue;
    const data = await buildPeriodData(kind, clanTag, period);
    if (!data) continue;
    if (await createDraft(key, kind, clanTag, period, data)) report.created.push(key);
  }
}

/** A Raid Weekend started in the month has not ended yet, or its commendations are not awarded yet. */
async function raidsInProgress(clanTag: string, month: string): Promise<boolean> {
  const { from, to } = monthBounds(month);
  const raids = await RaidSeasonModel.find({ clanTag, startTime: { $gte: from, $lt: to } })
    .select('startTime state hasMembers')
    .lean();
  if (raids.some((raid) => raid.state !== 'ended')) return true;
  // Raid Weekends without members get no commendations: nothing to wait for.
  const keys = raids.filter((raid) => raid.hasMembers).map((raid) => `raid:${raid.startTime.toISOString()}${periodSuffix(clanTag)}`);
  return (await CommendationPeriodModel.countDocuments({ periodKey: { $in: keys } })) < keys.length;
}

function buildPeriodData(kind: 'month' | 'cwl' | 'donations', clanTag: string, period: string): Promise<AnnouncementData | null> {
  switch (kind) {
    case 'month':
      return buildMonthData(clanTag, period);
    case 'cwl':
      return buildCwlData(clanTag, period);
    case 'donations':
      return buildDonationsData(clanTag, period);
  }
}

/** `false` when another run created it first. */
async function createDraft(key: string, kind: AnnouncementKind, clanTag: string, subject: string, data: AnnouncementData): Promise<boolean> {
  try {
    await AnnouncementModel.create({ key, kind, clanTag, subject, state: AnnouncementState.DRAFT, data });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

/** The figures of the open drafts, brought up to date (a late Raid Weekend, a raised donor tier…). */
async function refreshDrafts(report: DraftSyncReport): Promise<void> {
  const drafts = await AnnouncementModel.find({
    state: AnnouncementState.DRAFT,
    kind: { $in: [AnnouncementKind.MONTH, AnnouncementKind.CWL, AnnouncementKind.DONATIONS] },
  });
  for (const draft of drafts) {
    const data = await buildPeriodData(draft.kind as 'month' | 'cwl' | 'donations', draft.clanTag, draft.subject);
    if (!data || JSON.stringify(data) === JSON.stringify(draft.data)) continue;
    await AnnouncementModel.updateOne({ _id: draft._id, state: AnnouncementState.DRAFT }, { $set: { data } });
    report.updated.push(draft.key);
  }
}

// --- promotions --------------------------------------------------------------

/**
 * The members whose league is higher than any they reached before: their best league is raised and,
 * from Electro League 31 up, a draft is prepared (or the player's open draft follows the new league).
 * Legend League I, the top of the game, is celebrated at every arrival, even when reached before.
 * Demotions and leagues held change nothing.
 */
async function promotionDrafts(now: Date, report: DraftSyncReport): Promise<void> {
  const players = await PlayerModel.find({ inClan: true, 'league.id': { $ne: null } })
    .select('tag name clanTag league')
    .lean();
  const bests = new Map((await PlayerLeagueBestModel.find().lean()).map((b) => [b.playerTag, b]));
  for (const player of players) {
    if (typeof player.league?.id !== 'number') continue;
    const league = { id: player.league.id, name: player.league.name ?? '' };
    const best = bests.get(player.tag);
    if (!best) {
      // First time seen: the starting point, not news.
      await PlayerLeagueBestModel.updateOne(
        { playerTag: player.tag },
        {
          $setOnInsert: {
            playerTag: player.tag,
            leagueId: league.id,
            leagueName: league.name,
            reachedAt: now,
            lastLeagueId: league.id,
          },
        },
        { upsert: true },
      );
      continue;
    }
    const last = best.lastLeagueId ?? null;
    if (league.id === last) continue;
    const raised = league.id > best.leagueId;
    // Back to the top after a demotion (unknown last league: not news).
    const backToTop = !raised && league.id === PROMOTION_LEAGUES.last && last !== null && last < league.id;
    // Conditional on the values read: two runs at once cannot announce the same promotion twice.
    const write = await PlayerLeagueBestModel.updateOne(
      { playerTag: player.tag, lastLeagueId: last, leagueId: best.leagueId },
      {
        $set: {
          lastLeagueId: league.id,
          ...(raised ? { leagueId: league.id, leagueName: league.name, reachedAt: now } : {}),
        },
      },
    );
    if (write.modifiedCount !== 1) continue;
    const announced = league.id >= PROMOTION_LEAGUES.first && league.id <= PROMOTION_LEAGUES.last;
    if (!((raised && announced) || backToTop)) continue;

    const clanTag = player.clanTag ?? primaryClanTag()!;
    // Every arrival at the top is its own announcement: the key carries the time.
    const key = `promotion:${player.tag}:${league.id}${backToTop ? `:${now.getTime()}` : ''}`;
    const open = await AnnouncementModel.findOne({ kind: AnnouncementKind.PROMOTION, subject: player.tag, state: AnnouncementState.DRAFT });
    const before = backToTop ? { id: last!, name: '' } : { id: best.leagueId, name: best.leagueName };
    const data: PromotionData = {
      kind: 'promotion',
      clanTag,
      clanName: clanName(clanTag),
      playerTag: player.tag,
      playerName: player.name,
      league,
      // An open draft keeps the league the player had before it.
      previousLeague: open ? (open.data as PromotionData).previousLeague : before,
    };
    if (open) {
      await AnnouncementModel.updateOne({ _id: open._id, state: AnnouncementState.DRAFT }, { $set: { key, clanTag, data } });
      report.updated.push(key);
    } else if (await createDraft(key, AnnouncementKind.PROMOTION, clanTag, player.tag, data)) {
      report.created.push(key);
    }
  }
}

// --- records -----------------------------------------------------------------

async function recordDrafts(clanTag: string, baseline: RecordValues | null, report: DraftSyncReport): Promise<void> {
  const records = await ClanRecordsModel.findOne({ clanTag }).lean();
  // Not read from the API yet (the other clans start from nothing): nothing to compare.
  if (!records?.lastSyncedAt) return;
  const current: RecordValues = {
    perfectWars: records.perfectWars.value,
    warWinStreak: records.warWinStreak.value,
    cwlLeague: records.cwlLeague.id,
    cwlLeagueName: records.cwlLeague.name,
    localRank: records.localRank.value,
    localCapitalRank: records.localCapitalRank.value,
    capitalPoints: records.capitalPoints.value,
  };
  if (!baseline) {
    // First time the clan's records are seen: they are the starting point, not news.
    await AnnouncementBaselineModel.updateOne({ clanTag }, { $set: { records: current } });
    return;
  }

  for (const record of RECORD_NAMES) {
    const open = await AnnouncementModel.findOne({ kind: AnnouncementKind.RECORD, clanTag, subject: record, state: AnnouncementState.DRAFT });
    const value = announceable(record, clanTag, current) ? newRecordValue(record, current[record], baseline[record]) : null;
    if (value === null) {
      // A draft that is no longer news (prepared under older rules, e.g. "Unranked"): it goes away.
      if (open && (await AnnouncementModel.deleteOne({ _id: open._id, state: AnnouncementState.DRAFT })).deletedCount) {
        report.removed.push(open.key);
      }
      continue;
    }
    const previous = baseline[record] ?? null;
    const data: RecordData = {
      kind: 'record',
      clanTag,
      clanName: clanName(clanTag),
      record,
      value,
      previous: previous === 0 ? null : previous,
      ...(record === 'cwlLeague'
        ? {
            leagueName: current.cwlLeagueName ?? '',
            // No league before (first read of the clan, or "Unranked"): nothing to compare with.
            previousLeagueName: baseline.cwlLeagueName && !UNRANKED.test(baseline.cwlLeagueName) ? baseline.cwlLeagueName : null,
          }
        : {}),
    };
    const key = `record:${record}:${value}@${clanTag}`;
    if (!open) {
      if (await createDraft(key, AnnouncementKind.RECORD, clanTag, record, data)) report.created.push(key);
    } else if ((open.data as RecordData).value !== value) {
      await AnnouncementModel.updateOne({ _id: open._id, state: AnnouncementState.DRAFT }, { $set: { key, data } });
      report.updated.push(key);
    }
  }
}

/**
 * Records that can be announced for a clan: the perfect wars of the other clans are counted only
 * since they are tracked (not announced); "Unranked" (no Clan War League yet) is never a league record.
 */
function announceable(record: RecordName, clanTag: string, current: RecordValues): boolean {
  if (record === 'perfectWars') return clanTag === primaryClanTag();
  if (record === 'cwlLeague') return !UNRANKED.test(current.cwlLeagueName ?? '');
  return true;
}

/**
 * The value to announce when `current` beats `last` (the last one announced), else `null`: perfect
 * wars at multiples of {@link PERFECT_WARS_STEP}, rankings when lower (0: never ranked), the others
 * when higher.
 */
export function newRecordValue(record: RecordName, current: number, last: number | undefined): number | null {
  const previous = last ?? 0;
  switch (record) {
    case 'perfectWars': {
      const milestone = Math.floor(current / PERFECT_WARS_STEP) * PERFECT_WARS_STEP;
      return milestone > previous && milestone > 0 ? milestone : null;
    }
    case 'localRank':
    case 'localCapitalRank':
      return current > 0 && (previous === 0 || current < previous) ? current : null;
    default:
      return current > previous ? current : null;
  }
}

/** A record announcement was published or discarded: the next one must beat its value. */
export async function settleRecord(data: RecordData): Promise<void> {
  const set: Record<string, unknown> = { [`records.${data.record}`]: data.value };
  if (data.record === 'cwlLeague') set['records.cwlLeagueName'] = data.leagueName ?? '';
  await AnnouncementBaselineModel.updateOne({ clanTag: data.clanTag }, { $set: set });
}
