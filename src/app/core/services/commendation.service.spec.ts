import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { provideCocApiTest } from '../../testing/fixtures';
import { CommendationService } from './commendation.service';

describe('CommendationService history', () => {
  it("counts every medal earned over the saved periods (mock: the leader's golds)", async () => {
    TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
    const service = TestBed.inject(CommendationService);
    const clan = await firstValueFrom(TestBed.inject(CocApiService).getClan());
    const leader = clan.members.find((m) => m.name === 'Templare Nero')!;

    const earned = await firstValueFrom(service.historyForPlayer(leader.tag));
    const counts = new Map(earned.map((c) => [c.id, c.quantity]));

    // About a year of completed months, all gold for the leader.
    expect(counts.get('champion-gold')).toBeGreaterThanOrEqual(10);
    expect(counts.get('champion-silver')).toBeUndefined();
    // Raid Weekends with members (the mock keeps them for all but the two oldest) and ended CWL seasons.
    expect(counts.get('capitalRaider-gold')).toBe(7);
    expect(counts.get('cwlStriker-gold')).toBe(2);
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
