import { route, readJson, rateLimit, HttpError } from '@/server/http';
import { applyUnits, compute } from '@/server/calc';
import { sanitiseInputs } from '@/server/validate';
import { DWG } from '@/server/engine/dxf';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// One drawing, or all drawings in one DXF (id = "drawings"), as a file download.
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('dxf:' + user.id, 30, 60_000);
  const body = await readJson(req);
  const I = sanitiseInputs(body.inputs);
  applyUnits(body.units);
  const B = DWG.build(compute(I));
  if (B.error) throw new HttpError(422, B.error);
  const id = String(body.id || 'drawings');
  const target = id === 'drawings' ? B.list : B.list.find((d: any) => d.id === id);
  if (!target) throw new HttpError(404, 'Unknown drawing');
  return new Response(DWG.dxf(target), {
    headers: { 'Content-Type': 'application/dxf', 'Content-Disposition': `attachment; filename="${DWG.fileName(I, id).replace(/[^\w.\-]+/g, '_')}"`, 'Cache-Control': 'no-store' },
  });
});
