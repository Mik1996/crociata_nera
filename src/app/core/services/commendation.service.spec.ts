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

    const counts = await firstValueFrom(service.historyForPlayer(leader.tag));

    // About a year of completed months, all gold for the leader.
    expect(counts.get('champion-gold')).toBeGreaterThanOrEqual(10);
    expect(counts.get('champion-silver')).toBeUndefined();
    // Raid Weekends with members (the mock keeps them for all but the two oldest) and ended CWL seasons.
    expect(counts.get('capitalRaider-gold')).toBe(7);
    expect(counts.get('cwlStriker-gold')).toBe(2);
  });
});
