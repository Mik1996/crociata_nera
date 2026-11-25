---
name: crn-frontend-ui
description: How to build or change Angular UI in Crociata Nera (pages, components, dialogs, styles, texts) with the project's design system — iron/gold themes, colour palette tokens, rem and spacing tokens, container queries, shared `crn-*` components and directives, icons, i18n in three languages, mock mode and the browser check. Use for any change under `src/app/**` templates or styles, `src/styles/`, `public/i18n/`, icons, or when the user asks for a new page, dialog, card, layout or visual fix.
---

# Frontend UI

Rules already in `AGENTS.md` (colours, sizes, container queries, file split, `crn` prefix, page fill,
`<crn-load-state>`, icons, service worker, CSP) apply; this skill adds the working method and the
inventory to reuse. Also see the memories on the redesign and on avoiding `::ng-deep`/`!important`.

## Component skeleton

Standalone, `ChangeDetectionStrategy.OnPush`, `inject()`, signals (`input()`, `computed`, `signal`),
data with `rxResource({ stream: () => … })`, `templateUrl` + `styleUrl`, selector `crn-…`. Read a sibling
in the same feature folder first and copy its structure (e.g. `features/raids/raids-page.ts`).
Page-level: `host: { class: 'page--fill' }` + `.page__scroll` with `crnScrollFade` when it fills the
viewport; `<crn-page-header>` for the title band. Route `title` is a translation key; public pages may
add `data: { seo: 'seo.<page>' }` (`core/i18n/page-title-strategy.ts`).

## Reuse before writing (`src/app/shared/`)

| Need | Use |
|---|---|
| Loading / empty / error | `<crn-load-state>` |
| Table | `<crn-table>` + `serverTable` (`crn-server-table` skill) |
| KPI tile, bar, legend | `<crn-kpi-card>`, `<crn-meter>`, `<crn-legend>` + `<crn-legend-item>` |
| Player name cell | `<crn-player-cell>` (link, "You" tag) |
| Chips | `<crn-tag>` (tone by meaning, appearance outline/solid/soft) |
| War result, stars | `<crn-result-badge>`, `<crn-stars>`, `<crn-star-text>` |
| Select with pictures | `<crn-select>` |
| Messages | `<crn-alert>`; form/backend errors `<crn-form-errors>` |
| Confirm dialog | `<crn-confirm-dialog>` frame (title, content, backend errors, actions) |
| Paging (non-table lists) | `<crn-paginator>`; infinite lists `[crnNearEnd]` |
| Buttons | Material buttons + `crnButton` (`primary`, `danger`) |
| Tabs | `mat-tab-group[crnSwipeTabs]` |
| Game visuals | `<crn-town-hall-icon>`, `<crn-unit-tile>`, `<crn-level-badge>`, `<crn-xp-badge>`, `<crn-commendation-medal>` (`shared/game/`) |
| Avatar, mascot | `<crn-avatar>`, `<crn-crusader>` |
| Icons | `<crn-icon name>` (new name: `scripts/generate-icons.mjs` + `npm run icons`) |
| Charts | `shared/charts/chart-canvas.ts`, colours from `chart-theme.ts` |
| PDF of a table | `TablePdf` + `<crn-pdf-button>` |
| Numbers / dates | `LocalNumberPipe` etc. in `core/i18n/locale-pipes.ts` |
| Game labels | `shared/labels.ts` (translation keys) and `core/game/*` (asset paths) |

## Styles

- `@use 'variables' as *;` for `$space-*`, `$radius-*`; `@use 'color-palette' as palette;` for
  `palette.alpha(var(--cn-x), 30%)`. Colours only via `var(--cn-*)`; a new colour means a new token in
  `src/styles/_color-palette.scss` for **every theme** (look at how existing tokens are grouped).
- Responsive: container queries on a parent (`container-type: inline-size`), base rules before the
  `@container` block; text fitting a box with `min(<size>, Ncqi)`.
- No `::ng-deep`, no `!important`: use tokens, inherited CSS variables or global modifier classes in
  `src/styles/`.
- Accessibility: meaning not by colour alone, accessible names on icon buttons, `role="alert"/"status"`
  via existing components, focus visible.

## Texts

Every new string: key in `public/i18n/it-IT.json`, `en-US.json`, `es-ES.json` (same keys and
placeholders — `core/i18n/i18n.spec.ts` fails otherwise). Italian is the reference wording; game terms
follow the in-game Italian/Spanish names already used in the files (search before inventing).

## Data and modes

- Data through the area's abstract service (`CocApiService`, `DefenseBasesService`, `CwlSelectionService`,
  `core/backend/*.service.ts`). A new method also needs the mock implementation so
  `npm run start:mock` keeps working.
- Signed-in state: `AuthService` (`isAdmin`, `hasClanAccess`, `hasLeaderAccess`, `isMyPlayer`).
- Offline: `Connectivity` (`core/pwa/connectivity.ts`); `<crn-load-state>` retries on reconnect.

## Visual check (required before "done")

1. `npm run lint:colors && npm run lint:units`, `npx tsc -p tsconfig.app.json --noEmit`, the specs.
2. Browser: `npm run start:mock` (public and mock-able pages; no signed-in user) — or ask the user to run
   `npm start` + `npm run backend` for pages needing a session. Browser tools (e.g. Safari MCP:
   navigate, screenshot, set viewport) can drive it.
3. Look at: both themes (settings page), phone width (~360–400 px) and desktop, long names (emoji, other
   scripts), empty/loading/error states, Italian and one other language.
4. Service-worker behaviour only with `npm run start:prod` (port 4400).
