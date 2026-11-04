# Mezzanine Design — cold-formed C-section mezzanine designer

Design, analysis, optimisation and reporting of **light-gauge steel mezzanines**: cold-formed lipped C-section floor members (main beams, intermediate joists SB-Int, end beams SB-End) on hollow-section columns with vertical X-bracing, for storage and industrial floors.

**Design basis — Indian Standards first:** IS 801:1975 (cold-formed members, working stress), IS 800:2007 (hollow sections, bolts, welds, bases, Section 12 bracing), IS 1893 (Part 1):2016 (earthquake), IS 875 (loads), IS 456:2000. EN 1993-1-1 / 1-3 / 1-5 are used **only** where the Indian Standard was reviewed and gives no method; every such check is labelled with its code basis.

> **Engineering status.** The software reports every check as PASS, FAIL, PENDING (missing data or unverified provision) or REVIEW (engineering judgement). A missing check is never shown as PASS. Results are reproducible and regression-tested, but **no independent engineering validation has been performed**; a qualified engineer must review every design before use.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Getting started](#getting-started)
4. [Tests](#tests)
5. [Documentation index](#documentation-index)
6. [Excel check workbook](#excel-check-workbook)
7. [Project layout](#project-layout)
8. [Roadmap](#roadmap)
9. [Known limitations](#known-limitations)

---

## Features

**Design engine (server only, engine 2.5.0)**
* Section properties of generated C sections (centre-line model with rounded corners), single and back-to-back.
* IS 801 member checks: effective width, lip adequacy, flat-width and web limits, bending, lateral buckling, web shear / bending / crippling, built-up connectors, bracing of channels.
* Connections (bolts, plates, welds), box / hollow columns, base plates, decking, knee braces.
* **Whole-structure design**: 3D model, second-order gravity analysis with notional forces, response-spectrum seismic analysis, accidental torsion, drift, brace and connection design (OCBF).
* **Optimize Design**: bounded search over framing direction, joist count, generated C sections, bracing layouts, columns and connections; the lightest design that passes the full analysis is saved as a new revision, with its complete candidate history.

**Projects and records**
* Sign-in with administrator-managed accounts; per-project sharing (viewer / editor).
* Every saved revision keeps its inputs: **revision history**, PDF report of any earlier revision, restore as a new revision.
* Stored results carry engine version and input fingerprint; out-of-date records are flagged.
* Server-generated **PDF calculation report** with calculation identity (project, revision, input fingerprint, engine).
* Export / import of project data (JSON), DXF drawings.

**Review and insights**
* QA readiness checklist and design assistant (explanations taken from the recorded checks — no generated values).
* Explained optimisation (framings, layouts, weight-vs-utilisation trade-off, every candidate and decision).
* Design comparison of two revisions, sensitivity runs (exploratory), 3D wire-frame view, engineering decision log.
* Project dashboard, search and filters; workspace pages (usage live; organisations, roles and billing shown as previews).

## Architecture

```
Browser (React UI, no engine)  ──>  Next.js API routes (session, permission, validation, audit)
                                       ├── calculation service  ──> src/server/engine (server-only)
                                       ├── whole-structure design / Optimize Design (src/server/structure)
                                       ├── projects & revisions, decision log
                                       └── PDF reports
                                    PostgreSQL: users, projects, project_revisions, calculations, decisions, audit log
```
Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/saas/01_AUDIT_ARCHITECTURE_AND_PLAN.md`](docs/saas/01_AUDIT_ARCHITECTURE_AND_PLAN.md).

## Getting started

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env.local          # fill in DATABASE_URL and AUTH_SECRET (never commit .env.local)
npm run db:migrate                   # applies db/migrations/*.sql once each
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' npm run create-admin
npm run dev                          # http://localhost:3000
```
Windows: use `npm.cmd` in PowerShell if script execution is disabled; if `next dev` / `next build` fails with `EINVAL … readlink … .next` (OneDrive folder), delete `.next` and retry. More: [`docs/LOCAL_RUN.md`](docs/LOCAL_RUN.md), [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Tests

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm run test:engine` | engine reference cases (reproducibility self-test) |
| `npm run test:rstab` | second-order frame solver against RSTAB benchmark bounds |
| `npm run test:codes`, `test:design`, `test:status` | code-check results, status rules (no PASS without a verified check) |
| `npm run test:is801`, `test:en`, `test:no-en` | IS 801 checks, EN gap checks, code-scope guard |
| `npm run test:restraint`, `test:tension`, `test:conn-ecc`, `test:slenderness`, `test:critical`, `test:seismic`, `test:final`, `test:legacy` | engineering regression suites |
| `npm run test:structure` | whole-structure design and Optimize Design |
| `npm run test:frame` | frame-analysis module |
| `npm run test:auth`, `test:upload`, `test:routes`, `test:projects` | sessions, upload limits, route ownership and roles (in-memory database stand-in) |
| `npm run test:projects-pg` | revisions, locks and constraints against a real **local test** PostgreSQL |
| `npm run test:pdf` | PDF report generation |
| `npm run test:api`, `test:integration`, `test:bundle` | live server, integration, browser bundle contains no engine (after `build`) |

## Documentation index

**Engineering**
| Document | Content |
|---|---|
| [CALCULATION_METHODS.md](docs/CALCULATION_METHODS.md) | methods used by the engine |
| [STRUCTURE_OPTIMISATION.md](docs/STRUCTURE_OPTIMISATION.md) | whole-structure design and Optimize Design |
| [IS_CODE_COMPLIANCE_REGISTER.md](docs/IS_CODE_COMPLIANCE_REGISTER.md), [CODE_REGISTER.md](docs/CODE_REGISTER.md) | clauses implemented, verified and open |
| [IS800_DESIGN.md](docs/IS800_DESIGN.md), [IS800_ROUTE.md](docs/IS800_ROUTE.md), [IS800_JOIST_RESTRAINT.md](docs/IS800_JOIST_RESTRAINT.md), [IS800_ONLY_CONVERSION.md](docs/IS800_ONLY_CONVERSION.md) | IS 800 provisions and design route |
| [SECOND_ORDER.md](docs/SECOND_ORDER.md), [SECOND_ORDER_TECHNICAL_NOTE.md](docs/SECOND_ORDER_TECHNICAL_NOTE.md) | second-order frame solver |
| [RSTAB_BENCHMARK.md](docs/RSTAB_BENCHMARK.md), [RSTAB_TEST_MODELS.md](docs/RSTAB_TEST_MODELS.md) | benchmark against RSTAB |
| [TECHNICAL_DECISIONS_6.3_6.4.md](docs/TECHNICAL_DECISIONS_6.3_6.4.md), [TECHNICAL_VALIDATION_REPORT_6.3_6.4.md](docs/TECHNICAL_VALIDATION_REPORT_6.3_6.4.md) | IS 800 6.3 / 6.4 decisions and validation |
| [FOUNDATION_AND_LOCAL_CHECK_REFERENCES.md](docs/FOUNDATION_AND_LOCAL_CHECK_REFERENCES.md), [REFERENCES.md](docs/REFERENCES.md) | references |
| [VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) | validation status |
| [MASTER_ISSUE_REGISTER.md](docs/MASTER_ISSUE_REGISTER.md), [PENDING_ITEMS.md](docs/PENDING_ITEMS.md), [OUTSTANDING_ITEMS_REGISTER.md](docs/OUTSTANDING_ITEMS_REGISTER.md), [REQUIRED_DOCUMENTS.md](docs/REQUIRED_DOCUMENTS.md) | open issues, decisions needed, documents required |
| [COMPLETION_REPORT_2026-10-26.md](docs/COMPLETION_REPORT_2026-10-26.md) | completion report |

**Software, security and deployment**
| Document | Content |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | application architecture, API, database, authentication |
| [SECURITY.md](docs/SECURITY.md) | what is protected, checklist, test results, limitations |
| [DEPLOY.md](docs/DEPLOY.md), [DEPLOYMENT_READINESS.md](docs/DEPLOYMENT_READINESS.md), [LOCAL_RUN.md](docs/LOCAL_RUN.md) | hosting, environment, readiness, local run |

**Product roadmap (SaaS)**
| Document | Content |
|---|---|
| [01 Audit, architecture and plan](docs/saas/01_AUDIT_ARCHITECTURE_AND_PLAN.md) | verified audit, target architecture, five phases |
| [02 Product requirements and backlog](docs/saas/02_PRODUCT_REQUIREMENTS_AND_BACKLOG.md) | requirements by module, prioritised backlog |
| [03 Tenant data model and security](docs/saas/03_TENANT_DATA_MODEL_AND_SECURITY.md) | organisations, roles, row-level security, security plan |
| [04 Pricing and monetisation research](docs/saas/04_PRICING_AND_MONETISATION_RESEARCH.md) | research plan and cost model (no prices set) |
| [05 Deployment-readiness requirements](docs/saas/05_DEPLOYMENT_READINESS_REQUIREMENTS.md) | checklist for a multi-customer service |
| [06 Phase 1 validation report](docs/saas/06_PHASE1_VALIDATION_REPORT.md) | revision history, stale records, run lock — tests |
| [07 Front end for all phases](docs/saas/07_FRONTEND_ALL_PHASES.md) | screens, data sources, live vs preview |

## Excel check workbook

[`docs/excel_tool`](docs/excel_tool) — an independent, formula-driven Excel check of a defined subset of the calculation (sections, IS 801 member checks, columns, bracing, connections, bases, seismic weight), compared with the application results.
* `Mezzanine_Design_Professional_v2.xlsx` (recommended: simplified input tabs, dimensioned sketches, force diagrams) and v1
* `README_Excel_Tool.pdf` (user guide), `VALIDATION_REPORT.md`, `Mezzanine_Design_Calculation_Report.pdf`
* `Mezzanine_Design_Macros.bas` (optional VBA, not tested), `source/` (scripts that rebuild the workbooks)

## Project layout

```
db/migrations/        SQL schema (001 init, 002 frame, 003 structure, 004 revisions, 005 decisions)
scripts/              migrate, create-admin, test suites
src/shared/           shared by browser and server: input schema, units, check helpers, plans (no calculation logic)
src/server/engine/    calculation engine (server-only: the build fails if the browser imports it)
src/server/structure/ whole-structure model, analysis, sizing and Optimize Design
src/server/           database, sessions, validation, projects & revisions, PDF
src/app/api/          authenticated API routes
src/app/              pages: /login, / (projects), /p/[id] (designer), /frame, /settings, /admin
src/components/       React UI (panels/Insights.tsx: review & insights)
docs/                 engineering, software and product documentation; Excel tool
```

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 Stabilise | reliable calculation records, revision history, stale detection, run lock, route security tests | first increment done |
| 2 Differentiate | explained optimisation, comparison, sensitivity, decision log, QA checklist | front end done |
| 3 SaaS foundation | organisations, roles, row-level security, invitations, MFA, background jobs, stored reports | planned |
| 4 Commercial | plans, entitlements, usage accounting, payments | planned (no prices set) |
| 5 Scale | DXF / IFC exchange, cost data, more structural modules | planned |

## Known limitations

* Fixed column bases are an analysis assumption; fixity, anchors in concrete and slab punching are not demonstrated (PENDING).
* Grating capacity needs the manufacturer's load table; IS 800 amendments and material certificates are outstanding.
* Long optimisation runs execute inside one web request (a job system is planned).
* Organisations, billing and multi-factor authentication are not implemented yet.
* No independent engineering validation has been performed.

---
*Not for construction without review and approval by a qualified structural engineer.*
