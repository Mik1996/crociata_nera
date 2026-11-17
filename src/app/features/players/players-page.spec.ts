import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideCocApiTest } from '../../testing/fixtures';
import { MemberStatsRow } from '../../core/models';
import { PlayersPage } from './players-page';

describe('PlayersPage', () => {
  it('shows the league icon as first column, with its name as tooltip and alternative text', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(PlayersPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('th')!.textContent).toContain('Lega');
    const icon = el.querySelector<HTMLImageElement>(
      'tr.mat-mdc-row td:first-child img.league-icon',
    )!;
    expect(icon.getAttribute('src')).toMatch(/^game\/leagues\/.+\.webp$/);
    expect(icon.alt).toMatch(/League$/);
  });

  it('is sorted by default by league (highest first), then by trophies', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(PlayersPage);
    await fixture.whenStable();
    // Sorted by the backend (here the mock data, sorted the same way).
    const page = fixture.componentInstance as unknown as {
      members: { rows: () => MemberStatsRow[] };
    };
    const rows = page.members.rows();

    expect(rows.length).toBeGreaterThan(10);
    for (let i = 1; i < rows.length; i++) {
      const [prev, cur] = [rows[i - 1], rows[i]];
      const prevLeague = prev.league?.id ?? 0;
      const curLeague = cur.league?.id ?? 0;
      expect(
        prevLeague > curLeague || (prevLeague === curLeague && prev.trophies >= cur.trophies),
      ).toBe(true);
    }
    // The sort header shows the active column.
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('th[aria-sort]')
        ?.getAttribute('aria-sort'),
    ).toBe('descending');
  });

  it('shows the attendance as a bar and a percentage of its own, in every row', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(PlayersPage);
    await fixture.whenStable();
    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tr.mat-mdc-row .attendance'),
    );

    expect(cells.length).toBeGreaterThan(10);
    for (const cell of cells) {
      // The number has its own box (fixed width): the bars all get the same length.
      expect(cell.querySelector('crn-meter.attendance__bar')).not.toBeNull();
      expect(cell.querySelector('.attendance__value')!.textContent).toMatch(/^\d+%$/);
    }
  });
});
