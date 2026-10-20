// Creates (or resets the password of) an administrator account.
// Usage:  set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local (or the shell), then:  npm run create-admin
// The credentials are read from the environment only; they are never stored in the source.
import { loadEnv } from './env';
import { Client } from 'pg';
import { hashPassword, passwordProblem } from '../src/server/auth/password';

async function main() {
  loadEnv();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ADMIN_EMAIL is missing or not an e-mail address');
  const problem = passwordProblem(pw);
  if (problem) throw new Error('ADMIN_PASSWORD: ' + problem);
  const hash = await hashPassword(pw);
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `insert into users (email, name, password_hash, role) values ($1, $2, $3, 'admin')
     on conflict ((lower(email))) do update set password_hash = excluded.password_hash, role = 'admin', active = true,
       token_version = users.token_version + 1, updated_at = now()
     returning id, (xmax = 0) as created`,
    [email, process.env.ADMIN_NAME || 'Administrator', hash],
  );
  console.log(r.rows[0].created ? 'created administrator' : 'updated administrator (password reset, sessions invalidated)', email);
  await c.end();
}
main().catch((e) => { console.error('create-admin failed:', e.message); process.exit(1); });
