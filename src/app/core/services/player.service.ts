import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { APP_CONFIG } from '../config/app-config';
import { ClanMember, PlayerStats } from '../models';
import { computePlayerStats } from '../utils/war-stats';
import { WarService } from './war.service';

/** Clan members and their war stats. */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly api = inject(CocApiService);
  private readonly wars = inject(WarService);
  private readonly config = inject(APP_CONFIG);

  getMembers(): Observable<ClanMember[]> {
    return this.api.getClan().pipe(map((clan) => clan.members));
  }

  /**
   * Stats of all current members over the configured war window.
   * Only considers wars with participant details (current or archived by the proxy).
   */
  getMembersStats(): Observable<PlayerStats[]> {
    return combineLatest([this.getMembers(), this.wars.getHistory()]).pipe(
      map(([members, history]) => {
        const warWindow = history
          .filter((w) => w.hasDetails)
          .slice(0, this.config.statsWindow);
        return members.map((m) => computePlayerStats(m, warWindow));
      }),
    );
  }

  /** Stats of a single member; `null` if the tag does not belong to the clan. */
  getPlayerStats(tag: string): Observable<PlayerStats | null> {
    return this.getMembersStats().pipe(map((stats) => stats.find((s) => s.tag === tag) ?? null));
  }
}
