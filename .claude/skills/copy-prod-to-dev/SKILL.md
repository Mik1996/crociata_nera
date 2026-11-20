---
name: copy-prod-to-dev
description: Bring the development database (`dev`) back to the current state of production (`Prod`) by copying every collection except the base arsenal, Telegram chats/posts, users and sessions. Use when the user asks to realign, reset or refresh dev with production data, or after tests that altered dev (e.g. "time travel" on announcements).
---

# Copy Prod onto dev

Script: `backend/scripts/copy-prod-to-dev.mjs`. Prod is only read; dev is overwritten collection by
collection (documents and indexes); collections only in dev are dropped, except the kept ones.

Kept as they are in dev (never copied, never dropped): `DefenseBases`, `BaseImages` (base arsenal),
`TelegramChats`, `TelegramBasePosts` (they belong to the dev bot), `Users`, `Sessions` (dev's own
accounts and sign-ins; prod's emails, password hashes and tokens never leave prod).
To change them, edit `KEEP_IN_DEV` in the script.

## Steps

1. Run the plan (reads only, writes nothing) and show it to the user:
   ```sh
   cd backend && node --env-file=.env.local scripts/copy-prod-to-dev.mjs 2>&1 | sed -E 's#://[^@]*@#://***@#'
   ```
2. Overwriting dev is destructive: run the copy only when the user asked for it in this
   conversation (or confirms after seeing the plan):
   ```sh
   cd backend && node --env-file=.env.local scripts/copy-prod-to-dev.mjs --apply 2>&1 | sed -E 's#://[^@]*@#://***@#'
   ```
3. Tell the user to restart the local backend (`npm run backend`) so its scheduler starts from the
   copied state. New announcement baselines are created at that start (no drafts for the past).

## Safety

- The script refuses to run unless the target database is `dev` and the source is `Prod`. The
  source URL is `PROD_DATABASE_URL` when set, otherwise `DATABASE_URL` with `Prod` as database name.
- Never print connection strings (the `sed` above masks them in any error).
- Never copy in the other direction (dev → Prod), and never run it against the VPS.
