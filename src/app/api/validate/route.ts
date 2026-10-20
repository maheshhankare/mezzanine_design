import { route, readJson, rateLimit } from '@/server/http';
import { validateInputsForSave } from '@/server/validate';

export const dynamic = 'force-dynamic';

// Validates a set of inputs (used when project data is imported from a file) without storing anything.
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('validate:' + user.id, 60, 60_000);
  const body = await readJson(req);
  const { inputs, errors } = validateInputsForSave(body.inputs);
  return { ok: errors.length === 0, errors, inputs };
});
