import { route, readJson, rateLimit } from '@/server/http';
import { renderOpt } from '@/server/optsession';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('optr:' + user.id, 120, 60_000);
  return renderOpt(await readJson(req, 4_000_000));
});
