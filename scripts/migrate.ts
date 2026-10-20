// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import { loadEnv } from './env';
import { Client } from 'pg';

async function main() {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const f of readdirSync('db/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) { console.log('skip ', f); continue; }
    await c.query('begin');
    try {
      await c.query(readFileSync(`db/migrations/${f}`, 'utf8'));
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
      await c.query('commit');
      console.log('apply', f);
    } catch (e) {
      await c.query('rollback');
      throw e;
    }
  }
  await c.end();
}
main().catch((e) => { console.error('migration failed:', e.message); process.exit(1); });
