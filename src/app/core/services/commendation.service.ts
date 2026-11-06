import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Commendation, PlayerCommendations } from '../models';
import { awardCommendations, previousMonth } from '../utils/commendations';
import { HistoryService } from './history.service';

/** Commendations of the whole clan for a month. */
export interface ClanCommendations {
  /** Month the commendations refer to (`YYYY-MM`). */
  month: string;
  /** Commendations per player tag (players without any are missing). */
  byTag: ReadonlyMap<string, Commendation[]>;
}

/** Monthly commendations, computed from the history of the last completed month. */
@Injectable({ providedIn: 'root' })
export class CommendationService {
  private readonly history = inject(HistoryService);

  /** Commendations of every player for the last completed month. */
  forClan(now = new Date()): Observable<ClanCommendations> {
    const month = previousMonth(now);
    return this.history.getPeriod(month).pipe(
      map((period) => ({ month, byTag: period ? awardCommendations(period) : new Map() })),
    );
  }

  /** Commendations of a player for the last completed month (empty list when none). */
  forPlayer(tag: string, now = new Date()): Observable<PlayerCommendations> {
    return this.forClan(now).pipe(map(({ month, byTag }) => ({ month, items: byTag.get(tag) ?? [] })));
  }
}
