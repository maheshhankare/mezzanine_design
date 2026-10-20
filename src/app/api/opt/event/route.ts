import { route, readJson, rateLimit } from '@/server/http';
import { eventOpt } from '@/server/optsession';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('opte:' + user.id, 240, 60_000);
  return eventOpt(await readJson(req, 4_000_000));
});
