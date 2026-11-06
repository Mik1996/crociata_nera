import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { PlayerService } from './player.service';

describe('PlayerService', () => {
  function create(statsWindow = 20): PlayerService {
    TestBed.configureTestingModule({ providers: [provideCocApiTest({ statsWindow })] });
    return TestBed.inject(PlayerService);
  }

  it('computes the stats for every clan member', async () => {
    const service = create();
    const [members, stats] = await Promise.all([
      firstValueFrom(service.getMembers()),
      firstValueFrom(service.getMembersStats()),
    ]);
    expect(stats).toHaveLength(members.length);
    for (const s of stats) {
      expect(s.warsTotal).toBe(20);
      expect(s.attacksUsed).toBeLessThanOrEqual(s.attacksAvailable);
      expect(s.attendance).toBeGreaterThanOrEqual(0);
      expect(s.attendance).toBeLessThanOrEqual(100);
    }
  });

  it('honours the configured war window', async () => {
    const stats = await firstValueFrom(create(5).getMembersStats());
    expect(stats.every((s) => s.warsTotal === 5 && s.warsPlayed <= 5)).toBe(true);
  });

  it('excludes wars known only from the war log (without details)', async () => {
    // The mock has 24 ended wars, the 4 oldest of which have no details.
    const stats = await firstValueFrom(create(100).getMembersStats());
    expect(stats.every((s) => s.warsTotal === 20)).toBe(true);
  });

  it('returns a player profile or null when the tag does not exist', async () => {
    const service = create();
    const [first] = await firstValueFrom(service.getMembers());
    expect((await firstValueFrom(service.getPlayerStats(first.tag)))?.name).toBe(first.name);
    expect(await firstValueFrom(service.getPlayerStats('#DOESNOTEXIST'))).toBeNull();
  });
});
