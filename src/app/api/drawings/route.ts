import { route, readJson, rateLimit } from '@/server/http';
import { applyUnits, compute } from '@/server/calc';
import { sanitiseInputs } from '@/server/validate';
import { DWG } from '@/server/engine/dxf';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Drawing previews (SVG) and the member schedule, generated on the server from the calculated model.
export const POST = route({ auth: 'user' }, async ({ req, user }) => {
  rateLimit('dwg:' + user.id, 60, 60_000);
  const body = await readJson(req);
  const I = sanitiseInputs(body.inputs);
  applyUnits(body.units);
  const B = DWG.build(compute(I));
  if (B.error) return { error: B.error };
  return {
    status: B.status,
    schedule: B.schedule,
    layers: Object.keys(DWG.LAYERS),
    allFileName: DWG.fileName(I, 'drawings'),
    list: B.list.map((D: any) => ({ id: D.id, title: D.title, svg: DWG.svg(D, { maxH: 460 }), fileName: DWG.fileName(I, D.id) })),
  };
});
