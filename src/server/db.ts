import 'server-only';
import { Pool, type QueryResultRow } from 'pg';
import { databaseUrlProblem } from './dbGuard';

// One pool per server instance. The connection string comes from the environment only and never reaches the browser.
const g = globalThis as unknown as { __pool?: Pool };

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL ?? '';
    const problem = databaseUrlProblem(url || undefined);
    if (problem) throw new Error(`${problem}: database connection refused`);
    // make the TLS mode explicit (the driver treats "require" as "verify-full" and warns about it)
    const cs = url.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full');
    g.__pool = new Pool({ connectionString: cs, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  }
  return g.__pool;
}

export async function q<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params as any[])).rows;
}

export async function q1<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (run: typeof q) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const out = await fn(async (text, params = []) => (await c.query(text, params as any[])).rows as any);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
