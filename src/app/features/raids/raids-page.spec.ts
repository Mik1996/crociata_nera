import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideCocApiTest } from '../../testing/fixtures';
import { RaidsPage } from './raids-page';

describe('RaidsPage', () => {
  it('shows the weekend totals, the members by loot and who did not take part', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(RaidsPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
    const loot = Array.from(el.querySelectorAll('.members tr.mat-mdc-row td:last-child')).map((td) =>
      Number(td.textContent!.replace(/\D/g, '')),
    );
    expect(loot.length).toBeGreaterThan(10);
    expect([...loot].sort((a, b) => b - a)).toEqual(loot);
    expect(el.querySelector('#raid-absent-title')!.textContent).toContain('Non hanno partecipato');
  });

  it('for a weekend whose members were never saved, explains it instead of an empty table', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(RaidsPage);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as { weekends: () => { id: string }[]; changeWeekend: (id: string) => void };
    page.changeWeekend(page.weekends().at(-1)!.id);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.members')).toBeNull();
    expect(el.querySelector('.notice')!.textContent).toContain('Dettaglio dei membri non disponibile');
    // The totals of the weekend are still shown.
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
  });

  it('switching to another weekend shows its members', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(RaidsPage);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as { weekends: () => { id: string }[]; changeWeekend: (id: string) => void };
    page.changeWeekend(page.weekends()[1].id);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.weekend-state')!.textContent).toContain('30 ott');
    expect(el.querySelectorAll('.members tr.mat-mdc-row').length).toBeGreaterThan(10);
  });
});
