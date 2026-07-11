# Production Deployment Guide — Polish Station POS

Target: **https://www.pos.polishstation.lk**, hosted on **Zircon Hosting (cPanel)**, auto-deployed from GitHub `main`.

This guide reflects the actual code in this repository as of this audit. Where something depends on Zircon's specific cPanel plan (feature availability, exact paths), it's called out explicitly instead of assumed.

---

## 1. Codebase analysis

| Layer           | Technology                                                             | Notes                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend        | React 19 + TanStack Router, SSR'd                                      | Built by Vite 8 into `dist/client` (static assets)                                                                                                              |
| Backend         | TanStack Start (Nitro/h3)                                              | Built into `dist/server/server.js`, a `fetch`-style handler                                                                                                     |
| Server entry    | `start.mjs` (plain Node `http` server)                                 | Loads the SSR handler, serves `dist/client` static files directly, sets security headers                                                                        |
| Database        | **Firebase Firestore** (no SQL)                                        | Real-time listeners (`onSnapshot`) in `src/store.tsx`; no ORM, no migrations in the SQL sense                                                                   |
| Auth            | Firebase Auth + custom tokens                                          | PIN checked server-side (`bcryptjs`) against Firestore `staff` docs, then a Firebase custom token is minted (`src/server/auth.ts`)                              |
| File storage    | **Firebase Storage** (client SDK, direct browser upload)               | No server-side upload directory or disk storage is used — see `storage.rules` (job photos, 5MB cap, image only)                                                 |
| Process manager | **Phusion Passenger** (via cPanel Node.js Selector)                    | Not PM2 — shared cPanel hosting gives no root/systemd access, so Passenger (built into Apache/LiteSpeed via `mod_passenger`) is the only option cPanel supports |
| CI/CD           | GitHub Actions → cPanel UAPI `VersionControl/update`                   | `.github/workflows/deploy.yml`                                                                                                                                  |
| Node version    | **20** (`.nvmrc`, `package.json engines`, `.cpanel.yml` nodevenv path) |                                                                                                                                                                 |
| Package manager | **npm** (`package-lock.json`)                                          | `bun.lock`/`bunfig.toml` are leftover from initial scaffolding and are **not** used by any deploy path — see note in §16                                        |

**No traditional relational database, no upload directory, no Redis/session store, no PM2/Docker are needed.** This significantly simplifies the cPanel deployment compared to a typical Node app.

### Issues found and fixed during this audit

1. **Runtime env vars were never loaded on the server.** `start.mjs` (the Passenger startup file) never read `.env`, but `src/server/firebase-admin.ts` reads `process.env.FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` at module-import time. Passenger does not source shell profiles or `.env` files itself — it would have booted with those three vars `undefined`, silently breaking all Firebase Admin calls (login, PIN reset) in production. **Fixed:** `start.mjs` now does `import "dotenv/config"` as its first line, and `dotenv` was moved from `devDependencies` to `dependencies` in `package.json` (it's now a production runtime requirement, not just a build/seed-script tool).
2. **Passenger was never told to reload after a deploy.** `.cpanel.yml` rebuilt `dist/` but never touched Passenger's restart file, so the _old_ `server.js` would keep running from memory until it happened to idle out on its own. **Fixed:** `.cpanel.yml` now runs `touch $APP_ROOT/tmp/restart.txt` after a successful build, which Phusion Passenger watches and uses to trigger a graceful worker reload.
3. **`sitemap.xml` emitted relative URLs** (`BASE_URL = ""`), which is invalid per the sitemap spec (`<loc>` must be absolute). **Fixed:** set to `https://www.pos.polishstation.lk`.
4. **No compression/caching at the Apache layer.** Node itself doesn't gzip responses. **Fixed:** `.cpanel.yml` now also writes `mod_deflate`/`mod_expires` directives into the generated `.htaccess`.
5. **Deploy could silently build with a missing `.env`**, producing a broken bundle with blank Firebase config baked in. **Fixed:** `.cpanel.yml` now hard-fails the deploy with a clear message if `$APP_ROOT/.env` doesn't exist yet.
6. **Firestore rules/indexes/storage rules had no deployment automation** — they're a separate deploy target from the cPanel app (they live in Firebase, not on the web server) and were previously only deployable by running `firebase deploy` by hand. **Fixed:** added `.github/workflows/firebase-deploy.yml`, which deploys them automatically on push to `main` whenever `firestore.rules`, `firestore.indexes.json`, `storage.rules`, or `firebase.json` change.

### Not changed, but flagged

- **`.env` on this machine contains a real, live Firebase Admin private key.** It's correctly `.gitignore`d and has never been committed (verified via `git log --all -- .env`), but since it was read in full during this audit, treat it as seen — rotate the service account key in Firebase Console → Project Settings → Service Accounts if you want to be strict about it, then update `.env` and the cPanel copy.
- `bun.lock` / `bunfig.toml` are tracked in git but unused by the build/deploy pipeline (`npm ci` is what runs everywhere). They don't break anything; delete them if you want one canonical package manager, or leave them — your call.

---

## 2. Code changes made (summary)

| File                                          | Change                                                                                       | Why                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `start.mjs`                                   | Added `import "dotenv/config"` as the first line                                             | Loads `.env` into `process.env` before the SSR handler (and `firebase-admin.ts`) is imported   |
| `package.json`                                | Moved `dotenv` to `dependencies`                                                             | It's now required at production runtime, not just in build/seed scripts                        |
| `.cpanel.yml`                                 | Added `.env` existence check, `tmp/restart.txt` touch, compression/caching `.htaccess` rules | Fail fast on missing secrets; make Passenger actually pick up new builds; basic perf hardening |
| `src/routes/sitemap[.]xml.ts`                 | `BASE_URL` set to production domain                                                          | Spec-valid absolute `<loc>` URLs                                                               |
| `.github/workflows/firebase-deploy.yml` (new) | Auto-deploys Firestore/Storage rules on relevant file changes                                | Keeps DB security rules in sync with `main` automatically                                      |

No other application code was changed — auth, Firestore rules, and the data layer were already production-grade from the prior hardening pass (bcrypt PIN hashing, server-side lockout, role-scoped Firestore rules, CSP headers).

---

## 3. Environment variables

All variables live in **one `.env` file** placed directly in the cPanel application root (`/home/polishst/pos.polishstation.lk/.env`). It is **never** deployed via Git (it's gitignored) — you create/update it manually over SFTP or the cPanel File Manager.

| Variable                            | Used where                            | Used when                                                           |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`             | client bundle                         | **build time** — inlined by Vite                                    |
| `VITE_FIREBASE_AUTH_DOMAIN`         | client bundle                         | build time                                                          |
| `VITE_FIREBASE_PROJECT_ID`          | client bundle                         | build time                                                          |
| `VITE_FIREBASE_STORAGE_BUCKET`      | client bundle                         | build time                                                          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | client bundle                         | build time                                                          |
| `VITE_FIREBASE_APP_ID`              | client bundle                         | build time                                                          |
| `FIREBASE_PROJECT_ID`               | `src/server/firebase-admin.ts`        | **runtime** (server process)                                        |
| `FIREBASE_CLIENT_EMAIL`             | `src/server/firebase-admin.ts`        | runtime                                                             |
| `FIREBASE_PRIVATE_KEY`              | `src/server/firebase-admin.ts`        | runtime — keep the literal `\n` sequences, the code un-escapes them |
| `VITE_SENTRY_DSN`                   | `src/lib/error-reporting.ts`          | build time — optional, Sentry activates only if set                 |
| `SENTRY_DSN`                        | not currently read anywhere in `src/` | reserved/unused — safe to leave blank                               |
| `STAFF_PIN_s1`…`STAFF_PIN_s9`       | `scripts/seed-staff.ts` only          | **one-time seed script**, not read by the running app               |
| `PORT`                              | `start.mjs`                           | runtime — Passenger sets this automatically; don't set it yourself  |

**Because `VITE_*` vars are baked in at build time**, and the build runs _on the server_ (`.cpanel.yml` → `npm run build`), the `.env` file must exist **before the first deploy** — this is now enforced by a hard check in `.cpanel.yml`.

### GitHub Actions secrets required

Repo → Settings → Secrets and variables → Actions:

| Secret                                                                                                                                                                        | Used by                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | `deploy.yml` → `validate` job (build check only — doesn't affect the real server build)                                            |
| `CPANEL_USERNAME`                                                                                                                                                             | `deploy.yml` → cPanel UAPI trigger                                                                                                 |
| `CPANEL_TOKEN`                                                                                                                                                                | cPanel API token (create in cPanel → Security → Manage API Tokens)                                                                 |
| `CPANEL_DOMAIN`                                                                                                                                                               | cPanel hostname used for the UAPI call, e.g. `server.zirconhosting.com`                                                            |
| `FIREBASE_PROJECT_ID`                                                                                                                                                         | `firebase-deploy.yml`                                                                                                              |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                                                                                                                                               | `firebase-deploy.yml` — paste the full JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key |

---

## 4. Database setup (Firestore)

There's no SQL database and no schema migrations. Firestore is schemaless; "migrations" here means **rules, indexes, and one-time seed data**.

- **Rules & indexes** (`firestore.rules`, `firestore.indexes.json`, `storage.rules`): deployed via Firebase CLI, now automated by `.github/workflows/firebase-deploy.yml` on every push to `main` that touches those files. To deploy manually: `firebase deploy --only firestore:rules,firestore:indexes,storage`.
- **Seed data** (one-time, manual, from your local machine — never automatically):
  ```
  npm run seed:staff   # creates staff/{s1..s9} + staff_public — bcrypt-hashes STAFF_PIN_s1..s9 from .env
  npm run seed:data    # seeds services, customers, inventory, bookings, jobs, equipment, POs, counters
  ```
  ⚠️ **`seed:staff` is NOT idempotent-safe for re-runs after go-live** — it unconditionally overwrites every staff PIN hash with whatever's currently in `.env`. Running it again after staff have changed their own PINs (via the in-app Admin/Manager reset flow) will silently reset them all back to the seed values. Run it once during initial setup, then never again in production. `seed:data` _is_ safe to re-run (it skips collections that already have documents unless you pass `--force`).
- **Backups**: see §18.

---

## 5. Domain & subdomain configuration

Target hostname: `www.pos.polishstation.lk` — a `www`-prefixed third-level subdomain under `polishstation.lk`.

1. In cPanel → **Domains** → **Create A New Domain**, create the subdomain. Depending on what Zircon's cPanel version allows, either:
   - Enter `www.pos` as the subdomain label under root domain `polishstation.lk` (cPanel supports multi-label subdomains), **or**
   - Create `pos.polishstation.lk` as the subdomain, then add `www.pos.polishstation.lk` as a **Domain Alias** pointing at the same document root.
2. Set the **Document Root** to `/home/polishst/pos.polishstation.lk` (matches the path already hardcoded in `.cpanel.yml` and this guide).
3. In your DNS (wherever `polishstation.lk`'s nameservers point — Zircon's DNS zone editor or an external DNS provider):
   - `A` record for `pos.polishstation.lk` → your Zircon server IP.
   - `A` or `CNAME` record for `www.pos.polishstation.lk` → same IP / `pos.polishstation.lk`.
4. Recommended: redirect the bare `pos.polishstation.lk` → `https://www.pos.polishstation.lk` (one canonical URL, avoids duplicate-content and SSL edge cases) — add this as a cPanel **Redirect** once both hostnames resolve and have certificates.

---

## 6. SSL / HTTPS

1. cPanel → **SSL/TLS Status** → run **AutoSSL** for `pos.polishstation.lk` and `www.pos.polishstation.lk` (Let's Encrypt via cPanel's AutoSSL, included on virtually all cPanel/Zircon plans). Confirm both hostnames get a certificate — AutoSSL only covers hostnames it can validate, so both must already resolve in DNS first.
2. HTTPS enforcement is already handled at the application layer: `start.mjs` sets `Strict-Transport-Security` (HSTS, 1 year, includeSubDomains) whenever it detects `x-forwarded-proto: https` or a direct TLS socket.
3. Add an actual HTTP→HTTPS redirect at the Apache layer (belt-and-suspenders, catches any request that never reaches Node). Add to the top of `.cpanel.yml`'s generated `.htaccess` block (see §9's config file — already included there) or via cPanel's **Domains → Manage → Force HTTPS Redirect** toggle, which is the simplest option and doesn't require touching `.htaccess` at all.

---

## 7. Node.js setup in cPanel

Use cPanel's **Setup Node.js App** (CloudLinux NodeJS Selector). This is what provisions the `nodevenv` directory that `.cpanel.yml` already references (`/home/polishst/nodevenv/pos.polishstation.lk/20/bin`) — you cannot skip this and hand-write the `.htaccess` alone, because the venv itself doesn't exist until you do this.

1. cPanel → **Setup Node.js App** → **Create Application**.
2. **Node.js version**: `20` (matches `.nvmrc` / `engines.node` / the path already baked into `.cpanel.yml`).
3. **Application mode**: Production.
4. **Application root**: `pos.polishstation.lk` (relative to home — resolves to `/home/polishst/pos.polishstation.lk`).
5. **Application URL**: `pos.polishstation.lk` (or `www.pos.polishstation.lk`, matching whatever you set as the primary domain in §5).
6. **Application startup file**: `start.mjs`.
7. Click **Create**. cPanel writes an initial `.htaccess` — this gets overwritten (with equivalent + extra directives) by every deploy via `.cpanel.yml`, so don't hand-edit it afterward, it won't stick.
8. **Do not** use the Node.js Selector's own "Run NPM Install" or environment-variables UI for ongoing deploys — `.cpanel.yml` handles installs, and `.env` (not the UI env-var fields) is how this app expects its secrets, because `FIREBASE_PRIVATE_KEY` is a multi-line PEM block that doesn't survive being pasted into a single-line UI field reliably.

---

## 8. Build & startup commands

| Purpose                                                             | Command                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Install deps (server, including dev deps needed for the Vite build) | `npm ci --include=dev`                                                                  |
| Build client + server bundles                                       | `npm run build` (→ `dist/client`, `dist/server/server.js`)                              |
| Start (what Passenger runs)                                         | `node start.mjs` — reads `PORT` from Passenger, or defaults to `3000` for local testing |
| Local dev                                                           | `npm run dev`                                                                           |
| Type check (CI gate)                                                | `npx tsc --noEmit`                                                                      |

---

## 9. Process management: Passenger, not PM2

**Passenger is the only viable option here — not PM2.** Zircon's cPanel plan is shared hosting: no root access, no systemd, no ability to run a persistent `pm2` daemon outside of what cPanel manages for you. Passenger is built directly into cPanel's Apache/LiteSpeed via `mod_passenger`/the NodeJS Selector, which is exactly what's already wired up in `.cpanel.yml`:

- `PassengerEnabled on`, `PassengerAppRoot`, `PassengerAppType node`, `PassengerStartupFile start.mjs`, `PassengerNodejs <venv path>` in `.htaccess`.
- Passenger manages the process lifecycle (start on first request or keep-alive, restart on crash, idle spin-down).
- Reload after deploy = `touch tmp/restart.txt` (now automated, see §2 fix #2).

No `ecosystem.config.js` is needed or applicable.

---

## 10. File permissions & "uploads"

There is **no server-side upload directory** — job photos go straight from the browser to **Firebase Storage** via the client SDK (`getStorage()` in `src/lib/firebase.ts`), governed by `storage.rules` (auth required, 5MB cap, image MIME types only). Nothing to configure on the cPanel filesystem for uploads.

Permissions that do matter:

- `.env` → `600` (readable only by the cPanel user; contains the Firebase Admin private key).
- `.htaccess` → `644` (already set by `.cpanel.yml`).
- `start.mjs`, `dist/**` → default cPanel-created file perms are fine (readable by the app user Passenger runs as).

```bash
chmod 600 /home/polishst/pos.polishstation.lk/.env
```

---

## 11–12. GitHub integration & automatic deployment pipeline

Flow: **push to `main`** → GitHub Actions `validate` job (`tsc --noEmit` + `npm run build` as a build-correctness gate, using GitHub secrets — this build is thrown away, it never touches the server) → on success, `deploy` job calls the cPanel UAPI to trigger a **Git Version Control pull + `.cpanel.yml` task run** on the actual server.

### One-time server-side setup

1. cPanel → **Git™ Version Control** → **Create**.
2. **Clone URL**: your GitHub repo's HTTPS or SSH URL.
3. **Repository Path**: `/home/polishst/pos.polishstation.lk` — **same directory** as the Node app's root/document root (no separate "additional path" — this repo's `.cpanel.yml` assumes the repo _is_ the live app directory).
4. Branch: `main`.
5. If the repo is private, add a **deploy key** (cPanel generates one under the Git Version Control UI — add its public half to GitHub repo → Settings → Deploy keys) so cPanel can clone/pull without your personal credentials.
6. cPanel → **Manage API Tokens** → create a token, scoped to this account. This becomes `CPANEL_TOKEN`.

### GitHub repo setup

Add the six secrets from §3 (`CPANEL_USERNAME`, `CPANEL_TOKEN`, `CPANEL_DOMAIN`, plus the six `VITE_FIREBASE_*` for the CI build-check).

### What actually happens on every push to main

```
git push origin main
  → GitHub Actions: validate (tsc, vite build) — fails the pipeline if broken, nothing touches the server
  → GitHub Actions: deploy — curl to cPanel UAPI VersionControl/update
      → cPanel pulls latest commit into /home/polishst/pos.polishstation.lk
      → cPanel runs .cpanel.yml deployment.tasks:
          - checks .env exists (fails loudly if not)
          - npm ci --include=dev
          - npm run build
          - rewrites .htaccess (Passenger + compression directives)
          - touch tmp/restart.txt → Passenger gracefully reloads the worker
  → live within ~30-90s of the push, no manual step
```

This is "the closest possible workflow to a true CI/CD push-to-deploy" that cPanel's Git Version Control feature supports — there's no native cPanel webhook listener, so the GitHub Actions step is what closes that gap (it's effectively acting as the webhook).

---

## 13. Zero-downtime deployment

The current setup rebuilds **in place** inside the live app directory — there's a multi-second window during `npm run build` where the app keeps serving the _previous_ build (Passenger doesn't reload until `tmp/restart.txt` is touched _after_ the build finishes), so normal deploys have no visible downtime for an internal single-tenant POS tool with brief, infrequent deploys.

If you want stronger guarantees (true atomic swap, e.g. for zero risk of a request landing mid-build), the standard pattern is **release directories + a symlink**:

```
/home/polishst/releases/2026-07-08_143000/   ← full checkout + build
/home/polishst/releases/2026-07-08_150000/
/home/polishst/pos.polishstation.lk -> releases/2026-07-08_150000/   (symlink, atomic to swap)
```

This requires restructuring the Git Version Control repo path to a separate clone location and having `.cpanel.yml` build into a fresh timestamped directory, then `ln -sfn` to swap. It's a bigger architectural change than this app's current traffic profile justifies — documented here as the upgrade path if usage grows, not implemented by default.

---

## 14. Rollback procedure

Because the deployed directory **is** the Git working tree, rollback is straightforward:

**Preferred (fully automated, keeps history clean):**

```bash
git revert <bad-commit-sha>
git push origin main
# normal pipeline redeploys the reverted (good) state automatically
```

**Emergency (server is broken right now, can't wait for CI):** SSH into the server —

```bash
cd /home/polishst/pos.polishstation.lk
export PATH=/home/polishst/nodevenv/pos.polishstation.lk/20/bin:$PATH
git reset --hard <last-good-sha>
npm ci --include=dev
npm run build
touch tmp/restart.txt
```

Then push the equivalent revert to GitHub afterward so `main` matches what's actually live.

---

## 15. Logging, monitoring, error handling

- **App logs**: `start.mjs` logs startup diagnostics (`[startup]`) and request errors (`[request]`) to stdout/stderr, which cPanel's Node.js Selector captures — view via cPanel → Setup Node.js App → your app → **Logs**, or `~/logs/` depending on Zircon's log path convention.
- **Uncaught exceptions/rejections**: `start.mjs` installs `process.on("uncaughtException"/"unhandledRejection")` handlers that log and exit(1) — combined with Passenger's auto-restart-on-crash, this self-heals rather than hanging in a broken state.
- **Client + SSR error reporting**: Sentry (`@sentry/react`), active only when `VITE_SENTRY_DSN` is set (`src/lib/error-reporting.ts`, wired in `__root.tsx`). Get a DSN from sentry.io → add to `.env` on the server and rebuild.
- **SSR error boundary**: `src/start.ts` + `src/server.ts` wrap the whole SSR handler so an unhandled server-side throw renders a friendly error page instead of a raw stack trace to the client (`src/lib/error-page.ts`).
- **Recommended addition**: enable cPanel's built-in **uptime/resource monitoring** (if Zircon's plan includes it) or an external uptime check (e.g. UptimeRobot) hitting `https://www.pos.polishstation.lk/` — there's no in-app health-check endpoint currently, the root route itself doubles as one since it 200s only when SSR succeeds.

---

## 16. Security hardening

Already in place (verified in code, not assumed):

- CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS-on-HTTPS — all in `start.mjs`.
- PIN auth: bcrypt (cost 12), server-side lockout (5 fails → 5 min), constant-time response on unknown staff ID.
- Firestore rules are role-scoped per collection (`firestore.rules`) — reviewed, no `allow read, write: if true` on anything sensitive; `staff` docs (containing `pinHash`) are write-only from the Admin SDK, never from the client.
- Storage rules cap uploads to 5MB, image MIME types only, delete restricted to Manager/Admin.
- Firebase Admin credentials never reach the browser (server-only import in `src/server/firebase-admin.ts`, gated by `"use server"` in `auth.ts`).

Recommended additions for go-live:

- Rotate the Firebase service account key currently in `.env` (see §1) since it was read in plaintext during this audit — cheap insurance.
- `.env` → `chmod 600` on the server (§10).
- Remove `SENTRY_DSN` (unused, server-side) from `.env.example` or wire it up if you intend to add server-side Sentry later — currently dead config, not a vulnerability, just noise.
- Consider a cPanel-level firewall/ModSecurity rule or rate-limit on `/` if this POS is ever exposed to the open internet rather than a trusted LAN/VPN — the login flow has lockout, but no IP-level rate limiting yet.

---

## 17. Performance optimizations

- **Compression & caching**: now handled at the Apache layer via `.htaccess` (`mod_deflate` for text/JS/CSS/JSON/SVG, `mod_expires` with 1-year cache on hashed static assets) — added in this audit's `.cpanel.yml` fix.
- **Static asset caching**: `start.mjs` already sets `Cache-Control: public, max-age=31536000, immutable` for anything under `/assets/` (Vite's content-hashed output), so repeat visits are effectively free.
- **Database**: Firestore has no query planner to tune in the SQL sense; `firestore.indexes.json` already defines the composite indexes the app's queries need — keep it in sync whenever a new compound `where`/`orderBy` query is added (Firestore will throw a direct link to auto-generate the missing index if you forget, but the automated deploy in §4 means indexes.json committed to `main` is what actually ships).
- **Optional, only if traffic grows**: have Apache serve `/assets/*` directly (bypassing the Node process entirely) via a `<Location>` block with `PassengerEnabled off` scoped to that path. Not implemented by default — for a low-to-moderate traffic internal POS, routing static files through Node (as `start.mjs` already does) is simpler to reason about and the perf difference is negligible.

---

## 18. Backup strategy

**Code**: already backed up by definition — GitHub `main` is the source of truth, and the server is just a deployed copy of a specific commit. No separate code backup needed beyond normal Git hygiene (protected `main` branch, PR review if more than one person touches this).

**Database (Firestore)**:

- Automated: enable **Firestore scheduled backups** in Firebase Console → Firestore → Backups (or `gcloud firestore backups schedules create` if you want it in code) — set a daily schedule with a retention window (e.g. 7 or 14 days). This is the recommended path; it costs a small amount of storage but requires zero maintenance.
- Manual/on-demand: `gcloud firestore export gs://<your-backup-bucket>` before any risky manual data operation.
- **`.env` itself**: keep a copy of the production `.env` somewhere durable _outside_ of Git (password manager, encrypted note) — if the server is ever rebuilt from scratch, this is the one thing that isn't recoverable from GitHub.

---

## 19. Troubleshooting guide

| Symptom                                                                       | Likely cause                                                                                                               | Fix                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy succeeds but site shows old version                                    | Passenger didn't reload                                                                                                    | Confirm `.cpanel.yml`'s `touch tmp/restart.txt` step ran; manually `touch /home/polishst/pos.polishstation.lk/tmp/restart.txt`                                                        |
| Login fails for everyone / "Internal Server Error" right after a fresh deploy | `.env` missing or `FIREBASE_PRIVATE_KEY` malformed on the server                                                           | Check Setup Node.js App logs for `[startup] FAILED to load SSR handler`; verify `.env` exists and the private key still has literal `\n` (not real newlines) in the file              |
| Build fails in `.cpanel.yml` with "FATAL: .env is missing"                    | Someone provisioned a new app root without copying `.env` over                                                             | SFTP/File Manager the production `.env` into `/home/polishst/pos.polishstation.lk/.env`, redeploy                                                                                     |
| `502`/`503` from Apache                                                       | Passenger couldn't spawn the Node process                                                                                  | Check Node version matches the venv (`20`), check `PassengerNodejs` path in `.htaccess` still points at a real binary (`ls /home/polishst/nodevenv/pos.polishstation.lk/20/bin/node`) |
| GitHub Actions `deploy` job succeeds but nothing changes on the server        | `CPANEL_TOKEN`/`CPANEL_USERNAME`/`CPANEL_DOMAIN` secrets wrong, or Git Version Control repo not pointed at the right path  | Test the UAPI call manually with `curl`, check cPanel → Git Version Control shows the pull actually landed                                                                            |
| Firestore permission-denied errors after a rules change                       | `firebase-deploy.yml` didn't run (file path filter didn't match) or `FIREBASE_SERVICE_ACCOUNT_JSON` secret invalid/expired | Check the Action run logs; deploy manually with `firebase deploy --only firestore:rules,storage` as a stopgap                                                                         |
| Sitemap/SEO tools flag bad URLs                                               | `BASE_URL` in `sitemap[.]xml.ts` reverted or domain changed                                                                | Confirm it matches the live hostname                                                                                                                                                  |
| All staff PINs reset unexpectedly                                             | `npm run seed:staff` was re-run in production                                                                              | Don't re-run it after go-live (see §4) — restore correct PINs via the in-app Admin/Manager reset flow                                                                                 |

---

## Deployment checklist

- [ ] `.nvmrc`/`engines.node` = 20 confirmed available in Zircon's Node.js Selector
- [ ] Subdomain `www.pos.polishstation.lk` created, document root `/home/polishst/pos.polishstation.lk`
- [ ] DNS `A`/`CNAME` records for `pos.polishstation.lk` and `www.pos.polishstation.lk` live
- [ ] cPanel **Setup Node.js App** created (Node 20, app root `pos.polishstation.lk`, startup file `start.mjs`)
- [ ] AutoSSL issued for both hostnames; Force HTTPS redirect enabled
- [ ] `.env` uploaded to `/home/polishst/pos.polishstation.lk/.env`, `chmod 600`
- [ ] cPanel **Git Version Control** repo created, path = app root, branch `main`
- [ ] Deploy key added to GitHub if repo is private
- [ ] cPanel API token created
- [ ] GitHub secrets added: `CPANEL_USERNAME`, `CPANEL_TOKEN`, `CPANEL_DOMAIN`, six `VITE_FIREBASE_*`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] First deploy triggered manually from cPanel Git Version Control UI ("Deploy HEAD Commit") to sanity-check `.cpanel.yml` before relying on the automated path
- [ ] `npm run seed:staff` run once from a local machine (never again after this)
- [ ] `npm run seed:data` run once from a local machine
- [ ] Firestore rules/indexes/storage rules deployed (auto via `firebase-deploy.yml`, or manually once)
- [ ] Firestore scheduled backups enabled in Firebase Console
- [ ] Push a trivial commit to `main` and confirm the full pipeline (validate → cPanel pull → build → restart) goes green end-to-end
- [ ] Sentry DSN obtained and added, if desired
- [ ] Firebase Admin service account key rotated (was read in plaintext during this audit)

---

## Server folder structure (after first successful deploy)

```
/home/polishst/pos.polishstation.lk/        ← Git repo root == Passenger app root == document root
├── .env                                    ← manually uploaded, never in Git, chmod 600
├── .htaccess                               ← regenerated by every deploy (Passenger + compression directives)
├── .cpanel.yml
├── start.mjs                               ← Passenger startup file (imports only Node builtins)
├── package.json                            ← needed for "type": "module"; deps are never installed on the server
├── dist/
│   ├── client/                             ← static assets, served directly by start.mjs
│   └── server/
│       └── server.js                       ← SSR handler with ALL npm dependencies inlined
│                                             (scripts/bundle-server.mjs — no node_modules
│                                             needed on the server; FTP-uploading it is what
│                                             made every early deploy attempt time out)
├── tmp/
│   └── restart.txt                         ← touched every deploy; Passenger watches its mtime
├── src/                                    ← source (present because repo == deploy dir; not executed directly)
├── scripts/                                ← seed-staff.ts, seed-data.ts (run manually, not by Passenger)
└── firestore.rules / firestore.indexes.json / storage.rules / firebase.json  ← NOT used by cPanel; deployed separately to Firebase
```

---

## Step-by-step: deploying to a completely empty server

1. **DNS**: point `pos.polishstation.lk` and `www.pos.polishstation.lk` at the Zircon server IP.
2. **cPanel → Domains**: create the subdomain, document root `/home/polishst/pos.polishstation.lk`.
3. **cPanel → SSL/TLS Status**: run AutoSSL for both hostnames.
4. **cPanel → Setup Node.js App**: create the app (Node 20, root `pos.polishstation.lk`, URL `www.pos.polishstation.lk`, startup file `start.mjs`). This provisions the nodevenv `.cpanel.yml` depends on.
5. **Upload `.env`** to `/home/polishst/pos.polishstation.lk/.env` via SFTP or File Manager (copy from your local `.env`, or Firebase Console for fresh credentials). `chmod 600` it.
6. **cPanel → Git™ Version Control → Create**: clone URL = this GitHub repo, repository path = `/home/polishst/pos.polishstation.lk`, branch `main`. Add a deploy key to GitHub if private.
7. In the Git Version Control UI, click **Manage** → **Pull or Deploy** → **Update from Remote**, then **Deploy HEAD Commit** — this runs `.cpanel.yml` for the first time. Watch the task output for the `.env` check, `npm ci`, `npm run build`, and the final restart-triggered message.
8. Visit `https://www.pos.polishstation.lk` — you should get the login screen (no staff seeded yet, so login will correctly fail).
9. From your **local machine** (needs the Admin SDK vars in your local `.env`): `npm run seed:staff` then `npm run seed:data`.
10. Log in with one of the seeded PINs and confirm the dashboard loads and Firestore data appears.
11. **cPanel → Manage API Tokens**: create a token.
12. **GitHub repo → Settings → Secrets**: add all secrets listed in §3.
13. `firebase login` locally (or use an existing service account) → `firebase deploy --only firestore:rules,firestore:indexes,storage` once by hand to confirm rules are live, then rely on `firebase-deploy.yml` from then on.
14. Push a trivial commit to `main` and confirm the whole automated pipeline goes green and the change appears live without touching cPanel again.
15. Enable Firestore scheduled backups in Firebase Console.
16. Done — future deploys are `git push origin main` and nothing else.
