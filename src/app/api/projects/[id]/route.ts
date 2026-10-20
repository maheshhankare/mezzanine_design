import { route, readJson, audit, HttpError } from '@/server/http';
import { q, tx } from '@/server/db';
import { validateInputsForSave, validateMeta } from '@/server/validate';
import { calcForStorage, loadProject, publicProject, recordCalculation } from '@/server/projects';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Open Project
export const GET = route({ auth: 'user' }, async ({ user, params }) => {
  const { p, access } = await loadProject(params.id, user);
  return { project: publicProject(p, access) };
});

// Update Project: replaces inputs / details of the same record (no duplicate). expectedRevision guards against overwriting a newer save.
export const PUT = route({ auth: 'user' }, async ({ req, user, params }) => {
  const { p } = await loadProject(params.id, user, 'editor');
  const body = await readJson(req);
  const meta = validateMeta(body.meta ?? { name: p.name, reference: p.reference, customer: p.customer, customer_contact: p.customer_contact, site: p.site, notes: p.notes });
  const { inputs, errors } = validateInputsForSave(body.inputs ?? p.inputs);
  if (errors.length) throw new HttpError(422, 'Some inputs are not valid, nothing was saved', { errors });
  if (body.expectedRevision !== undefined && +body.expectedRevision !== p.revision)
    throw new HttpError(409, 'This project was changed by someone else (or in another window) since you opened it. Nothing was saved.', { currentRevision: p.revision });
  const c = calcForStorage(inputs);
  const saved = await tx(async (run) => {
    const [u] = await run(
      `update projects set name=$2, reference=$3, customer=$4, customer_contact=$5, site=$6, notes=$7, inputs=$8, revision = revision + 1,
              design_status=$9, max_utilisation=$10, n_fail=$11, n_review=$12, results=$13, calculated_at=now(), engine_version=$14, input_fingerprint=$15, updated_at=now()
        where id=$1 and revision=$16 returning revision, updated_at`,
      [p.id, meta.name, meta.reference, meta.customer, meta.customer_contact, meta.site, meta.notes, JSON.stringify(inputs), c.status, c.maxEta, c.nFail, c.nReview,
        JSON.stringify(c.summary), c.engine, c.fingerprint, p.revision],
    );
    if (!u) throw new HttpError(409, 'This project was changed by someone else since you opened it. Nothing was saved.');
    await recordCalculation(run, p.id, user.id, u.revision, c);
    return u;
  });
  await audit(user, 'project.update', req, p.id, { revision: saved.revision });
  return { id: p.id, revision: saved.revision, updated_at: saved.updated_at, design_status: c.status };
});

// Delete Project: owner only.
export const DELETE = route({ auth: 'user' }, async ({ req, user, params }) => {
  const { p } = await loadProject(params.id, user, 'owner');
  await q('delete from projects where id = $1', [p.id]);
  await audit(user, 'project.delete', req, p.id, { name: p.name });
  return { ok: true };
});
