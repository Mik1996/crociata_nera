import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { EarnedCommendation } from '../backend/backend-api.types';
import { PlayerRecordsService } from '../backend/player-records.service';
import { APP_CONFIG } from '../config/app-config';
import {
  Commendation,
  CommendationEmblem,
  CommendationPeriods,
  CommendationType,
  CwlSeason,
  DonationSeason,
  LatestLegendSeason,
  PlayerCommendations,
  RaidSeason,
} from '../models';
import {
  awardCommendations,
  awardCwlCommendations,
  awardDonationCommendations,
  awardLegendCommendations,
  awardRaidCommendations,
  awardWarCommendations,
  CommendationCounts,
  countCommendations,
  mergeCommendations,
  previousMonth,
  recentWarCommendations,
} from '../utils/commendations';
import { monthOf } from '../utils/monthly-history';
import { HistoryService } from './history.service';

/** Raid Weekends read for the history (one year; the backend keeps them all). */
const HISTORY_RAID_WEEKENDS = 52;
/** Game seasons in the history (the backend serves up to 36). */
const HISTORY_DONATION_SEASONS = 36;

/** Commendations of the whole clan, with the period of each kind. */
export interface ClanCommendations extends CommendationPeriods {
  /** Commendations per player tag (players without any are missing). */
  byTag: ReadonlyMap<string, Commendation[]>;
  /** Per player tag, the end of the war each one-off war commendation was last earned in. */
  warEndsByTag: ReadonlyMap<string, Partial<Record<CommendationType, string>>>;
}

/**
 * Commendations of the clan:
 * - war commendations from the history of the last completed month; the one-off war commendations
 *   (`chiefHunter`, `fortress`, `perfectWar`) also from the month in progress, as soon as a war ends;
 * - `legendTop` from the last processed Legend League season (saved by the backend);
 * - `capitalRaider` from the last ended Raid Weekend;
 * - `cwlStriker` from the last ended Clan War League season;
 * - `donor` from the game season in progress (donations counted by the backend): awarded as
 *   soon as a tier is reached, so it starts again from nothing with every new season.
 * Each source is optional: if one cannot be loaded, the others are still shown.
 */
@Injectable({ providedIn: 'root' })
export class CommendationService {
  private readonly history = inject(HistoryService);
  private readonly api = inject(CocApiService);
  private readonly records = inject(PlayerRecordsService);
  private readonly useMock = inject(APP_CONFIG).useMockApi;

  forClan(now = new Date()): Observable<ClanCommendations> {
    const month = previousMonth(now);
    return forkJoin({
      period: this.history.getPeriod(month).pipe(catchError(() => of(null))),
      // No war ended yet this month: no period.
      currentPeriod: this.history
        .getPeriod(monthOf(now.toISOString()))
        .pipe(catchError(() => of(null))),
      legends: this.api
        .getLatestLegendSeason()
        .pipe(catchError(() => of<LatestLegendSeason | null>(null))),
      raid: this.api.getRaidSeasons().pipe(
        // Only a weekend whose members were saved can award commendations.
        map((seasons) => seasons.find((s) => s.state === 'ended' && s.hasMembers) ?? null),
        catchError(() => of<RaidSeason | null>(null)),
      ),
      cwl: this.lastEndedCwl(),
      donations: this.api.getDonationSeasons(1).pipe(
        map((seasons) => seasons.find((s) => s.state === 'ongoing') ?? null),
        catchError(() => of<DonationSeason | null>(null)),
      ),
    }).pipe(
      map(({ period, currentPeriod, legends, raid, cwl, donations }) => {
        const recent = recentWarCommendations([period, currentPeriod]);
        return {
          month,
          raidWeekend: raid ? { startTime: raid.startTime, endTime: raid.endTime } : undefined,
          cwlSeason: cwl?.season,
          cwlDates: cwl ? cwlDates(cwl) : undefined,
          donationSeason: donations?.season,
          donationDates: donations
            ? { startTime: donations.startTime, endTime: donations.endTime }
            : undefined,
          byTag: mergeCommendations(
            period ? awardCommendations(period) : new Map(),
            recent.awards,
            legends ? awardLegendCommendations(legends) : new Map(),
            raid ? awardRaidCommendations(raid) : new Map(),
            cwl ? awardCwlCommendations(cwl) : new Map(),
            donations ? awardDonationCommendations(donations) : new Map(),
          ),
          warEndsByTag: recent.wars,
          legendSeason: legends
            ? { seasonId: legends.seasonId, endTime: legends.endTime }
            : undefined,
        };
      }),
    );
  }

  /** Commendations of a player (empty list when none). */
  forPlayer(tag: string, now = new Date()): Observable<PlayerCommendations> {
    return this.forClan(now).pipe(
      map(({ byTag, warEndsByTag, ...periods }) => ({
        ...periods,
        items: byTag.get(tag) ?? [],
        warEnds: warEndsByTag.get(tag) ?? {},
      })),
    );
  }

  /**
   * History of the whole clan: how many times each player earned each medal, recomputed with
   * the current rules over every completed period saved in the database (completed months and their wars,
   * Raid Weekends with their members, ended CWL seasons, game seasons including the one in
   * progress, where `donor` is awarded as soon as a tier is reached). Each source is optional.
   */
  historyForClan(now = new Date()): Observable<CommendationCounts> {
    const lastMonth = previousMonth(now);
    const months$ = this.history.getMonths().pipe(
      switchMap((months) => {
        const completed = months.filter((m) => m.month <= lastMonth);
        return completed.length
          ? forkJoin(completed.map((m) => this.history.getPeriod(m.month)))
          : of([]);
      }),
      // `chiefHunter` once per war, the other war commendations once per month.
      map((periods) =>
        periods.flatMap((p) =>
          p ? [awardCommendations(p), ...p.wars.map(awardWarCommendations)] : [],
        ),
      ),
      catchError(() => of([])),
    );
    const raids$ = this.api.getRaidSeasons(HISTORY_RAID_WEEKENDS).pipe(
      map((seasons) =>
        seasons.filter((s) => s.state === 'ended' && s.hasMembers).map(awardRaidCommendations),
      ),
      catchError(() => of([])),
    );
    const cwl$ = this.api.getCwlSeasons().pipe(
      switchMap((seasons) => {
        const ended = seasons.filter((s) => s.state === 'ended');
        return ended.length ? forkJoin(ended.map((s) => this.api.getCwlSeason(s.season))) : of([]);
      }),
      map((seasons) => seasons.flatMap((s) => (s ? [awardCwlCommendations(s)] : []))),
      catchError(() => of([])),
    );
    const donations$ = this.api.getDonationSeasons(HISTORY_DONATION_SEASONS).pipe(
      map((seasons) => seasons.map(awardDonationCommendations)),
      catchError(() => of([])),
    );
    return forkJoin([months$, raids$, cwl$, donations$]).pipe(
      map((sources) => countCommendations(sources.flat())),
    );
  }

  /**
   * Commendations earned by the player over time. With the backend: the ones saved when each
   * period closed (frozen, whatever the rules become). In demo mode (no backend): recomputed
   * from the mock data with {@link historyForClan}.
   */
  historyForPlayer(tag: string, now = new Date()): Observable<EarnedCommendation[]> {
    if (!this.useMock)
      return this.records.getPlayer(tag).pipe(map((player) => player?.commendations ?? []));
    return this.historyForClan(now).pipe(
      map((counts) =>
        // Demo data: no backend catalogue, the name doubles as id.
        [...(counts.get(tag) ?? new Map<CommendationEmblem, number>())].map(([name, quantity]) => {
          const [type, tier = null] = name.split('-');
          return { id: name, name, type, tier, quantity };
        }),
      ),
    );
  }

  private lastEndedCwl(): Observable<CwlSeason | null> {
    return this.api.getCwlSeasons().pipe(
      switchMap((seasons) => {
        const last = seasons.find((s) => s.state === 'ended');
        return last ? this.api.getCwlSeason(last.season) : of(null);
      }),
      catchError(() => of(null)),
    );
  }
}

/** First battle day and end of the last war of a CWL season; `undefined` without wars. */
function cwlDates(season: CwlSeason): { startTime: string; endTime: string } | undefined {
  const wars = season.rounds.flatMap((r) => (r.war ? [r.war] : []));
  if (!wars.length) return undefined;
  const starts = wars.map((w) => w.startTime).sort();
  const ends = wars.map((w) => w.endTime).sort();
  return { startTime: starts[0]!, endTime: ends[ends.length - 1]! };
}
