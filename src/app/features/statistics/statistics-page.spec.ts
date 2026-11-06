import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { provideCocApiTest } from '../../testing/fixtures';
import { StatisticsPage } from './statistics-page';

describe('StatisticsPage', () => {
  function configure() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
  }

  async function render() {
    const fixture = TestBed.createComponent(StatisticsPage);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return fixture;
  }

  const averageValues = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('td.mat-column-averageStarsPerWar strong')).map((s) =>
      Number(s.textContent!.replace(',', '.')),
    );

  it('shows the ranking sorted by highest average stars per war', async () => {
    configure();
    const el = (await render()).nativeElement as HTMLElement;
    const averages = averageValues(el);
    expect(averages.length).toBeGreaterThan(5);
    expect(averages.every((m) => m <= 6)).toBe(true);
    expect([...averages].sort((a, b) => b - a)).toEqual(averages);
    expect(el.querySelector('td.mat-column-rank .pos--1')?.textContent?.trim()).toBe('1');
  });

  it('the minimum wars filter shrinks the ranking', async () => {
    configure();
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const all = el.querySelectorAll('table.ranking tr.mat-mdc-row').length;

    (fixture.componentInstance as unknown as { minWars: { set(v: number): void } }).minWars.set(10);
    await fixture.whenStable();
    const filtered = el.querySelectorAll('table.ranking tr.mat-mdc-row').length;
    expect(filtered).toBeLessThan(all);
  });

  it('lists the months in the period selector', async () => {
    configure();
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.querySelector('.period-selector')).not.toBeNull();
    expect(el.textContent).toContain('Classifica · Tutti i mesi');
  });

  it('explains that the history is empty when no wars have been recorded', async () => {
    configure();
    const api = TestBed.inject(CocApiService);
    vi.spyOn(api, 'getHistoryMonths').mockReturnValue(of([]));
    vi.spyOn(api, 'getHistoryPeriod').mockReturnValue(of({ period: 'all', updatedAt: null, wars: [], players: [] }));
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Lo storico è ancora vuoto');
  });
});
