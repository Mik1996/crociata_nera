import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { provideCocApiTest } from '../../testing/fixtures';
import { PlayerDetailPage } from './player-detail-page';

describe('PlayerDetailPage', () => {
  async function render(tag?: string) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const api = TestBed.inject(CocApiService);
    const member = (await firstValueFrom(api.getClan())).members[0];
    const fixture = TestBed.createComponent(PlayerDetailPage);
    fixture.componentRef.setInput('tag', tag ?? member.tag);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, member, fixture };
  }

  it('shows the game-style banner with name, Town Hall and experience level', async () => {
    const { el, member } = await render();
    expect(el.querySelector('#player-name')?.textContent).toContain(member.name);
    expect(el.querySelector('.banner__th-label')?.textContent).toContain(`Municipio ${member.townHall}`);
    expect(el.querySelector('app-xp-badge')?.getAttribute('aria-label')).toBe(`Livello esperienza ${member.expLevel}`);
  });

  it('offers the Profile, Army, Achievements, Wars and Commendations tabs, with heroes in the profile', async () => {
    const { el } = await render();
    const tabs = Array.from(el.querySelectorAll('.mdc-tab')).map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Profilo', 'Esercito', 'Obiettivi', 'Guerre', 'Encomi']);
    expect(el.querySelectorAll('.hero').length).toBeGreaterThan(0);
    expect(el.querySelector('.stat__label')?.textContent).toContain('Stelle di guerra');
  });

  it('explains when the player is not a clan member', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    vi.spyOn(TestBed.inject(CocApiService), 'getPlayer').mockReturnValue(of(null));
    const fixture = TestBed.createComponent(PlayerDetailPage);
    fixture.componentRef.setInput('tag', '#NOPE');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Giocatore non trovato');
  });
});
