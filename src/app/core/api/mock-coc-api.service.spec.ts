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

  it('gives the welcome page the clan and its sister clans, members by name and role only', async () => {
    const welcome = await firstValueFrom(api.getWelcome());
    const own = await firstValueFrom(api.getClan());
    expect(welcome.clan.name).toBe(own.name);
    expect(welcome.sisters.map((c) => [c.tag, c.name])).toEqual(
      SISTER_CLANS.map((s) => [s.tag, s.name]),
    );
    for (const clan of [welcome.clan, ...welcome.sisters]) {
      expect(clan.members.length).toBeLessThanOrEqual(50);
      expect(Object.keys(clan.members[0]).sort()).toEqual(['name', 'role']);
    }
    expect(welcome.ranks).toEqual({ local: 27, global: null });
  });
});
