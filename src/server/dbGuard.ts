import 'server-only';

/**
 * Database host pin. EXPECTED_DATABASE_HOST names the only database host this deployment may connect to (set it separately for Preview and
 * Production on Vercel, e.g. the test database host for Preview). On Vercel (VERCEL_ENV set) it is required; locally it is optional.
 * A mismatch refuses the connection instead of quietly using another database. Returns null when the address may be used, otherwise the reason
 * (the reason never contains the address or a password).
 */
export function databaseUrlProblem(url: string | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!url) return 'DATABASE_URL is not configured';
  const expected = (env.EXPECTED_DATABASE_HOST || '').trim().toLowerCase();
  if (!expected) return env.VERCEL_ENV ? `EXPECTED_DATABASE_HOST is not configured for this ${env.VERCEL_ENV} deployment` : null;
  let u: URL;
  try { u = new URL(url); } catch { return 'DATABASE_URL is not a valid address'; }
  // libpq-style options in the address can redirect the connection to another host
  if (u.searchParams.has('host') || u.searchParams.has('hostaddr')) return 'DATABASE_URL contains a host option';
  if (u.hostname.toLowerCase() !== expected) return 'DATABASE_URL does not point to EXPECTED_DATABASE_HOST';
  return null;
}
