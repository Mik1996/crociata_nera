import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { SISTER_CLANS } from '../config/sister-clans';
import { Clan } from '../models';
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
    // The mock has 120 ended wars, the 4 oldest of which have no details.
    const stats = await firstValueFrom(create(500).getMembersStats());
    expect(stats.every((s) => s.warsTotal === 116)).toBe(true);
  });

  it('returns a player profile or null when the tag does not exist', async () => {
    const service = create();
    const [first] = await firstValueFrom(service.getMembers());
    expect((await firstValueFrom(service.getPlayerStats(first.tag)))?.name).toBe(first.name);
    expect(await firstValueFrom(service.getPlayerStats('#DOESNOTEXIST'))).toBeNull();
  });

  describe('getCrusadeMemberTags', () => {
    const clanWith = (clan: Clan, tags: string[]): Clan => ({
      ...clan,
      members: tags.map((tag, i) => ({ ...clan.members[0], tag, name: `P${i}` })),
    });

    it('joins the members of the three clans of the Crusade', async () => {
      const service = create();
      const api = TestBed.inject(CocApiService);
      const own = await firstValueFrom(api.getClan());
      vi.spyOn(api, 'getClan').mockReturnValue(of(clanWith(own, ['#BLACK'])));
      const byTag = vi
        .spyOn(api, 'getClanByTag')
        .mockImplementation((tag) => of(clanWith(own, [`#${tag === SISTER_CLANS[0].tag ? 'RED' : 'GOLD'}`])));

      const tags = await firstValueFrom(service.getCrusadeMemberTags());
      expect(byTag.mock.calls.map(([tag]) => tag)).toEqual(SISTER_CLANS.map((s) => s.tag));
      expect([...tags!].sort()).toEqual(['#BLACK', '#GOLD', '#RED']);
    });

    it('returns null when a member list cannot be read', async () => {
      const service = create();
      vi.spyOn(TestBed.inject(CocApiService), 'getClanByTag').mockReturnValue(
        throwError(() => new Error('down')),
      );
      expect(await firstValueFrom(service.getCrusadeMemberTags())).toBeNull();
    });
  });
});
