import { inject, Injectable } from '@angular/core';
import { catchError, combineLatest, forkJoin, map, Observable, of } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { APP_CONFIG } from '../config/app-config';
import { SISTER_CLANS } from '../config/sister-clans';
import { ClanMember, PlayerProfile, PlayerStats } from '../models';
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
   * Tags of the current members of the three clans of the Crusade (Crociata Nera and its sister
   * clans): whoever is not in any of them is a former member. `null` when a member list cannot be
   * read, so nobody is wrongly labelled as a former member.
   */
  getCrusadeMemberTags(): Observable<Set<string> | null> {
    return forkJoin([
      this.api.getClan(),
      ...SISTER_CLANS.map((sister) => this.api.getClanByTag(sister.tag)),
    ]).pipe(
      map((clans) => new Set(clans.flatMap((clan) => clan.members.map((m) => m.tag)))),
      catchError(() => of(null)),
    );
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

  /** Full game profile of a member (heroes, troops, achievements…); `null` if not a member. */
  getPlayerProfile(tag: string): Observable<PlayerProfile | null> {
    return this.api.getPlayer(tag);
  }

  /** Stats of a single member; `null` if the tag does not belong to the clan. */
  getPlayerStats(tag: string): Observable<PlayerStats | null> {
    return this.getMembersStats().pipe(map((stats) => stats.find((s) => s.tag === tag) ?? null));
  }
}
