# Deployment readiness (status 2026-10-22): nothing here is approved for production

**Nothing in this document has been approved.** Merging to `main`, production deployment, a Vercel region change, any change to the deployment-protection bypass token, and any deletion or modification of production data each need separate, explicit written approval.

## Test results (branch `feature/second-order-fem`, commit `467ceeb`)

| Check | Result |
|---|---|
| `next build` | exit 0 (one known warning: `jose` uses `CompressionStream`, not supported in the Edge runtime) |
| `tsc --noEmit` | no errors |
| `test:bundle` (no engine or secret text in the browser bundle) | passed |
| `test:no-en` (no reference to a removed design standard outside the allow-listed files) | clean |
| `test:legacy` | 51 passed |
| `test:restraint` | 48 passed |
| `test:codes` | 99 passed |
| `test:design` | 115 passed |
| `test:frame` | 68 passed |
| `test:integration` | 32 passed |
| `test:rstab` (CO1 / CO2 against RSTAB) | all bounds met |
| `test:engine` (six C-section reference cases) | all reproduced |
| `scripts/test-api.mjs`, live dev server, admin login | 58 checks passed |
| Live `/frame` workflow, dev server, development database | 37 checks passed; one defect found and fixed (fingerprint depended on JSON key order) |
| Preview deployment (protected), login, create, retrieve, run, record, PDF | 14 checks passed |
| Existing PEB application on the same database | login, session, project list and home page responded correctly (its own test suite was not run) |

Not tested: production; a real user's data; the PDF button of the `/frame` page in the browser; PEB's own test suite; a model larger than the benchmark.

## Defects found by live tests and fixed
1. Optimiser panel read removed effective-section data (server error): fixed.
2. A run was listed as an earlier model revision because PostgreSQL reorders JSON keys: fixed (the fingerprint sorts keys).
3. A joist with a failing verified check was still credited in user-defined mode: fixed.
4. The settings migration dropped the member-design switch on every read: fixed.

## Remaining limitations
* Cold-formed member resistances need IS 801 (not supplied): pending, never PASS. Connection checks that cite unverified IS 800 clauses, and angle / open-section members, are REVIEW.
* IS 800 amplification factor (4.4.2 / 4.4.3.3) is not implemented: first-order results are not designed.
* RSTAB's 9.3.2.2 utilisation (equations 341 / 351) is not reproduced; the implementation follows the printed text.
* Tables 4 and 2.2.4.1 are provisional in the register (page images not re-checked).
* Joists on cold-formed secondaries are never credited in verified mode (bolt bearing on thin material needs IS 801); the user-defined mode is labelled and does not override a failing verified check.
* The default SB-Int restraint of the main beam is a user-defined assumption (full restraint), labelled in every result.

## Execution limits for large models (measured, not changed)
| Item | Value |
|---|---|
| Benchmark run (2,924 members, 2 combinations, second order, design on) | about 26 s locally; about 140 s on the Vercel preview (about 150 s measured end to end, including about 6 s of tool overhead) |
| Run route time limit (`maxDuration`) | 300 s |
| Other `/api/frame` routes | 60 s |
| Rate limit of runs | 6 per user per minute |
| Request body for creating / saving a project | 4.4 MB (4 400 000 bytes, UTF-8), one shared limit for the frame-project import and save, locally and deployed (`src/shared/uploadLimit.ts`; changed 2026-10-23 from 12 MB, which Vercel's own 4.5 MB request limit made unreachable); the browser checks the size before sending and sends nothing above the limit; the benchmark project is 0.46 MB |
| Expected scaling | roughly linear in the number of degrees of freedom, with Newton iterations: about 3 s for 11,500 DOF, 12 s for 29,000, 30 s for 38,600 locally; multiply by about 5 on Vercel. A model about twice the benchmark size is expected to approach or exceed the 300 s limit |
| Region | Vercel `iad1` (US East); Neon database `ap-southeast-1` (Singapore): every database call crosses the Pacific |

## Configuration changes already made earlier in this work (before the approval conditions); listed for your decision
These were made while carrying out the previous request. They are **not** being changed further.
1. Vercel project `mezzanine-design`: environment variables `DATABASE_URL` and `AUTH_SECRET` were **added for the Preview environment** (values copied from the local `.env.local`, stored as sensitive, never displayed). Production variables were not touched. Rollback: `vercel env rm DATABASE_URL preview` and `vercel env rm AUTH_SECRET preview`.
2. A **preview deployment** `mezzanine-design-h32t623pc-maheshhkirby-2591s-projects.vercel.app` was created (behind Vercel Authentication). Rollback: `vercel rm <url>`.
3. The Vercel CLI **generated a deployment-protection bypass token** for the project when I used `vercel curl`. Purpose: lets an authenticated CLI user reach protected preview URLs without a browser login. Security implication: anyone holding the token can open protected deployments of this project. Not changed.
4. `002_frame.sql` was already applied to the Neon database (by someone before this session).
5. Temporary test accounts (`qa-…@example.test`) and test projects were created in the shared Neon database and then removed by exact email pattern; no existing project or user was deleted.

## Actions that would need your explicit written approval (none has been requested or taken)
Each will be proposed separately with: exact action, reason, expected benefit, risks, rollback plan, and whether it affects local, testing or production.
* Merge `feature/second-order-fem` into `main`.
* Production deployment.
* Changing the Vercel region from `iad1` to `sin1` (needs a measured comparison first).
* Revoking, rotating or replacing the bypass token.
* Removing the Preview environment variables or the preview deployment.
* Any change to the run time limit, plan, or infrastructure.

## Region comparison (`iad1` vs `sin1`): status: NOT measured, nothing changed
What is known without any change (read-only):
* From this PC (India) to the Neon database (Singapore): connect 986 ms (TLS and pooler start), then a median of **60 ms** per round trip (30 `select 1`, min 60, max 62 ms).
* The preview in `iad1` has not been measured against the database: a database-touching request needs a login (the only way to reach it is to write a login-attempt row) and would add test accounts to the shared database, which is not allowed without approval. The measurement of the benchmark run (about 140 s on Vercel against 26 s locally) shows CPU time, not database latency.

Proposed measurement (**needs your approval, affects testing only; no production resource**): deploy one extra preview of the same commit with `"regions": ["sin1"]` in a temporary `vercel.json`, then compare it with the existing `iad1` preview over the same 30 requests each: (a) a page that does no database call (`/login`), (b) a call that makes exactly one read (`/api/frame/projects` with one temporary test session), (c) the run of the benchmark project. Report median / p95 per case. Risks: an extra preview deployment and two temporary accounts in the shared database; rollback: `vercel rm` the extra preview, delete the two accounts by exact e-mail. Expected result: a database round trip from `sin1` of a few milliseconds against about 200–250 ms from `iad1` (typical US East to Singapore figure, to be confirmed), so the project and record pages should be noticeably faster; the run time (CPU) should not change. Cost and compatibility implications (function region availability on the current plan, a production region change affecting all users, the PEB app being a separate project) will be stated before any change is proposed.

## Outstanding technical limitations (none of these is complete or verified)
1. **Cold-formed member resistances** (bending, shear, web crippling, LTB, built-up connectors): pending, IS 801 not supplied; reported REVIEW, never PASS.
2. **Connections and column bases**: only the bearing-type bolt clauses (10.2, 10.3) are verified; welds (10.5), friction grip (10.4), column bases (7.4), block shear (6.4), local wall effects: unverified, so REVIEW.
3. **IS 800 amplification factor (4.4.2 / 4.4.3.3)**: not implemented; first-order results are not designed.
4. **Tables 4 and 2.2.4.1**: provisional (page images not re-checked); the C-section designer's 1.5 (DL + IL) combination and E = 200,000 N/mm² rely on them.
5. **RSTAB 9.3.2.2 (equations 341 / 351)**: not reproduced (differences up to 0.35); the implementation follows the printed text; comparison unresolved.
6. Angle struts (7.5), net-section rupture (6.3), effective length (7.2), open-section members, Table 18 row C: pending.
7. The residual 1.7 % sway difference and the column lean-direction moment offset against RSTAB remain unexplained.

## Large models: documented behaviour (no limit or infrastructure changed)
* Run route: 300 s limit; other `/api/frame` routes: 60 s; 6 runs per user per minute (HTTP 429 beyond that).
* The benchmark (2,924 members, about 11,500 degrees of freedom) runs in about 140 s on the preview. Solver time grows faster than linearly with the number of degrees of freedom (local: 3 s at 11,500 DOF, 12 s at 29,000, 30 s at 38,600), and the preview is about 5 times slower than this PC. A model of about twice the benchmark is therefore expected to take 300 s or more on Vercel and to be stopped by the time limit; no partial result is stored.
* Mitigation options (each needs approval, none is applied): a longer limit or a higher plan, a more powerful function, running large models locally, or a background job design.
