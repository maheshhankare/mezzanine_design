# Deployment (Vercel + Neon)

GitHub Pages cannot host this application (it needs server code and a database). Use **Vercel** for the Next.js app and **Neon** (or any PostgreSQL) for data.

## 1. Before deploying

1. Make the GitHub repository **private** (see `docs/SECURITY.md`, section 2).
2. Rotate the Neon password if it has ever been shared outside Neon / Vercel.

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production and Preview). **Never commit them.**

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (pooled), e.g. `postgresql://USER:PASSWORD@HOST/neondb?sslmode=require` |
| `AUTH_SECRET` | random string, 32+ characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DISCLOSE_CHECK_DETAIL` | optional. `false` removes equation text and intermediate values from API responses (default: shown) |

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are used only by the `create-admin` script on your own machine, never by the deployed app. Changing `AUTH_SECRET` signs everybody out.

## 3. Database

From your machine, with `DATABASE_URL` in `.env.local` (or in the shell):

```bash
npm run db:migrate        # creates tables (safe to repeat: applied migrations are skipped)
ADMIN_EMAIL=you@yourcompany.com ADMIN_PASSWORD='a long unique password' npm run create-admin
```

The administrator then signs in at `/login`, opens **Manage users** on the project list, and creates the other accounts.
Re-running `create-admin` for an existing e-mail resets that administrator's password and ends their sessions.

## 4. Deploy

Vercel dashboard → **Add New → Project → Import** the private GitHub repository → framework "Next.js" is detected → set the environment variables → Deploy. Every push to the chosen branch redeploys. HTTPS is automatic.

Or from a terminal: `npx vercel login`, then `npx vercel --prod`.

Settings worth checking after the first deploy:

* Function duration: `/api/opt/run` asks for 300 s; the available maximum depends on the Vercel plan.
* The report function includes the font files (`outputFileTracingIncludes` in `next.config.ts`). Open one PDF report after deploying to confirm.
* Add the production domain only in Vercel; the app has no CORS configuration because it is same-origin only.

## 5. Backups and database access

* Neon keeps point-in-time history (retention depends on the plan): Neon console → project → **Backup & Restore**. Check the retention window and, for important data, schedule `pg_dump` exports as well.
* Use a database role for the app with only the access it needs, keep `DATABASE_URL` only in Vercel and your own `.env.local`, and restrict who can open the Neon project.
* Restore tests: create a branch from a past point in time in Neon and run `npm run test:api` against it.

## 6. Operating notes

* Disable a user in **Manage users**: their sessions stop working immediately.
* The `audit_log` table records sign-ins (including failures), saves, deletions, report generation and administration; query it in the Neon SQL editor.
* Test accounts created by `npm run test:api` end in `@example.test`; remove them with `npm run db:cleanup-test`.
