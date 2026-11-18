import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Subject } from 'rxjs';
import { serverTable } from './server-table';
import { Table } from './table';
import { TableFilters, TableQuery } from './table-filters';
import { TablePage } from './table-page';

interface Row {
  name: string;
}

interface Call {
  query: TableQuery;
  season: string;
  reply: Subject<TablePage<Row>>;
}

@Component({
  imports: [Table, MatTableModule, MatSortModule],
  template: `
    <crn-table
      [source]="wars"
      [columns]="columns"
      caption="Wars"
      [filters]="filters"
      [pageSize]="2"
      matSort
      matSortActive="name"
      matSortDirection="asc"
    >
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
        <td mat-cell *matCellDef="let r">{{ r.name }}</td>
      </ng-container>
      <tr mat-row *matRowDef="let r; columns: columns" class="host-row"></tr>
    </crn-table>
  `,
})
class Host {
  readonly columns = ['name'];
  readonly filters: TableFilters<Row> = { name: { type: 'text' } };
  readonly season = signal('2026-10');
  readonly calls: Call[] = [];
  readonly wars = serverTable({
    params: () => this.season(),
    load: (query: TableQuery, season: string) => {
      const reply = new Subject<TablePage<Row>>();
      this.calls.push({ query, season, reply });
      return reply;
    },
  });
}

describe('ServerTable in a table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  /** Runs change detection twice: the table asks, then shows what it got. */
  const render = async () => {
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
  };
  /** The backend answers the request `index`. */
  const answer = async (index: number, names: string[], total = names.length) => {
    const { reply, query } = host.calls[index];
    reply.next({
      items: names.map((name) => ({ name })),
      total,
      page: query.pageIndex + 1,
      limit: 2,
    });
    reply.complete();
    await fixture.whenStable();
  };
  const names = () =>
    Array.from(el.querySelectorAll('tbody tr.host-row td')).map((td) => td.textContent!.trim());

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await render();
  });

  it("asks for the first page with the table's sort and size, showing that it loads", async () => {
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0].query).toEqual({
      filters: {},
      pageIndex: 0,
      pageSize: 2,
      sort: { active: 'name', direction: 'asc' },
    });
    expect(host.calls[0].season).toBe('2026-10');
    expect(el.querySelector('crn-table')!.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.crn-table__loading-text')!.textContent).toContain('Caricamento');
    expect(el.querySelector('mat-progress-bar')).not.toBeNull();

    await answer(0, ['Alfa', 'Beta'], 5);
    expect(names()).toEqual(['Alfa', 'Beta']);
    expect(el.querySelector('mat-progress-bar')).toBeNull();
    expect(el.querySelector('crn-table')!.classList).not.toContain('crn-table--loading');
    expect(el.querySelector('mat-paginator')).not.toBeNull();
  });

  it('keeps the rows (dimmed) while the next page loads, and goes back to the first page for a new season', async () => {
    await answer(0, ['Alfa', 'Beta'], 5);
    el.querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    await render();
    expect(host.calls).toHaveLength(2);
    expect(host.calls[1].query.pageIndex).toBe(1);
    expect(names()).toEqual(['Alfa', 'Beta']);
    expect(el.querySelector('crn-table')!.classList).toContain('crn-table--loading');
    await answer(1, ['Gamma', 'Delta'], 5);
    expect(names()).toEqual(['Gamma', 'Delta']);

    host.season.set('2026-11');
    await render();
    // One request, for the first page of the new season.
    expect(host.calls).toHaveLength(3);
    expect(host.calls[2]).toMatchObject({ season: '2026-11', query: { pageIndex: 0 } });
    await answer(2, ['Epsilon']);
    expect(names()).toEqual(['Epsilon']);
  });

  it('says why the rows could not be loaded, and asks again on "Retry"', async () => {
    host.calls[0].reply.error(
      new HttpErrorResponse({
        status: 404,
        error: {
          result: null,
          messages: [{ key: 'ERROR.HISTORY_NOT_FOUND' }],
          status: { code: 404, name: 'HTTP_STATUS.NOT_FOUND' },
        },
      }),
    );
    await fixture.whenStable();
    const failure = el.querySelector('.crn-table__failure')!;
    expect(failure.getAttribute('role')).toBe('alert');
    expect(failure.textContent).toContain('Nessuna guerra registrata nel periodo.');

    failure.querySelector('button')!.click();
    await render();
    expect(host.calls).toHaveLength(2);
    await answer(1, ['Alfa']);
    expect(el.querySelector('.crn-table__failure')).toBeNull();
    expect(names()).toEqual(['Alfa']);
  });
});
