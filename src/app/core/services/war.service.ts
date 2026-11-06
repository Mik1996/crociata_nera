import { inject, Injectable } from '@angular/core';
import { map, Observable, shareReplay, switchMap, of } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { War } from '../models';

/** Access to the clan's war data. */
@Injectable({ providedIn: 'root' })
export class WarService {
  private readonly api = inject(CocApiService);

  /** History shared across pages, reloadable with {@link refreshHistory}. */
  private history$ = this.createHistory();

  private createHistory(): Observable<War[]> {
    return this.api.getWarHistory().pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  /** Invalidates the history cache (e.g. after an error or a manual refresh). */
  refreshHistory(): void {
    this.history$ = this.createHistory();
  }

  getCurrentWar(): Observable<War | null> {
    return this.api.getCurrentWar();
  }

  /** Ended wars, most recent first. */
  getHistory(): Observable<War[]> {
    return this.history$;
  }

  getWar(id: string): Observable<War | null> {
    return this.api.getWar(id);
  }

  /** Most recent war: the current one if present, otherwise the last ended one. */
  getLatestWar(): Observable<War | null> {
    return this.getCurrentWar().pipe(
      switchMap((current) =>
        current ? of(current) : this.getHistory().pipe(map((history) => history[0] ?? null)),
      ),
    );
  }
}
