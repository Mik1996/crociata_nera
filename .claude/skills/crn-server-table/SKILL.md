---
name: crn-server-table
description: End-to-end recipe for a data table of Crociata Nera that the backend filters, sorts and pages — `defineTable`/`parseTableQuery`/`queryTable` in the backend, `tableQueryPart` in OpenAPI, shared column ids and filters in `clan-tables.ts`, the mock service's `applyTableQuery`, and `serverTable` + `<crn-table>` in the page. Use when adding a table, adding/renaming a column, filter, sort or footer total, or debugging a table whose filter, sort, paging or totals misbehave.
---

# Server-driven table

The rule (from `CLAUDE.md`): every data table is filtered, sorted and paged **by the backend**; only the
CWL group standings take plain `[data]`. Rows are built in memory per request (clan-sized data).
Reference implementation to mirror: the Raid Weekend members table.

| Layer | Raid members example |
|---|---|
| Row type + `defineTable` + list function | `backend/src/modules/raids/raid-members.table.ts` (`RAID_MEMBERS_TABLE`, `listRaidMembers`) |
| Route | `backend/src/app/api/v1/raids/seasons/[startTime]/members/route.ts` |
| OpenAPI | `backend/src/openapi/operations/tables.ts` + models in `openapi/models/tables.ts` |
| Shared filters (frontend) | `RAID_MEMBER_FILTERS` in `src/app/shared/components/table/clan-tables.ts` |
| HTTP + mock data access | `CocApiService` → `http-coc-api.service.ts` (private `table()` helper) / `mock-coc-api.service.ts` (`applyTableQuery`) |
| Page | `src/app/features/raids/raids-page.{ts,html}` (`serverTable`, `<crn-table [source]>`) |

Another full chain with page params: the period ranking (`history/[period]/ranking/route.ts`,
`RANKING_TABLE` in `modules/wars/history.tables.ts`, `statistics-page.ts` `ranking = serverTable({ params, load })`).

## Backend

1. Row interface (documented fields) and a function building **all** rows from saved data.
2. `defineTable<Row>({ col: { label, filter?, options?, value?, sort? }, … }, { sort, order })`
   (`lib/table/table-query.ts`). Filter types: `text | number | date | boolean | select`; `value` reads the
   filtered value (text may return several strings, e.g. name and tag); `sort: true` or a key function.
   The default sort must be a sortable column (it throws otherwise).
3. In the route: `parseTableQuery(request, TABLE)` (400 `INVALID_FIELD` on bad values), extra page params
   with `parseQuery(extraSchema)`, then `queryTable(rows, TABLE, query)` → `TablePage`.
   Positions (`rank`) are assigned **before** table filters so they do not change when filtering.
4. Totals, footers and filter options (e.g. leagues present) go in a `summary` next to the page,
   computed on the filtered rows when they are totals (`filterRows`).
5. `apiName: ApiName.TABLES_READ`, `clanAccess: true` (or the area's level).
6. OpenAPI: `query: tableQueryPart(TABLE, 'Rows noun', { schema: TABLE.schema.extend(extra.shape), fields })`
   (`backend/src/openapi/table.ts`); result model `TablePage`-shaped with the strict row and `summary`.
7. Tests in `backend/test/tables.test.ts` or the area's file: default sort, each filter type used, paging
   (`page`, `limit`, no `limit` = every row), invalid parameter → 400.

## Frontend

1. Row type in `src/app/core/models/table-rows.model.ts` (or backend types for backend-only data).
2. Filters in `clan-tables.ts`: **same column ids and filter types** as the backend definition. The
   `value` readers and sort keys there serve mock mode only.
3. Data access: method returning `Observable<TablePage<Row>>` on the service, query string from
   `tableQueryParams(query)` (`table-page.ts`), and the mock implementation using `applyTableQuery`.
4. Page: `protected readonly x = serverTable({ params: () => …signals…, load: (query, params) => … })`;
   a params change returns to page 1. Template: `<crn-table [source]="x" [filters]="X_FILTERS" …>` with
   `matColumnDef`s, optional `matSort`, footer cells (`*matFooterCellDef`) reading `summary`.
   "Your" rows: `[class.cn-row-me]="isMine(row.tag)"`. `visibleRows`/`pageSize` as needed.
5. PDF export of the same data, if wanted: `TablePdf` + `<crn-pdf-button>` (see `CLAUDE.md` "PDF export").
6. Spec: rows rendered and sorted with mock data (see `raids-page.spec.ts`), filter → request in
   `http-coc-api.service.spec.ts` style when the query string is new.

## Pitfalls

- Column id mismatch between `clan-tables.ts` and `defineTable`: filter silently ignored or 400.
- Text filters are debounced by the table; do not debounce again.
- Header labels never wrap: keep them short (i18n in three files).
- A page's styles cannot reach `<table>`: style rows and cells.
