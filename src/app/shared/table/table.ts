import {
  AfterContentChecked,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  NgZone,
  OnInit,
  output,
  signal,
  untracked,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSort } from '@angular/material/sort';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MatColumnDef,
  MatFooterCellDef,
  MatNoDataRow,
  MatRowDef,
  MatTable,
  MatTableModule,
} from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { backendErrors } from '../../core/backend/backend-errors';
import { LanguageService } from '../../core/i18n/language.service';
import { Connectivity } from '../../core/pwa/connectivity';
import { errorMessage } from '../components/load-state';
import { ResizableColumns } from '../directives/resizable-columns';
import { TableHorizontalScroll } from '../directives/table-horizontal-scroll';
import { Icon } from '../icon/icon';
import { provideLocaleDateAdapter } from './locale-date-adapter';
import { wheelTarget } from './wheel-routing';
import {
  activeFilterValues,
  applyFilters,
  countActiveFilters,
  DayRange,
  emptyFilterValue,
  NumberRange,
  TableFilter,
  TableFilters,
  TableFilterType,
  TableFilterValue,
  TableFilterValueByType,
  TableQuery,
} from './table-filters';
import { TableSource } from './server-table';

/** Prefix of the columns of the filter row (one per column of the table). */
const FILTER_COLUMN = 'crn-filter:';

/** Rows the table is tall enough for, by default. */
const VISIBLE_ROWS = 10;

/** Pause after the last change of a filter before a server-side table asks for new rows. */
const FILTER_DELAY_MS = 300;

let nextId = 0;

/**
 * Data table of the site, built on `mat-table`: it never grows past the visible area (page or
 * `.page__scroll`), its rows scroll inside it, and the caption, the header, the filter row and the
 * footer stay in place. The caption shows the name of the table and a button that shows or hides
 * the filter row, with one filter per column by type (text, number range, date range, yes/no,
 * options). Columns can be resized (`ResizableColumns`).
 *
 * The page declares the columns and the data row as with a plain `mat-table`, inside the element;
 * sorting goes on the element too (`matSort`), and the page keeps sorting the data itself:
 *
 * ```html
 * <crn-table [data]="rows()" [columns]="columns" [caption]="title" [filters]="filters" matSort>
 *   <ng-container matColumnDef="name">
 *     <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
 *     <td mat-cell *matCellDef="let row">{{ row.name }}</td>
 *     <td mat-footer-cell *matFooterCellDef>…</td>   <!-- optional, with [footer]="true" -->
 *   </ng-container>
 *   <tr mat-row *matRowDef="let row; columns: columns" (click)="open(row)"></tr>   <!-- optional -->
 * </crn-table>
 * ```
 *
 * The filtered rows are `rows()` (`#table="crnTable"`), e.g. for totals in the footer.
 *
 * Rows filtered, sorted and paged by the backend come from a `ServerTable` (`[source]`): the table
 * asks it for the rows to show at every change, and shows while they load (a bar under the header,
 * the rows dimmed, a spinner when there are none yet) and when they fail (message and retry).
 */
@Component({
  selector: 'crn-table',
  exportAs: 'crnTable',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    TranslatePipe,
    Icon,
    ResizableColumns,
    TableHorizontalScroll,
  ],
  providers: [provideLocaleDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The cells come from the page's templates: they carry the page's style scope, not this one.
  // Every rule is scoped under `.crn-table` instead.
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'crn-table',
    '[class.crn-table--filters-open]': 'filtersOpen()',
    '[class.crn-table--loading]': 'isLoading()',
    '[attr.aria-busy]': 'isLoading()',
    '[style.--crn-table-area.px]': 'area()',
    '[style.--crn-table-caption-h.px]': 'captionHeight()',
    '[style.--crn-table-head-h.px]': 'headHeight()',
    '[style.--crn-table-filter-h.px]': 'filterHeight()',
    '[style.--crn-table-foot-h.px]': 'footHeight()',
    '[style.--crn-table-row-h.px]': 'rowHeight()',
    '[style.--crn-table-visible-rows]': 'visibleRows()',
    '[style.--crn-table-pager-h.px]': 'pagerHeight()',
  },
  templateUrl: './table.html',
  styleUrl: './table.scss',
})
export class Table<T> implements AfterContentChecked, OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  /** Rows, already sorted by the page (not used with `source`). */
  readonly data = input<readonly T[]>([]);
  /** Rows filtered, sorted and paged by the backend (a `ServerTable`): replaces `data`, `serverSide`, `total`, `loading`, `error`. */
  readonly source = input<TableSource<T> | null>(null);
  /** Ids of the columns shown, in order (the page's `matColumnDef`s). */
  readonly columns = input.required<readonly string[]>();
  /** Name of the table, shown in its caption. */
  readonly caption = input('');
  /** Filters by column id: columns without one get an empty cell in the filter row. */
  readonly filters = input<TableFilters<T>>({});
  /**
   * Shows the footer row (`*matFooterCellDef` of the columns; empty cells for the others), while
   * there are rows: totals of no rows mean nothing.
   */
  readonly footer = input(false);
  /** Filter row shown. */
  readonly filtersOpen = model(false);
  /**
   * Rows the table is tall enough for (besides caption, header, filters and footer): more rows
   * scroll, fewer leave empty room below the last one.
   */
  readonly visibleRows = input(VISIBLE_ROWS);
  /**
   * Rows per page, for tables that keep growing (e.g. every war ever fought); `null` (default)
   * shows every row. Pages come after the filters and the page's sorting.
   */
  readonly pageSize = input<number | null>(null);
  /**
   * The backend filters, sorts and pages the rows: the table shows `data` as it is (one page)
   * and asks for the rows to show with `queryChange`; `total` is the number of matching rows.
   */
  readonly serverSide = input(false);
  /** Rows matching the filters on the backend (`serverSide`). */
  readonly total = input<number | null>(null);
  /** Filters, page and sort to ask the backend for (`serverSide`; text filters after a pause). */
  readonly queryChange = output<TableQuery>();
  /** The rows are loading (`serverSide`). */
  readonly loading = input(false);
  /** The rows could not be loaded (`serverSide`): the table shows why, with a retry button. */
  readonly error = input<unknown>(undefined);
  /** "Retry" pressed, or the network came back after an error. */
  readonly retry = output<void>();

  private readonly columnDefs = contentChildren(MatColumnDef, { descendants: true });
  protected readonly rowDefs = contentChildren(MatRowDef, { descendants: true });
  private readonly noDataRow = contentChild(MatNoDataRow);

  @ViewChild(MatTable, { static: true }) private table!: MatTable<T>;
  @ViewChild(MatFooterCellDef, { static: true }) private emptyFooterCell!: MatFooterCellDef;

  private readonly language = inject(LanguageService);

  /** Rows come from the backend. */
  protected readonly isServer = computed(() => this.serverSide() || this.source() !== null);
  /** Rows given to the table (the page received, server-side). */
  private readonly given = computed(() => this.source()?.rows() ?? this.data());
  protected readonly isLoading = computed(() => this.source()?.loading() ?? this.loading());
  protected readonly failure = computed(() => {
    const source = this.source();
    return source ? source.error() : this.error();
  });
  /** Why the rows could not be loaded. */
  protected readonly failureText = computed(() => {
    const error = this.failure();
    if (!error) return '';
    if (error instanceof HttpErrorResponse) {
      const [first] = backendErrors(error).general;
      if (first) return this.language.t(first.key, first.params);
    }
    return errorMessage(error, (key, params) =>
      this.language.t(key, params as Record<string, unknown>),
    );
  });

  protected readonly filterRowId = `crn-table-filters-${nextId++}`;
  protected readonly filterColumns = computed(() => this.columns().map((c) => FILTER_COLUMN + c));
  protected readonly hasFilters = computed(() =>
    Object.values(this.filters()).some((filter) => !!filter),
  );

  /** What the user entered, by column. */
  readonly filterValues = signal<Readonly<Record<string, TableFilterValue>>>({});
  /** Columns whose filter restricts the rows. */
  readonly activeFilters = computed(() => countActiveFilters(this.filters(), this.filterValues()));
  /** Rows passing the filters (every page); server-side, the rows received. */
  readonly rows = computed(() =>
    this.isServer()
      ? this.given()
      : applyFilters(this.given(), this.filters(), this.filterValues()),
  );
  /** Rows matching the filters, on every page. */
  protected readonly matching = computed(() =>
    this.isServer()
      ? (this.source()?.total() ?? this.total() ?? this.given().length)
      : this.rows().length,
  );

  /** `matSort` on the element: server-side, the sort goes into the query. */
  private readonly sort = inject(MatSort, { optional: true, self: true });
  private readonly sortState = signal<TableQuery['sort']>(
    { active: '', direction: '' },
    { equal: (a, b) => a.active === b.active && a.direction === b.direction },
  );
  /** Active filters, server-side after a pause (no request for every key pressed). */
  private readonly settledFilters = signal<Record<string, TableFilterValue>>(
    {},
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  /** Page shown, back to the first one when the rows change (new data, sorting or filters). */
  protected readonly pageIndex = linkedSignal({
    source: () =>
      this.isServer()
        ? {
            filters: this.settledFilters(),
            sort: this.sortState(),
            size: this.pageSize(),
            scope: this.source()?.scope(),
          }
        : { rows: this.rows(), size: this.pageSize() },
    computation: () => 0,
  });
  /** Rows chosen in the paginator (it starts at `pageSize`). */
  protected readonly chosenPageSize = linkedSignal(() => this.pageSize());
  protected readonly pageSizeOptions = computed(() => {
    const size = this.pageSize();
    return size ? [size, size * 2, size * 4] : [];
  });
  /** Rows of the page shown (all the rows without pages); none after an error (the message shows). */
  protected readonly pageRows = computed(() => {
    if (this.failure()) return [];
    const size = this.chosenPageSize();
    if (!size || this.isServer()) return this.rows();
    const start = this.pageIndex() * size;
    return this.rows().slice(start, start + size);
  });

  /** Texts of the number fields by `column:bound`. */
  private readonly boundTexts = signal<Readonly<Record<string, string>>>({});

  /** Header labels by column, for the names of the filter fields. */
  protected readonly labels = signal<Readonly<Record<string, string>>>({});

  /** Height of the scrolling area the table lives in. */
  protected readonly area = signal<number | null>(null);
  protected readonly captionHeight = signal(0);
  protected readonly headHeight = signal(0);
  protected readonly filterHeight = signal(0);
  protected readonly footHeight = signal(0);
  protected readonly pagerHeight = signal(0);
  /** Average height of the first rows, measured without filters; `null` until there are rows. */
  protected readonly rowHeight = signal<number | null>(null);

  private readonly registeredColumns = new Set<MatColumnDef>();
  private readonly registeredRows = new Set<MatRowDef<unknown>>();

  /** What the backend is asked for (`serverSide`). */
  private readonly query = computed<TableQuery>(
    () => ({
      filters: this.settledFilters(),
      pageIndex: this.pageIndex(),
      pageSize: this.chosenPageSize() ?? 0,
      sort: this.sortState(),
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    effect((onCleanup) => {
      if (!this.isServer()) return;
      const active = activeFilterValues(this.filters(), this.filterValues());
      // Filters emptied: at once (also the first query, without filters).
      if (!Object.keys(active).length) {
        this.settledFilters.set(active);
        return;
      }
      const timer = setTimeout(() => this.settledFilters.set(active), FILTER_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      if (!this.isServer()) return;
      const query = this.query();
      untracked(() => {
        this.source()?.changeQuery(query);
        this.queryChange.emit(query);
      });
    });
    // After an error, the rows are asked again as soon as the network comes back.
    const connectivity = inject(Connectivity);
    let seen = connectivity.reconnections();
    effect(() => {
      const reconnections = connectivity.reconnections();
      if (reconnections === seen) return;
      seen = reconnections;
      if (untracked(this.failure)) untracked(() => this.retryLoad());
    });
    afterNextRender(() =>
      zone.runOutsideAngular(() => {
        this.observeLayout(destroyRef);
        this.routeWheel(destroyRef);
      }),
    );
  }

  ngOnInit(): void {
    const sort = this.sort;
    if (!sort) return;
    const read = () =>
      this.sortState.set({ active: sort.active ?? '', direction: sort.direction ?? '' });
    read();
    sort.sortChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(read);
  }

  /** Hands the page's columns and rows to the inner table before it renders. */
  ngAfterContentChecked(): void {
    for (const def of this.registeredColumns) {
      if (!this.columnDefs().includes(def)) {
        this.table.removeColumnDef(def);
        this.registeredColumns.delete(def);
      }
    }
    for (const def of this.columnDefs()) {
      // The footer row lists every column: the ones without a footer cell get an empty one.
      def.footerCell ??= this.emptyFooterCell;
      if (this.registeredColumns.has(def)) continue;
      this.table.addColumnDef(def);
      this.registeredColumns.add(def);
    }
    for (const def of this.registeredRows) {
      if (!this.rowDefs().includes(def)) {
        this.table.removeRowDef(def as MatRowDef<T>);
        this.registeredRows.delete(def);
      }
    }
    for (const def of this.rowDefs()) {
      if (this.registeredRows.has(def)) continue;
      this.table.addRowDef(def as MatRowDef<T>);
      this.registeredRows.add(def);
    }
    this.table.setNoDataRow(this.noDataRow() ?? null);
  }

  protected filterOf(column: string): TableFilter<T> | undefined {
    return this.filters()[column];
  }

  protected valueOf<K extends TableFilterType>(column: string, type: K): TableFilterValueByType[K] {
    return (this.filterValues()[column] ?? emptyFilterValue(type)) as TableFilterValueByType[K];
  }

  protected setValue(column: string, value: TableFilterValue): void {
    this.filterValues.update((values) => ({ ...values, [column]: value }));
  }

  /** Text typed in a number field, kept as is (a decimal comma is never rewritten as a dot). */
  protected boundText(column: string, bound: keyof NumberRange): string {
    return this.boundTexts()[`${column}:${bound}`] ?? '';
  }

  protected setBound(column: string, bound: keyof NumberRange, text: string): void {
    this.boundTexts.update((texts) => ({ ...texts, [`${column}:${bound}`]: text }));
    const range = this.valueOf(column, 'number');
    this.setValue(column, { ...range, [bound]: parseNumber(text) });
  }

  protected setDay(column: string, bound: keyof DayRange, date: Date | null): void {
    this.setValue(column, {
      ...this.valueOf(column, 'date'),
      [bound]: date ? toIsoDay(date) : null,
    });
  }

  /** Date of a day of a date filter, for the date fields. */
  protected toDate(day: string | null): Date | null {
    const match = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
    return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
  }

  /** Empties every filter. */
  clearFilters(): void {
    this.filterValues.set({});
    this.boundTexts.set({});
  }

  protected changePage(event: PageEvent): void {
    this.chosenPageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
    // The new page starts from its first row.
    const box = this.element.querySelector<HTMLElement>('.crn-table__scroll');
    if (box) box.scrollTop = 0;
  }

  /** Asks the rows again after an error. */
  protected retryLoad(): void {
    this.source()?.reload();
    this.retry.emit();
  }

  protected toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  protected booleanKey(value: boolean | null): string {
    return value === null ? 'any' : value ? 'yes' : 'no';
  }

  protected parseBoolean(key: string): boolean | null {
    return key === 'yes' ? true : key === 'no' ? false : null;
  }

  /**
   * Keeps the table within its scrolling area (its height, for `max-height`) and measures the
   * caption and the header row, which the filter row sticks below.
   */
  private observeLayout(destroyRef: DestroyRef): void {
    const tableElement = this.element.querySelector('table');
    const caption = this.element.querySelector('caption');
    const head = this.element.querySelector('thead');
    // Not available in every environment (e.g. some test DOMs): the sizes are then measured once.
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    // The scrolling area is looked up at every measure: the table may be rendered before it is
    // attached to the page (e.g. projected by <crn-load-state> while loading).
    let scroller: HTMLElement | null = null;

    const box = this.element.querySelector<HTMLElement>('.crn-table__scroll');
    // Last row of the body: takes the room left below the rows, so the footer stays at the bottom.
    const filler = document.createElement('tr');
    filler.className = 'crn-table__filler';
    filler.setAttribute('aria-hidden', 'true');
    const fillerCell = filler.appendChild(document.createElement('td'));
    // Rows are measured again when their number or the width of the table changes, not when they
    // are sorted or filtered: the height of the table stays the same.
    let rowsKey = '';

    const measure = () => {
      const current = scrollingAncestor(this.element);
      if (current !== scroller) {
        if (scroller) resize?.unobserve(scroller);
        if (current) resize?.observe(current);
        scroller = current;
      }
      this.area.set(scroller ? scroller.clientHeight : window.innerHeight);
      this.captionHeight.set(caption?.getBoundingClientRect().height ?? 0);
      this.headHeight.set(
        head?.querySelector('tr:first-child')?.getBoundingClientRect().height ?? 0,
      );
      this.filterHeight.set(
        head?.querySelector('.crn-table__filter-row')?.getBoundingClientRect().height ?? 0,
      );
      this.footHeight.set(
        tableElement?.querySelector('tfoot tr')?.getBoundingClientRect().height ?? 0,
      );
      this.pagerHeight.set(
        this.element.querySelector('.crn-table__paginator')?.getBoundingClientRect().height ?? 0,
      );
      if (tableElement && box) {
        const key = `${this.given().length}:${tableElement.offsetWidth}`;
        if (this.measureRows(tableElement, key !== rowsKey)) rowsKey = key;
        fillBody(tableElement, box, filler, fillerCell, this.columns().length);
      }
      const labels = this.readLabels();
      if (JSON.stringify(labels) !== JSON.stringify(this.labels())) this.labels.set(labels);
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    // The table also resizes when it is attached to the page.
    // The scrolling box: its height follows the measures, then the filler follows the box.
    for (const node of [tableElement, caption, head, box]) if (node) resize?.observe(node);
    // Header labels changed (language switched, columns changed): new names for the filter fields.
    const mutations = new MutationObserver(schedule);
    if (head) mutations.observe(head, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule, { passive: true });
    destroyRef.onDestroy(() => {
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    });
    measure();
  }

  /**
   * Wheel and touchpad over the table: the page scrolls until the table is entirely in view, then
   * the table, then the page again as soon as the table reaches its top or bottom (`wheelTarget`).
   * Touch scrolling is left to the browser, which hands it to the page at the edges by itself.
   */
  private routeWheel(destroyRef: DestroyRef): void {
    const box = this.element.querySelector<HTMLElement>('.crn-table__scroll');
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      // Pinch zoom, and sideways movements (the table scrolls them itself).
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const scroller = scrollingAncestor(this.element);
      const page = scroller ?? document.scrollingElement;
      if (!page) return;
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * page.clientHeight
            : event.deltaY;
      const view = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const rect = box.getBoundingClientRect();
      const inView = rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1;
      if (wheelTarget(delta, box, page, inView) !== 'page') return;
      event.preventDefault();
      page.scrollTop += delta;
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    destroyRef.onDestroy(() => box.removeEventListener('wheel', onWheel));
  }

  /**
   * Average height of the first rows (up to `visibleRows`), measured only while they are all shown
   * and when `changed` (or never measured). Returns whether it measured.
   */
  private measureRows(table: HTMLTableElement, changed: boolean): boolean {
    if (this.activeFilters() > 0 || (!changed && this.rowHeight() !== null)) return false;
    const rows = Array.from(
      table.querySelectorAll<HTMLElement>('tbody > tr.mat-mdc-row:not(.crn-table__no-data)'),
    ).slice(0, this.visibleRows());
    if (!rows.length) return false;
    const height = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    this.rowHeight.set(Math.round((height / rows.length) * 10) / 10);
    return true;
  }

  /** Text of the header cells by column id (same order as the columns). */
  private readLabels(): Record<string, string> {
    const labels: Record<string, string> = {};
    const cells = this.element.querySelectorAll<HTMLElement>('thead tr:first-child > th');
    this.columns().forEach((column, i) => {
      const text = cells[i]?.textContent?.replace(/\s+/g, ' ').trim();
      if (text) labels[column] = text;
    });
    return labels;
  }
}

/** Local day of a date, as `YYYY-MM-DD`. */
function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Number typed by the user (decimal comma or dot); `null` when empty or not a number. */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized === '-') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/**
 * Gives the room left below the rows (the scrolling area is taller than the table when there are
 * few rows) to the filler row at the end of the body, or to the "no rows" message, which is then
 * centred in the table.
 */
function fillBody(
  table: HTMLTableElement,
  box: HTMLElement,
  filler: HTMLTableRowElement,
  fillerCell: HTMLTableCellElement,
  columns: number,
): void {
  const body = table.tBodies[0];
  if (!body) return;
  // The table adds rows before its own markers, so the filler stays last.
  if (body.lastElementChild !== filler) body.appendChild(filler);
  fillerCell.colSpan = Math.max(1, columns);
  const empty = body.querySelector<HTMLElement>('.crn-table__empty');
  fillerCell.style.height = '0';
  if (empty) empty.style.height = '';
  const free = Math.max(0, Math.floor(box.clientHeight - table.offsetHeight));
  if (empty) empty.style.height = `${empty.offsetHeight + free}px`;
  else fillerCell.style.height = `${free}px`;
}

/** Nearest ancestor that scrolls vertically; `null` means the page itself. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}
