import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

// scrypt with a random 16-byte salt per password. Stored as  scrypt$N$r$p$salt(b64)$hash(b64).
const N = 16384, R = 8, P = 1, KEYLEN = 64;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((res, rej) => scryptCb(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? rej(e) : res(k as Buffer))));

export const PASSWORD_MIN = 10;

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required';
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > 200) return 'Password is too long';
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), h.toString('base64')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expect = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), +n, +r, +p);
  return got.length === expect.length && timingSafeEqual(got, expect);
}

// Used to spend the same time when the e-mail does not exist, so login timing does not reveal which e-mails are registered.
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(KEYLEN).toString('base64');
