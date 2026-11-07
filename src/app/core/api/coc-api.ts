import { Observable } from 'rxjs';
import { Clan, ClanRanks, CwlSeason, CwlSeasonSummary, HistoryPeriod, MonthSummary, PlayerProfile, RaidSeason, War } from '../models';

/**
 * Data layer contract. The concrete implementations are:
 * - {@link MockCocApiService}: locally generated mock data;
 * - {@link HttpCocApiService}: HTTP calls to a backend proxy of the official API.
 *
 * The implementation is chosen based on `AppConfig.useMockApi` (see `provideCocApi`).
 */
export abstract class CocApiService {
  /** Clan and member information. */
  abstract getClan(): Observable<Clan>;

  /** Position of the clan in its country's and in the worldwide trophy rankings. */
  abstract getClanRanks(): Observable<ClanRanks>;

  /** War in progress or in preparation; `null` if the clan is not at war. */
  abstract getCurrentWar(): Observable<War | null>;

  /** Ended wars with participant details, most recent first. */
  abstract getWarHistory(): Observable<War[]>;

  /** A single war (current or past) by id; `null` if not found. */
  abstract getWar(id: string): Observable<War | null>;

  /** Months available in the monthly history, most recent first. */
  abstract getHistoryMonths(): Observable<MonthSummary[]>;

  /**
   * History of a period: a month (`YYYY-MM`) or `'all'` for all months.
   * Returns `null` if no wars were recorded in the month.
   */
  abstract getHistoryPeriod(period: string): Observable<HistoryPeriod | null>;

  /** Saved Clan War League seasons, most recent first. */
  abstract getCwlSeasons(): Observable<CwlSeasonSummary[]>;

  /** A Clan War League season (`YYYY-MM`); `null` if it was not recorded. */
  abstract getCwlSeason(season: string): Observable<CwlSeason | null>;

  /** Raid Weekends of the Clan Capital, most recent first. */
  abstract getRaidSeasons(): Observable<RaidSeason[]>;

  /** Full profile of a clan member (heroes, troops, achievements…); `null` if not a member. */
  abstract getPlayer(tag: string): Observable<PlayerProfile | null>;
}
