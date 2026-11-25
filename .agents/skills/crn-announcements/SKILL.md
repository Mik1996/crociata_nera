---
name: crn-announcements
description: How the Telegram announcements of Crociata Nera work and how to change them — kinds (month, cwl, donations, record, promotion, legendSeason, war, raid, lineup), draft → publishing → published/discarded lifecycle, per-kind switches and baselines, captions and server-drawn SVG pictures in three languages, links to the site, the announcements chat. Use when adding or changing an announcement kind, caption, picture, hashtag or link, when a draft is missing, duplicated or wrong, or when working on the Announcements tab of /admin/publishing.
---

# Announcements (Telegram)

The overall behaviour is summarised in `AGENTS.md` "Backend notes → Telegram / Announcements"; this
skill is the map and the procedures. Code: `backend/src/modules/announcements/`, Telegram plumbing in
`backend/src/modules/telegram/` and `backend/src/lib/telegram/telegram-client.ts`; admin UI in
`src/app/features/admin/publishing/announcements/`.

## Lifecycle (verified)

- Kinds: `AnnouncementKind` / `ANNOUNCEMENT_KINDS` in `announcement.model.ts`.
- States: `draft` → `publishing` (atomic) → `published`; or `draft` → `discarded`. A failed publish goes back
  to `draft` with `error`; a publish stuck in `publishing` > 10 min returns to draft (`interrupted`).
  A 403 from Telegram marks the chat `canPost: false`. Publishing needs the single chat with purpose
  `announcements` (409 `TELEGRAM_NO_ANNOUNCEMENTS_CHAT`).
- Drafts are prepared by `syncAnnouncementDrafts` (`announcement-drafts.service.ts`) at the end of every
  scheduler run (`crn-game-data-sync`), per clan of the Crusade; the `lineup` draft is created by
  `createLineupDraft` when a CWL selection closes (and dropped by `dropLineupDrafts` on reopen).
- Only periods closed after a clan was first seen get drafts (`AnnouncementBaselines`); kinds added later
  start from `kindsSince`; a kind switched off (`AnnouncementSettings`, `announcement-settings.service.ts`,
  `kindGate().since(kind)`) loses what closes meanwhile, and records beaten meanwhile become the baseline.
- Open drafts keep their figures updated; published ones are frozen and keep their `language`.

## Files per concern

| Concern | File |
|---|---|
| Data shape per kind (`MonthData`, `CwlData`, … `LineupData`) | `announcement-data.ts` |
| When a draft is created/updated/removed | `announcement-drafts.service.ts` |
| Publish/discard, records settling | `announcements.service.ts` |
| Caption (switch on `data.kind`), hashtags | `announcement-caption.ts` |
| Words in it/en/es (captions, picture labels, hashtags) | `announcement-texts.ts` |
| Link to the site page (`/statistics?period=`, `/cwl?season=`, `/players/{tag}`…; sister clans `/`) | `announcement-link.ts` |
| Picture (SVG → PNG/JPEG) | `image/announcement-image.ts`, theme `image/announcement-theme.ts` (equal to `--cn-pdf-*`, checked by `test/announcement-theme.test.ts`), text as paths `image/svg-text.ts`, promotions `image/promotion-look.ts` |
| OpenAPI models | `backend/src/openapi/models/telegram.ts` |
| Frontend types / service | `src/app/core/backend/backend-api.types.ts`, `core/backend/announcements-admin.service.ts` |
| Admin UI | `telegram-announcements.*`, `announcement-kinds.ts` (icon per kind), `announcement-settings-form.*`, `announcement-images.ts` |
| UI texts (kind names, descriptions, history lines) | `public/i18n/*.json` (search an existing kind, e.g. `legendSeason`) |

## Adding a kind (checklist)

1. `AnnouncementKind` value; data interface in `announcement-data.ts` (part of the union).
2. Draft rule in `announcement-drafts.service.ts`: when it closes, idempotent key (one draft per
   period/player/clan), gate with `gate.since(kind)` and, for a kind added to a running site, a
   `kindsSince` start so the past is not announced.
3. Caption case + texts in the three languages + hashtag; link case in `announcement-link.ts`.
4. Picture case in `image/announcement-image.ts` (iron look; pictures of `public/` via `readSiteAsset`;
   opponent badges only from `api-assets.clashofclans.com`; names with emoji/other scripts through
   `SvgText.prepare`).
5. OpenAPI enum/model follows automatically from `ANNOUNCEMENT_KINDS` where used; check
   `openapi/models/telegram.ts` for per-kind data.
6. Frontend: kind in the `backend-api.types.ts` union, icon in `announcement-kinds.ts` (icon must exist,
   see `crn-frontend-ui`), texts in `public/i18n/*.json`, any per-kind detail in `telegram-announcements.ts`.
7. Tests in `backend/test/announcements.test.ts`: created once, not before the baseline, switched off →
   none, caption ends with hashtags in each language, link; frontend spec if the UI changed.
8. Update `AGENTS.md` (the kinds list) and README "Telegram" if behaviour visible to admins changed.

## Debugging a missing or wrong draft

Check in order: kind switched on? clan baseline / `kindsSince` later than the event? the period really
closed (commendations awarded for war/raid/month)? an existing draft/published one with the same key?
the scheduler step ran (`/api/v1/health`, `[announcements]` logs)? For local experiments with dates use the
`dev` database and restore it afterwards with `crn-copy-prod-to-dev`. Telegram is never called in tests
(`mockTelegramApi`); in dev use the dev bot, never the production one.
