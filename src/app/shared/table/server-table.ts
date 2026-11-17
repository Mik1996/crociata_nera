import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { TableQuery } from './table-filters';
import { TablePage } from './table-page';

/** What `<crn-table [source]>` reads from a table whose rows come from the backend. */
export interface TableSource<T> {
  /** Rows of the page shown (the last page received while the next one loads). */
  readonly rows: Signal<readonly T[]>;
  /** Rows matching the filters, on every page. */
  readonly total: Signal<number>;
  /** A request is running (or none has answered yet). */
  readonly loading: Signal<boolean>;
  /** Error of the last request; `undefined` when it succeeded. */
  readonly error: Signal<unknown>;
  /**
   * What the rows come from besides the table (a season, a period…): when it changes the table
   * goes back to its first page.
   */
  readonly scope: Signal<unknown>;
  changeQuery(query: TableQuery): void;
  reload(): void;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Rows of a `<crn-table>` filtered, sorted and paged by the backend. The table asks for its first
 * page as soon as it shows (with its sort, page size and filters), then for a new page at every
 * change; `params` (a season, a period…) are sent along, and a change of them asks for the first
 * page again. While a request runs the last page stays in the table, which shows that it is
 * loading. Create it in an injection context (a field of a component).
 *
 * ```ts
 * protected readonly wars = serverTable({
 *   params: () => this.season(),
 *   load: (query, season) => this.api.getSeasonWars(season, query),
 * });
 * ```
 * ```html
 * <crn-table [source]="wars" [columns]="columns" [filters]="filters" matSort …>
 * ```
 */
export class ServerTable<T, S = undefined, P = null> implements TableSource<T> {
  /** What the table asked for last; `null` until it asks. */
  private readonly asked = signal<TableQuery | null>(null, { equal: sameJson });
  readonly scope: Signal<P | undefined>;
  /** The table's query, back to the first page when the parameters change. */
  readonly query: Signal<TableQuery | null>;
  private readonly resource;
  /** The last page received: it stays while the next one loads. */
  readonly page: Signal<TablePage<T, S> | undefined>;

  readonly rows = computed<readonly T[]>(() => this.page()?.items ?? []);
  readonly total = computed(() => this.page()?.total ?? 0);
  /** What the backend says besides the rows (totals, options of the filters…). */
  readonly summary = computed(() => this.page()?.summary);
  /** A page was received (for the parameters asked or earlier ones). */
  readonly loaded = computed(() => this.page() !== undefined);
  readonly loading: Signal<boolean>;
  readonly error: Signal<unknown>;

  constructor(options: {
    /** Parameters of the request besides the table's query; `undefined`: nothing to load yet. */
    params?: () => P | undefined;
    load: (query: TableQuery, params: P) => Observable<TablePage<T, S>>;
  }) {
    const params = options.params ?? (() => null as P);
    this.scope = computed(params, { equal: sameJson });
    this.query = linkedSignal<
      { params: P | undefined; asked: TableQuery | null },
      TableQuery | null
    >({
      source: () => ({ params: this.scope(), asked: this.asked() }),
      computation: ({ params, asked }, previous) =>
        // New parameters: the first page (the table goes back to it too).
        asked && previous && !sameJson(previous.source.params, params)
          ? { ...asked, pageIndex: 0 }
          : asked,
      equal: sameJson,
    });
    this.resource = rxResource({
      params: () => {
        const query = this.query();
        const extra = this.scope();
        return query && extra !== undefined ? { query, extra } : undefined;
      },
      stream: ({ params: { query, extra } }) => options.load(query, extra as P),
    });
    this.page = linkedSignal<TablePage<T, S> | undefined, TablePage<T, S> | undefined>({
      source: () => (this.resource.hasValue() ? this.resource.value() : undefined),
      computation: (page, previous) => page ?? previous?.value,
    });
    this.loading = computed(
      () => this.resource.isLoading() || (!this.loaded() && !this.resource.error()),
    );
    this.error = computed(() => this.resource.error());
  }

  changeQuery(query: TableQuery): void {
    this.asked.set(query);
  }

  reload(): void {
    this.resource.reload();
  }

  /** Changes the page shown (e.g. a row updated or deleted by the user). */
  update(change: (page: TablePage<T, S>) => TablePage<T, S>): void {
    this.resource.update((page) => page && change(page));
  }
}

/** {@link ServerTable} for a component field. */
export function serverTable<T, S = undefined, P = null>(
  options: ConstructorParameters<typeof ServerTable<T, S, P>>[0],
): ServerTable<T, S, P> {
  return new ServerTable<T, S, P>(options);
}
