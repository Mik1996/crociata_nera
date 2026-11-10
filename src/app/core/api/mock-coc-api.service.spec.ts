import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { SISTER_CLANS } from '../config/sister-clans';
import { CocApiService } from './coc-api';

describe('MockCocApiService', () => {
  let api: CocApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
    api = TestBed.inject(CocApiService);
  });

  it('returns the sister clans by tag, with their own name and tag', async () => {
    for (const sister of SISTER_CLANS) {
      const clan = await firstValueFrom(api.getClanByTag(sister.tag));
      expect(clan.tag).toBe(sister.tag);
      expect(clan.name).toBe(sister.name);
      expect(clan.members.length).toBeLessThanOrEqual(50);
    }
  });

  it('returns the clan itself by its own tag and fails for unknown clans', async () => {
    const own = await firstValueFrom(api.getClan());
    expect((await firstValueFrom(api.getClanByTag(own.tag))).name).toBe(own.name);
    await expect(firstValueFrom(api.getClanByTag('#NOPE'))).rejects.toThrow('not found');
  });
});
