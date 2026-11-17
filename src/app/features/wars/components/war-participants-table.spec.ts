import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/backend/auth.service';
import { WarService } from '../../../core/services/war.service';
import { participantRows } from '../../../core/utils/war-stats';
import { provideCocApiTest, sampleWar } from '../../../testing/fixtures';
import { participantFilters, participantSortKey } from '../../../shared/table/clan-tables';
import { Table } from '../../../shared/table/table';
import { TableFilterValues, TableQuery } from '../../../shared/table/table-filters';
import { applyTableQuery } from '../../../shared/table/table-page';
import { WarParticipantsTable } from './war-participants-table';

/** The backend's answer: the players of the sample war, filtered and sorted as asked. */
function participantsTable(warId: string, query: TableQuery) {
  const rows = warId === sampleWar().id ? participantRows(sampleWar()) : [];
  const summary = { townHalls: [...new Set(rows.map((r) => r.townHall))].sort((a, b) => b - a) };
  return of(
    applyTableQuery(rows, participantFilters(summary), query, {
      sortKey: participantSortKey,
      summary: () => summary,
    }),
  );
}

describe('WarParticipantsTable', () => {
  let fixture: ComponentFixture<WarParticipantsTable>;

  /**
   * Sets the values of the filters of the table, as typed in its filter row, and waits for the
   * pause after which the table asks the backend for the matching rows.
   */
  const filter = async (values: TableFilterValues) => {
    const table = fixture.debugElement.query(By.directive(Table))
      .componentInstance as Table<unknown>;
    table.filterValues.set(values as Record<string, never>);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();
  };

  const visibleNames = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tr.mat-mdc-row .cn-link-cell'),
    ).map((a) => a.textContent?.trim());

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
        { provide: WarService, useValue: { getParticipantsTable: participantsTable } },
      ],
    });
    fixture = TestBed.createComponent(WarParticipantsTable);
    fixture.componentRef.setInput('warId', sampleWar().id);
    fixture.componentRef.setInput('inProgress', true);
    await fixture.whenStable();
  });

  it('shows all participants sorted by map position', () => {
    expect(visibleNames()).toEqual(['Player #A', 'Player #B', 'Player #C']);
  });

  it('highlights players who have not attacked yet', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.row-without-attacks');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Non ha ancora attaccato');
  });

  it('filters by name', async () => {
    await filter({ name: '#b' });
    expect(visibleNames()).toEqual(['Player #B']);
  });

  it('filters by town hall and by stars', async () => {
    await filter({ townHall: [16] });
    expect(visibleNames()).toEqual(['Player #A']);

    await filter({ stars: { min: 1, max: 1 } });
    expect(visibleNames()).toEqual(['Player #B']);
  });

  it('offers the town halls of the war in the filter', () => {
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as unknown as {
      filters(): { townHall: { options: { params: { n: number } }[] } };
    };
    expect(table.filters().townHall.options.map((o) => o.params.n)).toEqual([16, 15, 14]);
  });

  it('filters only players without attacks and shows a message when nothing matches', async () => {
    await filter({ attacks: false });
    expect(visibleNames()).toEqual(['Player #C']);

    await filter({ attacks: false, name: 'nobody' });
    expect(visibleNames()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Nessun risultato per i filtri impostati');
  });

  const signIn = async (players: { tag: string; verified: boolean }[]) => {
    TestBed.inject(AuthService).restoreSession();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/refresh')
      .flush({
        result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'b', players } },
        messages: [],
        status: { code: 200, name: 'HTTP_STATUS.OK' },
      });
    await fixture.whenStable();
  };

  const nameOf = (row: Element) => row.querySelector('.cn-link-cell')!.textContent!.trim();

  it('marks all the signed-in user\'s verified accounts with a "You" badge, keeping the attack colours while the war is in progress', async () => {
    await signIn([
      { tag: '#B', verified: true },
      { tag: '#C', verified: true },
      // Old unverified link: not marked as "you".
      { tag: '#A', verified: false },
    ]);

    const el = fixture.nativeElement as HTMLElement;
    const badged = [...el.querySelectorAll('tr.mat-mdc-row')].filter((r) =>
      r.querySelector('.cn-me-badge'),
    );
    expect(badged.map(nameOf)).toEqual(['Player #B', 'Player #C']);
    expect(badged[0].querySelector('.cn-me-badge')!.textContent!.trim()).toBe('Tu');
    expect(el.querySelector('tr.cn-row-me')).toBeNull();

    const without = el.querySelector('tr.row-without-attacks')!;
    expect(nameOf(without)).toBe('Player #C');
    expect(without.textContent).toContain('Non hai ancora attaccato');
    expect(without.textContent).not.toContain('Non ha ancora attaccato');
  });

  it("highlights the signed-in user's rows once the war has ended", async () => {
    fixture.componentRef.setInput('inProgress', false);
    await signIn([{ tag: '#B', verified: true }]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.cn-row-me');
    expect([...rows].map(nameOf)).toEqual(['Player #B']);
  });

  it('shows no attack status during the preparation day', async () => {
    fixture.componentRef.setInput('preparation', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tr.row-without-attacks, tr.row-partial-attacks')).toBeNull();
    expect(el.querySelector('.attack-status')).toBeNull();
  });
});
