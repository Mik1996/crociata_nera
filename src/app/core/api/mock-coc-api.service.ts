import { inject, Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { SISTER_CLANS } from '../config/sister-clans';
import { generateMockData, MockDataset } from '../mock/mock-data';
import { generateMockCwlSeasons, generateMockDonationSeasons, generateMockRaidSeasons } from '../mock/mock-cwl';
import { mockPlayer } from '../mock/mock-player';
import { Clan, ClanRanks, ClanRecords, CwlSeason, CwlSeasonSummary, DonationSeason, HistoryPeriod, HistoryWar, MonthSummary, PlayerProfile, RaidSeason, War } from '../models';
import { buildCwlSeason, mapRaidSeason } from '../utils/cwl';
import { historyPeriod, monthSummaries, toHistoryWar } from '../utils/monthly-history';
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
    this.dataset ??= generateMockData({ clanTag: this.config.clanTag, clanName: this.config.clanName });
    return this.dataset;
  }

  /** CWL seasons in the backend format, built from the mock clan members. */
  private get cwlSeasons(): CocCwlSeasonRecord[] {
    const { clan } = this.data;
    this.cwl ??= generateMockCwlSeasons({ clanTag: clan.tag, clanName: clan.name, members: clan.members, now: new Date() });
    return this.cwl;
  }

  /** Raid Weekends in the API format. */
  private get raidSeasons(): CocCapitalRaidSeason[] {
    this.raids ??= generateMockRaidSeasons({ members: this.data.clan.members, now: new Date() });
    return this.raids;
  }

  /** Game seasons with the donations, in the backend format. */
  private get donationSeasons(): DonationSeason[] {
    this.donations ??= generateMockDonationSeasons({ members: this.data.clan.members, now: new Date() });
    return this.donations;
  }

  private respond<T>(value: T): Observable<T> {
    // structuredClone prevents components from accidentally mutating the shared dataset.
    return of(structuredClone(value)).pipe(delay(this.config.mockLatencyMs));
  }

  getClan(): Observable<Clan> {
    return this.respond(this.data.clan);
  }

  /** The clan itself, or a sister clan built from it (smaller, younger). */
  getClanByTag(tag: string): Observable<Clan> {
    if (tag === this.data.clan.tag) return this.getClan();
    const sister = SISTER_CLANS.find((s) => s.tag === tag);
    if (!sister) return throwError(() => new Error(`Clan ${tag} not found`));
    const red = sister.order === 'red';
    const clan = this.data.clan;
    return this.respond<Clan>({
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
      warLeague: red ? { id: 48000012, name: 'Crystal League I' } : { id: 48000009, name: 'Gold League I' },
    });
  }

  /** In the top 200 of its country, not worldwide. */
  getClanRanks(): Observable<ClanRanks> {
    return this.respond({ local: 27, global: null });
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

  /** Like the proxy: only ended wars with details enter the monthly history. */
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
      this.cwlSeasons.map((s) => ({ season: s.season, state: s.state === 'ended' ? ('ended' as const) : ('inWar' as const) })),
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
}
