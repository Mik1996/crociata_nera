import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { provideCocApiTest } from '../../testing/fixtures';
import { CommendationService } from './commendation.service';

describe('CommendationService history', () => {
  afterEach(() => vi.useRealTimers());

  it("counts every medal earned over the saved periods (mock: the leader's golds)", async () => {
    // The mock seasons are generated around "now": a fixed date (a Wednesday, no Raid Weekend in
    // progress) keeps the counts stable whatever day the tests run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
    const service = TestBed.inject(CommendationService);
    const clan = await firstValueFrom(TestBed.inject(CocApiService).getClan());
    const leader = clan.members.find((m) => m.name === 'Templare Nero')!;

    const earned = await firstValueFrom(service.historyForPlayer(leader.tag));
    const counts = new Map(earned.map((c) => [c.id, c.quantity]));

    // About a year of completed months, all gold for the leader.
    expect(counts.get('champion-gold')).toBeGreaterThanOrEqual(10);
    expect(counts.get('champion-silver')).toBeUndefined();
    // Ended Raid Weekends with members (the mock keeps them for all but the two oldest; on a
    // weekend one more would be in progress, not counted yet) and ended CWL seasons.
    expect(counts.get('capitalRaider-gold')).toBe(8);
    expect(counts.get('cwlStriker-gold')).toBe(2);
    // The leader never misses a CWL attack: the legendary medal of every ended season.
    expect(counts.get('cwlAllAttacks-legendary')).toBe(2);
    // Five ended game seasons; November counts too, but on the 4th the leader has not reached a tier yet.
    expect(counts.get('donor-gold')).toBe(5);
  });

  it('shows the donor medal of the game season in progress, none until a tier is reached', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // The mock data is generated around "now" when the service is created.
    const leaderMedals = async (now: string) => {
      vi.setSystemTime(new Date(now));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
      const clan = await firstValueFrom(TestBed.inject(CocApiService).getClan());
      const leader = clan.members.find((m) => m.name === 'Templare Nero')!;
      return firstValueFrom(TestBed.inject(CommendationService).forPlayer(leader.tag));
    };

    // Early in the season: no donor medal, even if the last season had one.
    const early = await leaderMedals('2026-11-04T12:00:00Z');
    expect(early.donationSeason).toBe('2026-11');
    expect(early.items.some((c) => c.type === 'donor')).toBe(false);

    // Season almost over: the leader has donated past the gold threshold.
    const late = await leaderMedals('2026-11-30T20:00:00Z');
    expect(late.items).toContainEqual({ type: 'donor', tier: 'gold' });
  });

  it('with the backend, reads the commendations saved for the player (frozen when awarded)', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(CommendationService);

    const saved = firstValueFrom(service.historyForPlayer('#AAA111'));
    http.expectOne('/api/v1/players/%23AAA111').flush({
      result: { tag: '#AAA111', name: 'Alice', commendations: [{ id: '95000015', name: 'capitalRaider-gold', type: 'capitalRaider', tier: 'gold', quantity: 2 }] },
      messages: [],
      status: { code: 200 },
    });
    expect(await saved).toEqual([{ id: '95000015', name: 'capitalRaider-gold', type: 'capitalRaider', tier: 'gold', quantity: 2 }]);

    // A player never saved has no commendations.
    const none = firstValueFrom(service.historyForPlayer('#NEW'));
    http.expectOne('/api/v1/players/%23NEW').flush({ result: null, messages: [], status: { code: 404 } }, { status: 404, statusText: 'Not Found' });
    expect(await none).toEqual([]);
  });
});
