# Architecture

## 1. The original application (review)

The starting point was one file, `index.html` (about 730 KB, 6,800 lines), written in plain HTML / CSS / JavaScript and opened in a browser:

| Part | Content | Where it ran |
|---|---|---|
| Calculation engine | section properties, EN 1993-1-3 effective widths, finite-strip method, beam FE and Vlasov thin-walled FE, load combinations, member checks, resistances, connections, box column, base plate, restraints, model orchestration | browser |
| Optimiser | parametric search over the full system model | browser |
| Drawings | DXF / SVG generation | browser |
| Reference data | reference results for the self-test, QA log, methods text | in the same file |
| User interface | tabs, forms, validation, result panels, report | browser |
| Persistence | design cases in `localStorage`, `.csbd.json` project file | browser |

Consequences: anyone who could open the page had the complete engine, the file could be saved with Ctrl+S, and "saving" meant a local file or browser storage.

### Hard-coded values (audit)

* **Project-specific values**: only the defaults of the input schema ("Example 3 mapped to C-sections") in `src/shared/schema.ts`. They are *template defaults*, not stored projects. Every value a user enters is now a database record (`projects.inputs`).
* **Engineering reference data** (steel grades, bolt classes, partial factors, section constants) is inside the engine / schema code and is version-controlled with the code. A separate, audited reference-data table was **not** introduced (see `docs/SECURITY.md`, limitations).
* **Proprietary logic**: `src/server/engine/*` (about 5,000 lines).

## 2. What runs where now

```
Browser (public JS: UI only)                   Server (Vercel functions)                      Neon PostgreSQL
-----------------------------                  -------------------------------------          ---------------
React UI, input forms,      --- /api/calc ---> validate inputs -> MODEL.compute -> sketches   users, projects,
display-unit conversion,    <-- results ------ (results only, devalue text)                   project_members,
schema (labels, limits)                        calculations, audit_log,
                            --- /api/projects  authenticate, authorise, validate, recalculate  login_attempts
                            --- /api/opt/*  -> optimiser (streamed progress)
                            --- /api/drawings -> DXF / SVG
                            <-- PDF ---------- /api/projects/[id]/report (pdf-lib)
```

* `src/server/engine/*` starts with `import "server-only"`: importing it from browser code makes the build fail.
* `src/shared/*` (browser **and** server): input schema, units, a 30-line check summariser. No calculation logic.
* The browser never receives the engine. It receives, per request: the result object (statuses, demand / resistance / utilisation, clauses, and, unless `DISCLOSE_CHECK_DETAIL=false`, the equation text and intermediate values of each check), and SVG sketches rendered on the server.
* Wire format: the result object shares references and contains `Infinity`, so it is serialised with [`devalue`](https://github.com/Rich-Harris/devalue) rather than JSON.

## 3. API

All routes require a session unless stated; mutating requests also pass an Origin check. Errors are JSON `{ "error": "..." }`.

| Route | Purpose |
|---|---|
| `POST /api/auth/login` (public), `POST /api/auth/logout`, `GET /api/auth/me` | session |
| `POST /api/calc` | calculation service (rate limited) |
| `POST /api/validate` | validate inputs (import) |
| `GET/POST /api/projects` | list / create (Save As New) |
| `GET/PUT/DELETE /api/projects/[id]` | open / update (revision-checked) / delete (owner) |
| `GET/POST/DELETE /api/projects/[id]/members` | authorised users (owner) |
| `GET /api/projects/[id]/export` | project data JSON |
| `GET /api/projects/[id]/report` | PDF report |
| `POST /api/drawings`, `POST /api/drawings/dxf` | drawing previews, DXF files |
| `POST /api/opt/render`, `/event`, `/run` | optimisation panel (server-rendered), events, streamed search |
| `GET/POST /api/diag` | versions, server self-test |
| `GET/POST /api/admin/users`, `PATCH /api/admin/users/[id]` | administrator only |

## 4. Database (`db/migrations/001_init.sql`)

* `users`: e-mail, name, salted scrypt hash, role (`admin` / `user`), `active`, `token_version` (bumped on disable / password reset: ends all sessions).
* `projects`: owner, name, reference, customer, contact, site, notes; `inputs jsonb` (every value entered); `revision`; latest calculation: `design_status`, `max_utilisation`, `n_fail`, `n_review`, `results jsonb` (module statuses, every check's demand / resistance / utilisation / status, warnings), `calculated_at`, `engine_version`, `input_fingerprint`.
* `project_members`: authorised users (`viewer` / `editor`).
* `calculations`: one row per saved calculation (history).
* `audit_log`: sign-ins, saves, deletes, report generation, administration.
* `login_attempts`: throttling.

Mezzanine dimensions, spans, grids, levels, loading, profiles, material and section data, bracing / connection parameters, boundary conditions and design settings are all inputs of the schema and are stored in `projects.inputs`; the structural results are stored in `projects.results`.

## 5. Authentication and authorisation

* Passwords: scrypt (N=16384, r=8, p=1), random 16-byte salt per password; constant-time comparison; equal work for unknown e-mails.
* Sessions: signed JWT (HS256, `AUTH_SECRET`) in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie, 8-hour lifetime. The user row is re-read on every request, so disabling a user or resetting a password ends their sessions immediately.
* Accounts are created / disabled / reset only by an administrator (`/admin`). Administrators manage accounts but have **no automatic access to other users' projects**.
* Project access: owner, or a member added by the owner. Everyone else receives `404` (existence not revealed). Viewers cannot modify; only the owner can delete or share.
* Login throttling: 5 failed attempts per e-mail and 25 per IP in 15 minutes (database-backed, works across serverless instances).
* Server-side validation: every input is checked against the schema (type, option membership, limits, whole numbers); unknown keys are rejected.
