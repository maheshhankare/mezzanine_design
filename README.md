# C-Section Beam System Designer (secure edition)

Design of cold-formed lipped C-section beam systems for storage and racking mezzanines (EN 1990 / EN 1993, AISI/AISC and IS routes):
floor → surface / decking → SB-Int and SB-End secondaries → connections → main beam → box column → base plate.

This edition is a client–server application: **Next.js (React, TypeScript, Tailwind) on Vercel + PostgreSQL (Neon)**.
The structural calculation engine runs **only on the server**; the browser receives results, sketches and reports, never the engine.

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): review of the original application, what moved where, API, database, authentication
* [`docs/SECURITY.md`](docs/SECURITY.md): what is and is not protected, security checklist, test results, remaining limitations
* [`docs/DEPLOY.md`](docs/DEPLOY.md): hosting, environment variables, first administrator, backups

## Features

* Sign-in with administrator-managed accounts (no self-registration); sessions expire after 8 hours.
* Projects stored in the database: **Save Project**, **Save As New Project**, open, update (revision-checked), delete, share with other users (view / edit).
* **Ctrl+S / Ctrl+Shift+S** never offers the page for download: it saves the *project data* to the database and says so only after the server confirms.
* **Generate PDF Report**: server-generated from the saved, recalculated project (project data, inputs, design basis, member properties, every check with demand / resistance / utilisation / status, warnings, assumptions; page numbers and revision). No equations, source code or UI.
* **Export / Import project data** (JSON with inputs and results only). There is no option anywhere to download the application source.
* All 13 tabs of the original tool: inputs, member / connection / column / joist / knee / decking / bracing results, summary and diagnosis, optimisation (server-side search with live progress), DXF drawings.

## Local development

Requires Node 20+ and a PostgreSQL database (Neon works).

```bash
npm install
cp .env.example .env.local        # then fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate                 # creates the tables
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' npm run create-admin
npm run dev                        # http://localhost:3000
```

On Windows PowerShell use `npm.cmd` instead of `npm` if script execution is disabled. If `next dev` / `next build` fails with
`EINVAL ... readlink ... .next` (the project lives in a OneDrive folder), delete the `.next` folder and run again.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Apply `db/migrations/*.sql` (once each) |
| `npm run create-admin` | Create / reset the administrator from `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| `npm run test:engine` | Engine smoke test + reference-case self-test (6 cases) |
| `npm run test:api` | End-to-end API tests against a running server (see header of `scripts/test-api.mjs`) |
| `npm run test:bundle` | After `build`: confirms no engine code or secrets in the browser bundle |
| `npm run db:cleanup-test` | Deletes the throw-away `@example.test` accounts created by `test:api` |

## Project layout

```
db/migrations/        SQL schema
scripts/              migrate, create-admin, tests
src/shared/           code that runs in BOTH places: input schema, units, check helpers (no calculation logic)
src/server/engine/    the calculation engine, optimiser, drawings. `server-only`: the build fails if the browser imports it
src/server/           database, sessions, validation, calculation service, PDF builder, optimiser session
src/app/api/          authenticated API routes
src/app/              pages: /login, / (projects), /p/[id] (the tool), /admin
src/components/       React UI
```
