// Removes the throw-away accounts and data created by scripts/test-api.mjs (every e-mail ending in @example.test).
//   npm run db:cleanup-test
import { loadEnv } from './env';
import { Client } from 'pg';

async function main() {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL!.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full') });
  await c.connect();
  const ids = (await c.query(`select id from users where email like '%@example.test'`)).rows.map((r) => r.id);
  if (!ids.length) { console.log('nothing to clean'); await c.end(); return; }
  await c.query('begin');
  const p = await c.query('delete from projects where owner_id = any($1) returning id', [ids]);
  await c.query('delete from audit_log where user_id = any($1)', [ids]);
  await c.query(`delete from login_attempts where email like '%@example.test'`);
  const u = await c.query('delete from users where id = any($1) returning id', [ids]);
  await c.query('commit');
  console.log(`removed ${u.rowCount} test users and ${p.rowCount} projects`);
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
