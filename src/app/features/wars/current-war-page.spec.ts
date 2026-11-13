import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { War } from '../../core/models';
import { provideCocApiTest } from '../../testing/fixtures';
import { CurrentWarPage } from './current-war-page';

describe('CurrentWarPage', () => {
  function configure() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
  }

  async function render() {
    const fixture = TestBed.createComponent(CurrentWarPage);
    await fixture.whenStable();
    // The resource emits after the first cycle: wait for a second stabilization round.
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows clan, opponent and participants of the current war', async () => {
    configure();
    const el = await render();
    expect(el.querySelector('app-war-summary')?.textContent).toContain('Crociata Nera');
    expect(el.querySelectorAll('tr.mat-mdc-row').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Non ha ancora attaccato');
  });

  it('puts the scoreboard in the scenic header, with bars of the stars earned out of the total', async () => {
    configure();
    const el = await render();
    const summary = el.querySelector('app-page-header app-war-summary')!;
    expect(summary.classList.contains('summary--scenic')).toBe(true);
    expect(el.querySelector('app-page-header')!.getAttribute('data-scene')).toBe('war');

    const war = (await new Promise<{ teamSize: number; clan: { stars: number }; opponent: { stars: number } } | null>((resolve) =>
      TestBed.inject(CocApiService).getCurrentWar().subscribe(resolve),
    ))!;
    const total = war.teamSize * 3;
    const bars = Array.from(summary.querySelectorAll<HTMLElement>('.bar'));
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      `${war.clan.stars} stelle su ${total}`,
      `${war.opponent.stars} stelle su ${total}`,
    ]);
    const widths = bars.map((b) => parseFloat(b.querySelector<HTMLElement>('.bar__fill')!.style.width));
    expect(widths[0]).toBeCloseTo((war.clan.stars / total) * 100, 3);
    expect(widths[1]).toBeCloseTo((war.opponent.stars / total) * 100, 3);
  });

  it('shows the badges of both clans, leaving out one that fails to load', async () => {
    configure();
    const api = TestBed.inject(CocApiService);
    const war = (await new Promise<War | null>((resolve) => api.getCurrentWar().subscribe(resolve)))!;
    vi.spyOn(api, 'getCurrentWar').mockReturnValue(
      of({
        ...war,
        clan: { ...war.clan, badgeUrl: 'https://example.test/ours.png' },
        opponent: { ...war.opponent, badgeUrl: 'https://example.test/theirs.png' },
      }),
    );
    const el = await render();
    const badges = () =>
      Array.from(el.querySelectorAll<HTMLImageElement>('app-war-summary .side__badge')).map((b) => b.src);
    expect(badges()).toEqual(['https://example.test/ours.png', 'https://example.test/theirs.png']);

    el.querySelector('app-war-summary .side--opponent .side__badge')!.dispatchEvent(new Event('error'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(badges()).toEqual(['https://example.test/ours.png']);
  });

  it('shows a message when the clan is not at war', async () => {
    configure();
    vi.spyOn(TestBed.inject(CocApiService), 'getCurrentWar').mockReturnValue(of(null));
    const el = await render();
    expect(el.textContent).toContain('non è attualmente in guerra');
  });

  it('shows the error state when the API fails', async () => {
    configure();
    vi.spyOn(TestBed.inject(CocApiService), 'getCurrentWar').mockReturnValue(
      throwError(() => new Error('API unreachable')),
    );
    const el = await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('API unreachable');
  });
});
