import { inject, Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { SISTER_CLANS, SisterClan } from '../config/sister-clans';
import { generateMockData, MockDataset } from '../mock/mock-data';
import {
  generateMockCwlSeasons,
  generateMockDonationSeasons,
  generateMockRaidSeasons,
} from '../mock/mock-cwl';
import { mockPlayer } from '../mock/mock-player';
import {
  Clan,
  ClanRecords,
  CwlPlayerRow,
  CwlSeason,
  CwlSeasonSummary,
  DonationSeason,
  HistoryPeriod,
  HistoryWar,
  MemberStatsAverages,
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
import { TableQuery } from '../../shared/table/table-filters';
import { applyTableQuery, TablePage } from '../../shared/table/table-page';
import {
  CWL_PLAYER_FILTERS,
  memberStatsFilters,
  memberStatsSortKey,
  participantFilters,
  participantSortKey,
  PERIOD_WARS_FILTERS,
  periodWarsSortKey,
  PLAYER_WARS_FILTERS,
  RAID_MEMBER_FILTERS,
  RANKING_FILTERS,
  WAR_HISTORY_FILTERS,
} from '../../shared/table/clan-tables';
import { buildCwlSeason, mapRaidSeason } from '../utils/cwl';
import {
  compareForRanking,
  historyPeriod,
  monthSummaries,
  toHistoryWar,
} from '../utils/monthly-history';
import { computePlayerStats, participantRows, ParticipantRow, warResult } from '../utils/war-stats';
import { CocApiService } from './coc-api';
import { CocCapitalRaidSeason, CocCwlSeasonRecord } from './coc-api.types';
import { mapPlayerProfile } from './coc-api.mappers';

/** Mock implementation: locally generated data with simulated latency. */
@Injectable()
export class MockCocApiService extends CocApiService {
  private readonly config = inject(APP_CONFIG);
  private dataset?: MockDataset;

  private cwl?: CocCwlSeasonRecord[];
  private raids?: CocCapitalRaidSeason[];
  private donations?: DonationSeason[];

  private get data(): MockDataset {
    this.dataset ??= generateMockData({
      clanTag: this.config.clanTag,
      clanName: this.config.clanName,
    });
    return this.dataset;
  }

  /** CWL seasons in the backend format, built from the mock clan members. */
  private get cwlSeasons(): CocCwlSeasonRecord[] {
    const { clan } = this.data;
    this.cwl ??= generateMockCwlSeasons({
      clanTag: clan.tag,
      clanName: clan.name,
      members: clan.members,
      now: new Date(),
    });
    return this.cwl;
  }

  /** Raid Weekends in the API format. */
  private get raidSeasons(): CocCapitalRaidSeason[] {
    this.raids ??= generateMockRaidSeasons({ members: this.data.clan.members, now: new Date() });
    return this.raids;
  }

  /** Game seasons with the donations, in the backend format. */
  private get donationSeasons(): DonationSeason[] {
    this.donations ??= generateMockDonationSeasons({
      members: this.data.clan.members,
      now: new Date(),
    });
    return this.donations;
  }

  private respond<T>(value: T): Observable<T> {
    // structuredClone prevents components from accidentally mutating the shared dataset.
    return of(structuredClone(value)).pipe(delay(this.config.mockLatencyMs));
  }

  getClan(): Observable<Clan> {
    return this.respond(this.data.clan);
  }

  /** The clan, its sister clans (built from it: smaller, younger) and its rankings, as the welcome page sees them. */
  getWelcome(): Observable<PublicClansData> {
    const publicView = (clan: Clan): Clan => ({
      ...clan,
      // Members by name and role only, as the backend gives them.
      members: clan.members.map((m) => ({ name: m.name, role: m.role }) as Clan['members'][number]),
    });
    return this.respond({
      clan: publicView(this.data.clan),
      sisters: SISTER_CLANS.map((sister) => publicView(this.sisterClan(sister))),
      // In the top 200 of its country, not worldwide.
      ranks: { local: 27, global: null },
    });
  }

  /** No signed-in user in the demo. */
  getMemberships(): Observable<Membership[]> {
    return this.respond([]);
  }

  private sisterClan(sister: SisterClan): Clan {
    const tag = sister.tag;
    const red = sister.order === 'red';
    const clan = this.data.clan;
    return {
      ...clan,
      tag,
      name: sister.name,
      level: red ? 14 : 11,
      description: red
        ? 'Il clan gemello di Crociata Nera: qui si gioca la seconda CWL e c’è un posto per tutti.'
        : 'Le guerre non si fermano mai: durante le CWL qui continuiamo con le guerre tra clan.',
      members: clan.members.slice(0, red ? 41 : 33),
      warWins: Math.round(clan.warWins * (red ? 0.6 : 0.4)),
      warLosses: Math.round(clan.warLosses * 0.7),
      warTies: Math.round(clan.warTies * 0.5),
      warWinStreak: red ? 7 : 3,
      clanPoints: Math.round(clan.clanPoints * (red ? 0.75 : 0.6)),
      warLeague: red
        ? { id: 48000012, name: 'Crystal League I' }
        : { id: 48000009, name: 'Gold League I' },
    };
  }

  getClanRecords(): Observable<ClanRecords> {
    return this.respond({
      perfectWars: { value: 137, achievedAt: null },
      warWinStreak: { value: 50, achievedAt: null },
      cwlLeague: { id: 48000015, name: 'Master League I', achievedAt: null },
      localRank: { value: 37, achievedAt: null },
      localCapitalRank: { value: 12, achievedAt: null },
      capitalPoints: { value: 5380, achievedAt: '2026-11-08T18:00:00.000Z' },
    });
  }

  getCurrentWar(): Observable<War | null> {
    return this.respond(this.data.wars.find((w) => w.state !== 'ended') ?? null);
  }

  getWarHistory(): Observable<War[]> {
    return this.respond(this.data.wars.filter((w) => w.state === 'ended'));
  }

  getWar(id: string): Observable<War | null> {
    return this.respond(this.data.wars.find((w) => w.id === id) ?? null);
  }

  /** Like the backend: only ended wars with details enter the monthly history. */
  private get history(): HistoryWar[] {
    return this.data.wars.map(toHistoryWar).filter((w): w is HistoryWar => w !== null);
  }

  private get updatedAt(): string {
    return this.data.wars.find((w) => w.state === 'ended')?.endTime ?? new Date().toISOString();
  }

  getHistoryMonths(): Observable<MonthSummary[]> {
    return this.respond(monthSummaries(this.history, this.updatedAt));
  }

  getHistoryPeriod(period: string): Observable<HistoryPeriod | null> {
    return this.respond(historyPeriod(period, this.history, this.updatedAt));
  }

  getCwlSeasons(): Observable<CwlSeasonSummary[]> {
    return this.respond(
      this.cwlSeasons.map((s) => ({
        season: s.season,
        state: s.state === 'ended' ? ('ended' as const) : ('inWar' as const),
      })),
    );
  }

  getCwlSeason(season: string): Observable<CwlSeason | null> {
    const record = this.cwlSeasons.find((s) => s.season === season);
    return this.respond(record ? buildCwlSeason(record, this.data.clan.tag) : null);
  }

  getRaidSeasons(limit = 10): Observable<RaidSeason[]> {
    return this.respond(this.raidSeasons.slice(0, limit).map(mapRaidSeason));
  }

  getDonationSeasons(limit = 12): Observable<DonationSeason[]> {
    return this.respond(this.donationSeasons.slice(0, limit));
  }

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    const { clan } = this.data;
    const member = clan.members.find((m) => m.tag === tag);
    return this.respond(member ? mapPlayerProfile(mockPlayer(member, clan)) : null);
  }

  // --- Tables: filtered, sorted and paged here, as the backend would ---------------------------

  getWarHistoryTable(query: TableQuery): Observable<TablePage<WarHistoryRow, WarHistorySummary>> {
    const rows: WarHistoryRow[] = this.data.wars
      .filter((w) => w.state === 'ended')
      .map((w) => ({
        id: w.id,
        date: w.endTime,
        opponent: w.opponent.name,
        opponentTag: w.opponent.tag,
        teamSize: w.teamSize,
        result: warResult(w) as WarHistoryRow['result'],
        stars: w.clan.stars,
        starsConceded: w.opponent.stars,
        destruction: w.clan.destructionPercentage,
        destructionConceded: w.opponent.destructionPercentage,
        hasDetails: w.hasDetails,
      }));
    const count = (result: string) => rows.filter((r) => r.result === result).length;
    const summary = {
      wars: rows.length,
      victories: count('victory'),
      defeats: count('defeat'),
      draws: count('draw'),
    };
    return this.respond(
      applyTableQuery(rows, WAR_HISTORY_FILTERS, query, { summary: () => summary }),
    );
  }

  getWarParticipantsTable(
    warId: string,
    query: TableQuery,
  ): Observable<TablePage<ParticipantRow, ParticipantsSummary>> {
    const war = this.data.wars.find((w) => w.id === warId);
    const rows = war ? participantRows(war) : [];
    const summary = { townHalls: [...new Set(rows.map((r) => r.townHall))].sort((a, b) => b - a) };
    return this.respond(
      applyTableQuery(rows, participantFilters(summary), query, {
        sortKey: participantSortKey,
        summary: () => summary,
      }),
    );
  }

  /** The last wars with players, as the statistics look at them. */
  private get statsWindow(): War[] {
    return this.data.wars
      .filter((w) => w.state === 'ended' && w.hasDetails)
      .slice(0, this.config.statsWindow);
  }

  getMemberStatsTable(
    query: TableQuery,
  ): Observable<TablePage<MemberStatsRow, MemberStatsSummary>> {
    const wars = this.statsWindow;
    const rows: MemberStatsRow[] = this.data.clan.members.map((member) => {
      const { history: _history, ...stats } = computePlayerStats(member, wars);
      return { ...stats, league: stats.league ?? null };
    });
    const leagues = new Map<number, string>();
    for (const m of rows) if (m.league) leagues.set(m.league.id, m.league.name);
    const list = [...leagues].sort((a, b) => b[0] - a[0]).map(([id, name]) => ({ id, name }));
    const mean = (matching: readonly MemberStatsRow[], field: keyof MemberStatsAverages) =>
      matching.reduce((sum, m) => sum + m[field], 0) / matching.length;
    return this.respond(
      applyTableQuery(rows, memberStatsFilters(list), query, {
        sortKey: memberStatsSortKey,
        summary: (matching) => ({
          members: rows.length,
          warsTotal: wars.length,
          leagues: list,
          averages: matching.length
            ? {
                townHall: mean(matching, 'townHall'),
                warsPlayed: mean(matching, 'warsPlayed'),
                attendance: mean(matching, 'attendance'),
                attacksUsed: mean(matching, 'attacksUsed'),
                attacksAvailable: mean(matching, 'attacksAvailable'),
                totalStars: mean(matching, 'totalStars'),
                averageStars: mean(matching, 'averageStars'),
                threeStarRate: mean(matching, 'threeStarRate'),
                averageDestruction: mean(matching, 'averageDestruction'),
              }
            : null,
        }),
      }),
    );
  }

  getPlayerWarsTable(tag: string, query: TableQuery): Observable<TablePage<WarPerformance>> {
    const member = this.data.clan.members.find((m) => m.tag === tag);
    const rows = member ? [...computePlayerStats(member, this.statsWindow).history].reverse() : [];
    return this.respond(
      applyTableQuery(rows, PLAYER_WARS_FILTERS, query, {
        sortKey: (p, column) =>
          column === 'attacks' ? p.attacksUsed : (p as unknown as Record<string, number>)[column],
      }),
    );
  }

  getRankingTable(
    period: string,
    options: RankingOptions,
    query: TableQuery,
  ): Observable<TablePage<RankingRow>> {
    const members = new Set(this.data.clan.members.map((m) => m.tag));
    const rows: RankingRow[] = [
      ...(historyPeriod(period, this.history, this.updatedAt)?.players ?? []),
    ]
      .filter((p) => p.wars >= options.minWars)
      .filter((p) => !options.currentMembersOnly || members.has(p.tag))
      .sort(compareForRanking)
      .map((p, i) => ({ ...p, rank: i + 1, isCurrentMember: members.has(p.tag) }));
    return this.respond(applyTableQuery(rows, RANKING_FILTERS, query));
  }

  getPeriodWarsTable(period: string, query: TableQuery): Observable<TablePage<PeriodWarRow>> {
    const rows = (historyPeriod(period, this.history, this.updatedAt)?.wars ?? []).map(
      ({ players: _players, ...war }) => war,
    );
    return this.respond(
      applyTableQuery(rows, PERIOD_WARS_FILTERS, query, { sortKey: periodWarsSortKey }),
    );
  }

  getCwlPlayersTable(season: string, query: TableQuery): Observable<TablePage<CwlPlayerRow>> {
    const record = this.cwlSeasons.find((s) => s.season === season);
    const rows = (record ? buildCwlSeason(record, this.data.clan.tag).players : []).map((p, i) => ({
      ...p,
      index: i + 1,
    }));
    return this.respond(applyTableQuery(rows, CWL_PLAYER_FILTERS, query));
  }

  getRaidMembersTable(
    weekend: string,
    query: TableQuery,
  ): Observable<TablePage<RaidMemberRow, RaidMembersSummary>> {
    const season = this.raidSeasons.map(mapRaidSeason).find((s) => s.id === weekend);
    const rows = (season?.members ?? []).map((m, i) => ({ ...m, rank: i + 1 }));
    return this.respond(
      applyTableQuery(rows, RAID_MEMBER_FILTERS, query, {
        summary: (matching) => ({
          attacks: matching.reduce((sum, m) => sum + m.attacks, 0),
          attackLimit: matching.reduce((sum, m) => sum + m.attackLimit, 0),
          looted: matching.reduce((sum, m) => sum + m.looted, 0),
        }),
      }),
    );
  }
}
