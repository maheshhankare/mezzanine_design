import { NextResponse } from 'next/server';
import { route, audit, HttpError } from '@/server/http';
import { pgFrameStore } from '@/server/frameStorePg';
import { readRun, ServiceError } from '@/server/frameService';
import { frameReportPdf } from '@/server/frameReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/frame/runs/:id/report: the PDF generated from the stored calculation record (nothing is recomputed).
export const GET = route({ auth: 'user' }, async ({ req, params, user }) => {
  const { id } = await params;
  let run;
  try { run = (await readRun(pgFrameStore, user.id, id)).run; } catch (e) { if (e instanceof ServiceError) throw new HttpError(e.status, e.message); throw e; }
  const pdf = await frameReportPdf(run.record as any);
  await audit(user, 'frame.report', req, run.projectId, { run: id });
  return new NextResponse(Buffer.from(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="IS800-calculation-record-${id.slice(0, 8)}.pdf"`, 'cache-control': 'no-store' } });
});
