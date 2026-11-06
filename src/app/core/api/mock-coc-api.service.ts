import { inject, Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { generateMockData, MockDataset } from '../mock/mock-data';
import { mockPlayer } from '../mock/mock-player';
import { Clan, HistoryPeriod, HistoryWar, MonthSummary, PlayerProfile, War } from '../models';
import { historyPeriod, monthSummaries, toHistoryWar } from '../utils/monthly-history';
import { CocApiService } from './coc-api';
import { mapPlayerProfile } from './coc-api.mappers';

/** Mock implementation: locally generated data with simulated latency. */
@Injectable()
export class MockCocApiService extends CocApiService {
  private readonly config = inject(APP_CONFIG);
  private dataset?: MockDataset;

  private get data(): MockDataset {
    this.dataset ??= generateMockData({ clanTag: this.config.clanTag, clanName: this.config.clanName });
    return this.dataset;
  }

  private respond<T>(value: T): Observable<T> {
    // structuredClone prevents components from accidentally mutating the shared dataset.
    return of(structuredClone(value)).pipe(delay(this.config.mockLatencyMs));
  }

  getClan(): Observable<Clan> {
    return this.respond(this.data.clan);
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

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    const { clan } = this.data;
    const member = clan.members.find((m) => m.tag === tag);
    return this.respond(member ? mapPlayerProfile(mockPlayer(member, clan)) : null);
  }
}
