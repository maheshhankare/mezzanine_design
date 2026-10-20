import { route, audit } from '@/server/http';
import { loadProject } from '@/server/projects';

export const dynamic = 'force-dynamic';

// Export Project Data: inputs, details and the stored result summary as JSON. Never any application code.
export const GET = route({ auth: 'user' }, async ({ req, user, params }) => {
  const { p } = await loadProject(params.id, user, 'viewer');
  const body = {
    format: 'mezzanine-project-data', formatVersion: 1, exportedAt: new Date().toISOString(),
    project: { name: p.name, reference: p.reference, customer: p.customer, customer_contact: p.customer_contact, site: p.site, notes: p.notes, revision: p.revision },
    inputs: p.inputs,
    results: p.results,
    status: { design_status: p.design_status, max_utilisation: p.max_utilisation, calculated_at: p.calculated_at, engine_version: p.engine_version },
  };
  await audit(user, 'project.export', req, p.id);
  const file = (p.name || 'project').replace(/[^\w-]+/g, '_').slice(0, 80) + '.project.json';
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } });
});
