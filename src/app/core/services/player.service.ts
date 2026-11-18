import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';
import { TableQuery } from '../../shared/components/table/table-filters';
import { TablePage } from '../../shared/components/table/table-page';
import { CocApiService } from '../api/coc-api';
import { APP_CONFIG } from '../config/app-config';
import {
    ClanMember,
    MemberStatsRow,
    MemberStatsSummary,
    PlayerProfile,
    PlayerStats,
    WarPerformance,
} from '../models';
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
   * Only considers wars with participant details (current or saved by the backend).
   */
  getMembersStats(): Observable<PlayerStats[]> {
    return combineLatest([this.getMembers(), this.wars.getHistory()]).pipe(
      map(([members, history]) => {
        const warWindow = history.filter((w) => w.hasDetails).slice(0, this.config.statsWindow);
        return members.map((m) => computePlayerStats(m, warWindow));
      }),
    );
  }

  /** A page of the members with their war statistics (filtered, sorted and paged by the backend). */
  getMembersStatsTable(
    query: TableQuery,
  ): Observable<TablePage<MemberStatsRow, MemberStatsSummary>> {
    return this.api.getMemberStatsTable(query);
  }

  /** A page of the wars of a player among the last ones (filtered, sorted and paged by the backend). */
  getPlayerWarsTable(tag: string, query: TableQuery): Observable<TablePage<WarPerformance>> {
    return this.api.getPlayerWarsTable(tag, query);
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
