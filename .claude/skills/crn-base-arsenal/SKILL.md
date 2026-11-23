---
name: crn-base-arsenal
description: Rules and code map of the Crociata Nera base arsenal — defense bases by town hall level from in-game layout links, screenshots re-encoded as WebP in MongoDB, clan castle troops, member proposals with admin moderation (PENDING/APPROVED/REJECTED), the bases PDF, and the Telegram post of every published base in the channel of its town hall. Use when changing anything about bases, proposals, moderation, base images, clan castle capacity, the bases page, the Publishing → bases/channels tabs, or base posts on Telegram.
---

# Base arsenal

## Rules (verified in code)

- **States** (`BaseStatus`, `backend/src/modules/bases/defense-base.model.ts`): `PENDING`, `APPROVED`,
  `REJECTED`. Published = `APPROVED` (`PUBLISHED_BASES`, legacy documents without status migrated by
  `migrateBaseStatus`). Readers only ever see published bases; a proposal by id is 404 for them.
- **Who**: administrators create (published at once), edit and delete any base
  (`bases.service.ts`, routes `bases/` with `roles: [ADMIN]`); any clan member may propose
  (`POST /base-proposals`, `clanAccess`) and edit/withdraw **only their own** proposals
  (`base-proposals.service.ts`, others → 404). The UI offers proposing to signed-in non-admins.
- **Proposals**: at most `MAX_OPEN_PROPOSALS = 10` open (PENDING + REJECTED) per author; editing a
  REJECTED one resubmits it (back to PENDING, review fields cleared); APPROVED → 409 not editable;
  approve/reject match only PENDING atomically (409 otherwise); rejection reason required, 1–500 chars,
  shown to the author.
- **Town hall** from the layout link (`layout-link.ts`, twin `src/app/core/game/layout-link.ts`):
  `https://link.clashofclans.com/<lang>?action=OpenLayout&id=TH<n>:<XX>:<data>`, levels 1–30, builder
  base refused; `layoutId` unique (409 `BASE_ALREADY_EXISTS`).
- **Limits**: `MAX_DEFENSE_BASES = 400` (free Atlas cluster), counted with `estimatedDocumentCount()` —
  so pending and rejected proposals count too; `MAX_DESCRIPTION_LENGTH = 300`; list pages 24 by default,
  max 60, keyset pagination (`nextCursor`).
- **Images**: shrunk in the browser first (`src/app/core/utils/prepare-image.ts`), then JPEG/PNG/WebP
  ≤ 10 MB re-encoded by `sharp` to WebP `thumb` 640 px and `full` 1400 px, metadata dropped
  (`base-image.ts`), stored in `BaseImages` behind `ImageStore` (`base-image.store.ts`) under a random
  key that changes with the image; `GET /base-images/{key}/{variant}` is public and immutable-cached.
- **Clan castle troops**: capacity per town hall and housing space of defending troops in
  `clan-castle.ts`, twin `src/app/core/game/clan-castle.ts` (keep equal); over capacity → 400
  `CLAN_CASTLE_OVER_CAPACITY`. Troop names in English (CoC API names).

## Telegram base posts (`backend/src/modules/telegram/`)

Every published base has one post in the channel bound to its town hall (`TelegramChats`, purpose
`bases`, unique `townHallLevel`). `requestBasePostSync()` (`base-posts.service.ts`) runs after every arsenal
change and every 5 min, compares each base with its `TelegramBasePosts` record (`sent`, `noChannel`,
`failed`) and sends, edits, moves or deletes; failures wait and retry, never blocking the site. Caption in
Italian (`base-post-caption.ts`, ≤ 1024 chars, "📋 Copia la base" button, author = linked account with the
highest clan role, then town hall). Direction is always site → Telegram. Locked chats cannot change town
hall or be removed. Bot off without `TELEGRAM_BOT_TOKEN`.

## Code map

| Layer | Files |
|---|---|
| Backend | `backend/src/modules/bases/*`, routes `backend/src/app/api/v1/{bases,base-proposals,base-images}/**`, OpenAPI `openapi/operations/bases.ts` + `models/bases.ts` |
| Tests | `backend/test/bases.test.ts`, `base-proposals.test.ts`, `telegram.test.ts` |
| Frontend data | `src/app/core/backend/defense-bases.service.ts` (+ `core/mock/mock-defense-bases.service.ts`) |
| Arsenal page | `src/app/features/bases/` (`bases-page`, `base-arsenal`, `components/`: form, image, delete dialogs, clan castle picker, my proposals, rejection reason) |
| Bases PDF (admins) | `features/bases/pdf/` + `components/bases-pdf-editor.ts` (`PdfToolkit`) |
| Moderation & posts | `src/app/features/admin/publishing/bases/` (`base-moderation`, `proposal-decision-dialog`, `base-posts`, `proposal-telegram`), channels tab `publishing/channels/` |

## When changing it

- New field on a base: model + `bases.schemas.ts` (multipart form parsing `parseBaseForm`) + OpenAPI
  (`FieldDoc` texts must state the real limits) + public shape (`PublicDefenseBase`) + frontend type, form
  dialog, mock service + Telegram caption if shown there (then posts get edited on the next sync).
- Any change that alters what a post shows triggers edits of every post: think of Telegram rate limits
  (`setTelegramSendInterval`).
- A change in clan castle capacity or layout parsing: update both twins and their specs.
- Tests: state transitions (each allowed and refused), ownership, limits at the boundary, image
  validation, post sync with `mockTelegramApi`.
