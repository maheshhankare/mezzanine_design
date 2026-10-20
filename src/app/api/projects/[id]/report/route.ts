import { route, audit, rateLimit, HttpError } from '@/server/http';
import { loadProject } from '@/server/projects';
import { applyUnits, compute, toWire } from '@/server/calc';
import { buildReport } from '@/server/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PDF report of the SAVED project state: inputs are read from the database and recalculated here, so the report always matches what is stored.
export const GET = route({ auth: 'user' }, async ({ req, user, params }) => {
  rateLimit('pdf:' + user.id, 20, 60_000);
  const { p } = await loadProject(params.id, user, 'viewer');
  applyUnits({});
  const res = compute(p.inputs);
  if (res.fatal) throw new HttpError(422, 'The saved inputs are incomplete or invalid: correct them and save before generating a report.');
  toWire(res);
  const pdf = await buildReport({
    project: { name: p.name, reference: p.reference, customer: p.customer, customer_contact: p.customer_contact, site: p.site, notes: p.notes, revision: p.revision, owner: p.owner_name },
    inputs: p.inputs, res, generatedAt: new Date(),
  });
  await audit(user, 'report.pdf', req, p.id, { revision: p.revision });
  const file = `${(p.name || 'report').replace(/[^\w-]+/g, '_').slice(0, 60)}_rev${p.revision}.pdf`;
  return new Response(pdf as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${file}"`, 'Cache-Control': 'no-store' } });
});
