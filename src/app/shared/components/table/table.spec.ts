import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { parseNumber, Table } from './table';
import { TableFilters } from './table-filters';

interface Row {
  name: string;
  stars: number;
}

@Component({
  imports: [Table, MatTableModule, MatSortModule],
  template: `
    <crn-table
      #table="crnTable"
      [data]="rows()"
      [columns]="columns"
      caption="Members"
      [filters]="filters"
      [footer]="footer()"
      [visibleRows]="visibleRows()"
      [pageSize]="pageSize()"
      matSort
    >
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef mat-sort-header>Player</th>
        <td mat-cell *matCellDef="let r">{{ r.name }}</td>
      </ng-container>
      <ng-container matColumnDef="stars">
        <th mat-header-cell *matHeaderCellDef>Stars</th>
        <td mat-cell *matCellDef="let r">{{ r.stars }}</td>
        <td mat-footer-cell *matFooterCellDef>{{ table.rows().length }} shown</td>
      </ng-container>
      <tr mat-row *matRowDef="let r; columns: columns" class="host-row"></tr>
    </crn-table>
  `,
})
class Host {
  readonly columns = ['name', 'stars'];
  readonly rows = signal<Row[]>([
    { name: 'Alfa', stars: 3 },
    { name: 'Beta', stars: 1 },
    { name: 'Gamma', stars: 2 },
  ]);
  readonly filters: TableFilters<Row> = { name: { type: 'text' }, stars: { type: 'number' } };
  readonly footer = signal(false);
  readonly visibleRows = signal(10);
  readonly pageSize = signal<number | null>(null);
}

describe('Table', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = async (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const names = () =>
      Array.from(el.querySelectorAll('tbody tr.host-row td:first-child')).map((td) =>
        td.textContent!.trim(),
      );
    return { fixture, el, type, names };
  }

  it("renders the page's columns and rows, with the name in the caption", async () => {
    const { el, names } = await setup();
    expect(el.querySelector('caption')!.textContent).toContain('Members');
    expect(
      Array.from(el.querySelectorAll('thead tr:first-child th')).map((th) =>
        th.textContent!.trim(),
      ),
    ).toEqual(['Player', 'Stars']);
    expect(names()).toEqual(['Alfa', 'Beta', 'Gamma']);
    // Sort headers of the page find the `matSort` on the element.
    expect(el.querySelector('thead th .mat-sort-header-container')).not.toBeNull();
  });

  it('shows and hides the filter row from the caption button', async () => {
    const { fixture, el } = await setup();
    const toggle = el.querySelector<HTMLButtonElement>('.crn-table__toggle')!;
    const row = el.querySelector<HTMLElement>('.crn-table__filter-row')!;
    expect(row.classList).toContain('crn-table__filter-row--hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(row.id);

    toggle.click();
    await fixture.whenStable();
    expect(row.classList).not.toContain('crn-table__filter-row--hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('filters the rows by text and by number range, and clears the filters', async () => {
    const { fixture, el, type, names } = await setup();
    const inputs = el.querySelectorAll<HTMLInputElement>('.crn-table__filter-row input');
    expect(inputs[0].getAttribute('aria-label')).toBe('Filtra per Player');

    await type(inputs[0], 'a');
    expect(names()).toEqual(['Alfa', 'Beta', 'Gamma']);
    await type(inputs[1], '1,5');
    expect(names()).toEqual(['Alfa', 'Gamma']);
    // The typed text stays as typed (decimal comma).
    expect(inputs[1].value).toBe('1,5');
    await type(inputs[2], '2');
    expect(names()).toEqual(['Gamma']);
    expect(el.querySelector('.crn-table__count')!.textContent).toContain('1 di 3');
    expect(el.querySelector('.crn-table__badge')!.textContent!.trim()).toBe('2');

    await type(inputs[0], 'zzz');
    expect(names()).toEqual([]);
    expect(el.querySelector('.crn-table__empty')!.textContent).toContain(
      'Nessun risultato per i filtri impostati.',
    );

    el.querySelector<HTMLButtonElement>('.crn-table__clear')!.click();
    await fixture.whenStable();
    expect(names()).toEqual(['Alfa', 'Beta', 'Gamma']);
    expect(inputs[1].value).toBe('');
  });

  it('shows the footer row on request, with empty cells for the columns without one', async () => {
    const { fixture, el } = await setup();
    const footer = el.querySelector<HTMLElement>('tfoot tr')!;
    expect(footer.classList).toContain('crn-table__footer-row--hidden');

    fixture.componentInstance.footer.set(true);
    await fixture.whenStable();
    const cells = Array.from(footer.querySelectorAll('td')).map((td) => td.textContent!.trim());
    expect(footer.classList).not.toContain('crn-table__footer-row--hidden');
    expect(cells).toEqual(['', '3 shown']);
  });

  it('is as tall as 10 rows by default, or as many as asked', async () => {
    const { fixture, el } = await setup();
    const host = el.querySelector<HTMLElement>('crn-table')!;
    expect(host.style.getPropertyValue('--crn-table-visible-rows')).toBe('10');

    fixture.componentInstance.visibleRows.set(8);
    await fixture.whenStable();
    expect(host.style.getPropertyValue('--crn-table-visible-rows')).toBe('8');
  });

  it('shows pages of rows when asked, back to the first page when the rows change', async () => {
    const { fixture, el, type, names } = await setup();
    expect(el.querySelector('mat-paginator')).toBeNull();

    fixture.componentInstance.pageSize.set(2);
    await fixture.whenStable();
    expect(names()).toEqual(['Alfa', 'Beta']);
    el.querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    await fixture.whenStable();
    expect(names()).toEqual(['Gamma']);

    const inputs = el.querySelectorAll<HTMLInputElement>('.crn-table__filter-row input');
    await type(inputs[0], 'a');
    expect(names()).toEqual(['Alfa', 'Beta']);
    // One page only: no paginator.
    await type(inputs[0], 'alfa');
    expect(el.querySelector('mat-paginator')).toBeNull();
  });

  it('follows new data', async () => {
    const { fixture, names } = await setup();
    fixture.componentInstance.rows.set([{ name: 'Delta', stars: 0 }]);
    await fixture.whenStable();
    expect(names()).toEqual(['Delta']);
  });
});

describe('parseNumber', () => {
  it('reads decimal commas and dots, and nothing from empty or invalid text', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber(' 2.25 ')).toBe(2.25);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});
