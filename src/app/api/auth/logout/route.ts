import { route, audit } from '@/server/http';
import { clearSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export const POST = route({ auth: 'none' }, async ({ req, user }) => {
  await clearSession();
  if (user) await audit(user, 'logout', req);
  return { ok: true };
});
