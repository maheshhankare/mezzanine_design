import { existsSync, readFileSync } from 'node:fs';

/** Loads .env.local for the command-line scripts (Next.js loads it itself for the app). Existing environment variables win. */
export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const l of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');
}
