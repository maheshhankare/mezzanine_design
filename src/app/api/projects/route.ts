import { route, readJson, audit, HttpError } from '@/server/http';
import { q, tx } from '@/server/db';
import { validateInputsForSave, validateMeta } from '@/server/validate';
import { calcForStorage, recordCalculation } from '@/server/projects';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/projects: the signed-in user's own projects and those shared with them (no inputs, no results).
export const GET = route({ auth: 'user' }, async ({ user }) => {
  const rows = await q(
    `select p.id, p.name, p.reference, p.customer, p.site, p.design_status, p.max_utilisation, p.revision, p.updated_at, p.created_at,
            u.name as owner_name, case when p.owner_id = $1 then 'owner' else m.role end as access
       from projects p join users u on u.id = p.owner_id
       left join project_members m on m.project_id = p.id and m.user_id = $1
      where p.owner_id = $1 or m.user_id is not null
      order by p.updated_at desc limit 500`,
    [user.id],
  );
  return { projects: rows };
});

// POST /api/projects: create a new project ("Save" of a new project and "Save As New Project").
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  const body = await readJson(req);
  const meta = validateMeta(body.meta ?? body);
  const { inputs, errors } = validateInputsForSave(body.inputs);
  if (errors.length) throw new HttpError(422, 'Some inputs are not valid, nothing was saved', { errors });
  const c = calcForStorage(inputs);
  const created = await tx(async (run) => {
    const [p] = await run(
      `insert into projects (owner_id, name, reference, customer, customer_contact, site, notes, inputs, design_status, max_utilisation, n_fail, n_review,
                             results, calculated_at, engine_version, input_fingerprint)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14, $15) returning id, revision, updated_at`,
      [user.id, meta.name, meta.reference, meta.customer, meta.customer_contact, meta.site, meta.notes, JSON.stringify(inputs), c.status, c.maxEta, c.nFail, c.nReview,
        JSON.stringify(c.summary), c.engine, c.fingerprint],
    );
    await recordCalculation(run, p.id, user.id, p.revision, c);
    return p;
  });
  await audit(user, 'project.create', req, created.id, { name: meta.name });
  return { id: created.id, revision: created.revision, updated_at: created.updated_at, design_status: c.status };
});
