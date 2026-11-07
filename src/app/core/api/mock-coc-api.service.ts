import { inject, Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { generateMockData, MockDataset } from '../mock/mock-data';
import { generateMockCwlSeasons, generateMockRaidSeasons } from '../mock/mock-cwl';
import { mockPlayer } from '../mock/mock-player';
import { Clan, ClanRanks, CwlSeason, CwlSeasonSummary, HistoryPeriod, HistoryWar, MonthSummary, PlayerProfile, RaidSeason, War } from '../models';
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

  private respond<T>(value: T): Observable<T> {
    // structuredClone prevents components from accidentally mutating the shared dataset.
    return of(structuredClone(value)).pipe(delay(this.config.mockLatencyMs));
  }

  getClan(): Observable<Clan> {
    return this.respond(this.data.clan);
  }

  /** In the top 200 of its country, not worldwide. */
  getClanRanks(): Observable<ClanRanks> {
    return this.respond({ local: 27, global: null });
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

  getRaidSeasons(): Observable<RaidSeason[]> {
    return this.respond(this.raidSeasons.map(mapRaidSeason));
  }

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    const { clan } = this.data;
    const member = clan.members.find((m) => m.tag === tag);
    return this.respond(member ? mapPlayerProfile(mockPlayer(member, clan)) : null);
  }
}
