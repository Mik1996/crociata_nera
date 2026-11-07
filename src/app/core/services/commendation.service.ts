import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { EarnedCommendation } from '../backend/backend-api.types';
import { PlayerRecordsService } from '../backend/player-records.service';
import { APP_CONFIG } from '../config/app-config';
import { Commendation, CommendationEmblem, CommendationPeriods, CwlSeason, PlayerCommendations, RaidSeason } from '../models';
import {
  awardCommendations,
  awardCwlCommendations,
  awardRaidCommendations,
  CommendationCounts,
  countCommendations,
  mergeCommendations,
  previousMonth,
} from '../utils/commendations';
import { HistoryService } from './history.service';

/** Raid Weekends read for the history (one year; the backend keeps them all). */
const HISTORY_RAID_WEEKENDS = 52;

/** Commendations of the whole clan, with the period of each kind. */
export interface ClanCommendations extends CommendationPeriods {
  /** Commendations per player tag (players without any are missing). */
  byTag: ReadonlyMap<string, Commendation[]>;
}

/**
 * Commendations of the clan:
 * - war commendations from the history of the last completed month;
 * - `capitalRaider` from the last ended Raid Weekend;
 * - `cwlStriker` from the last ended Clan War League season.
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
      raid: this.api.getRaidSeasons().pipe(
        // Only a weekend whose members were saved can award commendations.
        map((seasons) => seasons.find((s) => s.state === 'ended' && s.hasMembers) ?? null),
        catchError(() => of<RaidSeason | null>(null)),
      ),
      cwl: this.lastEndedCwl(),
    }).pipe(
      map(({ period, raid, cwl }) => ({
        month,
        raidWeekend: raid ? { startTime: raid.startTime, endTime: raid.endTime } : undefined,
        cwlSeason: cwl?.season,
        byTag: mergeCommendations(
          period ? awardCommendations(period) : new Map(),
          raid ? awardRaidCommendations(raid) : new Map(),
          cwl ? awardCwlCommendations(cwl) : new Map(),
        ),
      })),
    );
  }

  /** Commendations of a player (empty list when none). */
  forPlayer(tag: string, now = new Date()): Observable<PlayerCommendations> {
    return this.forClan(now).pipe(map(({ byTag, ...periods }) => ({ ...periods, items: byTag.get(tag) ?? [] })));
  }

  /**
   * History of the whole clan: how many times each player earned each medal, recomputed with
   * the current rules over every completed period saved in the database (completed months,
   * Raid Weekends with their members, ended CWL seasons). Each source is optional.
   */
  historyForClan(now = new Date()): Observable<CommendationCounts> {
    const lastMonth = previousMonth(now);
    const months$ = this.history.getMonths().pipe(
      switchMap((months) => {
        const completed = months.filter((m) => m.month <= lastMonth);
        return completed.length ? forkJoin(completed.map((m) => this.history.getPeriod(m.month))) : of([]);
      }),
      map((periods) => periods.flatMap((p) => (p ? [awardCommendations(p)] : []))),
      catchError(() => of([])),
    );
    const raids$ = this.api.getRaidSeasons(HISTORY_RAID_WEEKENDS).pipe(
      map((seasons) => seasons.filter((s) => s.state === 'ended' && s.hasMembers).map(awardRaidCommendations)),
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
    return forkJoin([months$, raids$, cwl$]).pipe(map((sources) => countCommendations(sources.flat())));
  }

  /**
   * Commendations earned by the player over time. With the backend: the ones saved when each
   * period closed (frozen, whatever the rules become). In demo mode (no backend): recomputed
   * from the mock data with {@link historyForClan}.
   */
  historyForPlayer(tag: string, now = new Date()): Observable<EarnedCommendation[]> {
    if (!this.useMock) return this.records.getPlayer(tag).pipe(map((player) => player?.commendations ?? []));
    return this.historyForClan(now).pipe(
      map((counts) =>
        // Demo data: no backend catalogue, the name doubles as id.
        [...(counts.get(tag) ?? new Map<CommendationEmblem, number>())].map(([name, quantity]) => {
          const [type, tier] = name.split('-');
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
