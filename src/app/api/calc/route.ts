import { route, readJson, rateLimit } from '@/server/http';
import { calcPayload } from '@/server/calc';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Calculation service: authenticated, rate limited, returns results only (devalue text: keeps shared references and Infinity).
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('calc:' + user.id, 300, 60_000);
  const body = await readJson(req);
  const { text } = calcPayload(body.inputs, body.units);
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
});
