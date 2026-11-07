import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { Commendation, CommendationPeriods, CwlSeason, PlayerCommendations, RaidSeason } from '../models';
import {
  awardCommendations,
  awardCwlCommendations,
  awardRaidCommendations,
  mergeCommendations,
  previousMonth,
} from '../utils/commendations';
import { HistoryService } from './history.service';

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
