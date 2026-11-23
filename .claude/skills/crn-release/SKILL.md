---
name: crn-release
description: Getting a change of Crociata Nera from `develop` to production safely — pre-release checks, pull request to the protected `master`, CI checks, branch updates, the merge that deploys automatically to the VPS, post-deploy verification, rollback, service-worker and CSP pitfalls, and Dependabot / dependency upgrades. Use when the user asks to open or update a PR, prepare a release, check whether something is ready to ship, handle a Dependabot PR, upgrade a dependency, or when a deploy failed.
---

# Release and dependencies

Ground rules (`CLAUDE.md` "Commands"): work on `develop`; `master` is protected (PR only, `Frontend` and
`Backend` checks green, branch up to date); **a merge to `master` deploys to production**, so merge only
when the user asks in this conversation. Commit only when asked; stage files explicitly.

## 1. Pre-release check (local)

```sh
git status && git log --oneline master..develop
cd backend && npm run typecheck && npm test && cd ..
npx tsc -p tsconfig.app.json --noEmit
npx ng test --watch=false
npm run lint:colors && npm run lint:units
npx ng build --configuration production      # as CI does
```

Then look at the diff `git diff master...develop --stat` for release risks:

| Changed | Extra care |
|---|---|
| `src/index.html` inline script, Swagger page (`backend/src/app/api/v1/docs/route.ts`) | sha256 hash in the CSP of `deploy/Caddyfile` (README "Content Security Policy") |
| new external host (images, fonts, scripts) | CSP in `deploy/Caddyfile` |
| `ngsw-config.json`, `core/pwa/*` | test with `npm run start:prod` (port 4400); emergency switch `deploy/service-worker.sh off` |
| models / indexes / migrations | idempotent migration runs at start (`crn-mongo-data`); backup exists |
| new env variable | `backend/src/lib/config/env.ts`, `deploy/.env.example`, README, and tell the user to set it in `deploy/.env` on the VPS **before** merging |
| `deploy/*` Dockerfiles, compose, Caddyfile | `deploy.sh` validates the Caddyfile and rolls back on unhealthy containers, but read the change twice |
| Telegram behaviour | production bot posts to real channels at the first sync |

## 2. Pull request

```sh
git push origin develop
gh pr create --base master --head develop --title "<type(scope): summary>" --body "<what, why, risks, checks>"
gh pr checks --watch
gh pr update-branch            # if master moved (never on Dependabot PRs)
```

PR body: summary of user-visible changes, migrations/env/CSP notes, checks run, and the attribution line.
Report the PR URL and check results to the user. **Stop there** unless the user asks to merge:
`gh pr merge --merge`.

## 3. After the merge

- Watch the `Deploy to crociatanera.it` job (`gh run watch` / `gh run list --branch master`); it runs
  `deploy/deploy.sh <sha>` over SSH and a health check.
- Verify: `curl -s https://crociatanera.it/api/v1/health` (scheduler jobs, last error), open the site.
  Open tabs get the "Update" prompt (`core/pwa/app-updates.ts`).
- On failure: `deploy.sh` already rolled back to the previous images; for a bad release that passed,
  give the user the VPS commands (Claude cannot SSH): `ssh -i ~/.ssh/crociata_vps root@217.61.63.44`,
  then in `~/crociata_nera/deploy` run `./rollback.sh` (README "Rollback"), `docker compose logs --since 30m backend`.
- Then sync `develop` with `master` if a merge commit landed only there (`git merge master` on develop,
  as in history: "Merge branch 'master' into develop").

## 4. Dependabot and upgrades

- Dependabot (`.github/dependabot.yml`) opens grouped minor/patch PRs against `master` on Mondays, plus
  security updates. Review the changelog of notable packages (Angular, Next.js, Mongoose, zod, sharp,
  pdfmake, pdfjs-dist), wait for the checks, merge only when the user asks.
- A Dependabot PR behind `master`: comment `@dependabot rebase` (not `gh pr update-branch`).
- **Major upgrades are manual on `develop`**: one package family per commit, read the migration guide,
  run `ng update` for Angular, fix code, run every check and a browser pass. Never add a dependency the
  task does not need; keep `package-lock.json` files committed (`npm ci` in CI).
- `npm audit --omit=dev` runs in CI as information only; mention high findings to the user.
