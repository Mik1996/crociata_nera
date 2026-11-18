import { Observable } from 'rxjs';
import { TableQuery } from '../../shared/components/table/table-filters';
import { TablePage } from '../../shared/components/table/table-page';
import {
  Clan,
  ClanRecords,
  CwlPlayerRow,
  CwlSeason,
  CwlSeasonSummary,
  DonationSeason,
  HistoryPeriod,
  MemberStatsRow,
  MemberStatsSummary,
  Membership,
  MonthSummary,
  ParticipantsSummary,
  PeriodWarRow,
  PlayerProfile,
  PublicClansData,
  RaidMemberRow,
  RaidMembersSummary,
  RaidSeason,
  RankingOptions,
  RankingRow,
  War,
  WarHistoryRow,
  WarHistorySummary,
  WarPerformance,
} from '../models';
import { ParticipantRow } from '../utils/war-stats';

/**
 * Data layer contract. The concrete implementations are:
 * - {@link MockCocApiService}: locally generated mock data;
 * - {@link HttpCocApiService}: HTTP calls to the backend (`/api/v1`), which reads the official API
 *   and keeps what it saves (the frontend never calls the official API, nor the proxy).
 *
 * The implementation is chosen based on `AppConfig.useMockApi` (see `provideCocApi`).
 */
export abstract class CocApiService {
  /** Clan and member information. */
  abstract getClan(): Observable<Clan>;

  /**
   * Public data of the welcome page, the "Join us" page and the header: the clans of the Crusade
   * (members by name and role only) and the clan's positions in the trophy rankings.
   */
  abstract getWelcome(): Observable<PublicClansData>;

  /** The signed-in user's linked accounts that are in a clan of the Crusade now. */
  abstract getMemberships(): Observable<Membership[]>;

  /** All-time records of the clan (perfect wars, win streak, best league and rankings), kept by the backend. */
  abstract getClanRecords(): Observable<ClanRecords>;

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

  /** Raid Weekends of the Clan Capital, most recent first (`limit`: how many, default about 2 months). */
  abstract getRaidSeasons(limit?: number): Observable<RaidSeason[]>;

  /**
   * Game seasons with the troops donated by each player (counted by the backend, which keeps
   * the donations made before leaving the clan), most recent first, the one in progress included.
   */
  abstract getDonationSeasons(limit?: number): Observable<DonationSeason[]>;

  /** Full profile of a clan member (heroes, troops, achievements…); `null` if not a member. */
  abstract getPlayer(tag: string): Observable<PlayerProfile | null>;

  // --- Tables filtered, sorted and paged by the backend (`query`: what the table asks for) ---

  /** Ended wars, with the record of every war. */
  abstract getWarHistoryTable(
    query: TableQuery,
  ): Observable<TablePage<WarHistoryRow, WarHistorySummary>>;

  /** The clan's players in a war (current or past) and their attacks. */
  abstract getWarParticipantsTable(
    warId: string,
    query: TableQuery,
  ): Observable<TablePage<ParticipantRow, ParticipantsSummary>>;

  /** Members with their war statistics over the last wars. */
  abstract getMemberStatsTable(
    query: TableQuery,
  ): Observable<TablePage<MemberStatsRow, MemberStatsSummary>>;

  /** A player's performance in each of the last wars. */
  abstract getPlayerWarsTable(
    tag: string,
    query: TableQuery,
  ): Observable<TablePage<WarPerformance>>;

  /** Ranking of the players of a period (`YYYY-MM` or `all`). */
  abstract getRankingTable(
    period: string,
    options: RankingOptions,
    query: TableQuery,
  ): Observable<TablePage<RankingRow>>;

  /** Wars of a period (`YYYY-MM` or `all`). */
  abstract getPeriodWarsTable(
    period: string,
    query: TableQuery,
  ): Observable<TablePage<PeriodWarRow>>;

  /** The clan's players in a CWL season (`YYYY-MM`). */
  abstract getCwlPlayersTable(
    season: string,
    query: TableQuery,
  ): Observable<TablePage<CwlPlayerRow>>;

  /** Members who attacked in a Raid Weekend (`weekend`: its id, the start instant). */
  abstract getRaidMembersTable(
    weekend: string,
    query: TableQuery,
  ): Observable<TablePage<RaidMemberRow, RaidMembersSummary>>;
}
