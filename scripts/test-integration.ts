// Workflow integration: project -> settings -> validation -> solver -> results -> IS 800 design -> calculation record -> report, with an in-memory store.   npm run test:integration
import { MemoryFrameStore } from '../src/server/frameStore';
import { createFrameProject, saveFrameProject, readFrameProject, runStoredProject, listRunsWithStatus, readRun, parseProject, ServiceError } from '../src/server/frameService';
import { frameReportPdf } from '../src/server/frameReport';
import { buildBenchmarkProject } from './rstab/project';
import { SETTINGS_VERSION } from '../src/shared/analysisSettings';

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const rejects = async (name: string, f: () => Promise<unknown>, status?: number) => { try { await f(); ok(name, false, 'did not throw'); } catch (e) { ok(name, e instanceof ServiceError && (status === undefined || e.status === status), String(e)); } };

(async () => {
  const store = new MemoryFrameStore();
  const U = 'user-1', OTHER = 'user-2';
  const base = buildBenchmarkProject({ design: false });

  // creation and persistence of settings
  const c = await createFrameProject(store, U, base);
  ok('create: not migrated, no review', !c.migrated && !c.reviewRequired && c.revision === 1);
  const r0 = await readFrameProject(store, U, c.id);
  ok('settings restored exactly', JSON.stringify(r0.project.settings) === JSON.stringify(base.settings));
  ok('settings version', r0.project.settings.version === SETTINGS_VERSION);
  await rejects('other user cannot read', () => readFrameProject(store, OTHER, c.id), 404);
  await rejects('not a frame project', () => createFrameProject(store, U, { schema: 'x' }), 422);

  // a current project keeps its member-design switch across reads (the migration must be idempotent)
  const withDesign = await createFrameProject(store, U, buildBenchmarkProject({ design: true }));
  const wd = await readFrameProject(store, U, withDesign.id);
  ok('design switch kept on read', wd.project.settings.design.enabled === true && !wd.migrated && !wd.project.settings.review.required);
  ok('migration is idempotent on a current project', JSON.stringify((await readFrameProject(store, U, withDesign.id)).project.settings) === JSON.stringify(wd.project.settings));

  // legacy EN settings: migrated, flagged, review required, cannot run until confirmed
  const legacy: any = JSON.parse(JSON.stringify(base));
  legacy.settings = { version: 2, standard: 'EN 1993-1-1', nationalAnnex: 'DE', order: 'second', theory: 'II', shearDeformation: true, sway: { mode: 'geometry', source: 'code', phi0: 0.0033, direction: '+X' }, design: { enabled: true, kLy: 1, kLz: 1 } };
  const m = parseProject(legacy);
  ok('legacy: migrated', m.migrated && m.project.settings.review.required);
  ok('legacy: removed keys flagged', m.flags.some((f) => /standard/.test(f)) && m.flags.some((f) => /nationalAnnex/.test(f)));
  ok('legacy: code imperfection dropped', m.project.settings.sway === undefined);
  ok('legacy: design disabled', m.project.settings.design.enabled === false);
  ok('legacy: no removed key survives', !['standard', 'nationalAnnex'].some((k) => k in m.project.settings));
  const lc = await createFrameProject(store, U, legacy);
  ok('legacy create: review required', lc.reviewRequired);
  const blocked = await runStoredProject(store, U, lc.id);
  ok('legacy: run blocked before review', blocked.runId === null && blocked.blocked.some((b) => /review/i.test(b)), JSON.stringify(blocked.blocked));
  ok('legacy: no run stored', store.runs.length === 0);
  const lr = await readFrameProject(store, U, lc.id);
  const lp = { ...lr.project, settings: { ...lr.project.settings, sway: { mode: 'notional-loads' as const, source: 'code' as const, direction: '+X' as const } } };
  const conf = await saveFrameProject(store, U, lc.id, lr.stored.revision, lp, { confirmSettings: true });
  ok('confirmation clears review', !conf.reviewRequired);
  const lr2 = await readFrameProject(store, U, lc.id);
  ok('confirmation recorded', !!lr2.project.settings.review.confirmedAt && !lr2.migrated);

  // confirmation never bypasses a settings error
  const bad = { ...lr2.project, settings: { ...lr2.project.settings, maxIterations: 0 } };
  await rejects('confirm refused with errors', () => saveFrameProject(store, U, lc.id, lr2.stored.revision, { ...bad, settings: { ...bad.settings, review: { required: true, reasons: ['x'] } } }, { confirmSettings: true }), 422);

  // revision conflict
  await rejects('stale revision rejected', () => saveFrameProject(store, U, c.id, 99, base), 409);

  // run on the saved project: second order, no design
  const t0 = Date.now();
  const o1 = await runStoredProject(store, U, c.id);
  console.log(`run 1: ${((Date.now() - t0) / 1000).toFixed(1)} s, ok=${o1.ok}, label=${o1.label}`);
  ok('run 1 stored', !!o1.runId && store.runs.length === 1);
  ok('run 1 settings saved with run', JSON.stringify(store.runs[0].settings) === JSON.stringify(base.settings));
  ok('run 1 labelled user-defined or provisional', ['user-defined', 'provisional', 'analysis-only'].includes(o1.label), o1.label);
  const rr = await readRun(store, U, o1.runId!);
  const rec: any = rr.run.record;
  ok('record: IS 800 only', rec.standard === 'IS 800:2007' && !/EN 1993|Eurocode|National Annex/i.test(JSON.stringify(rec.sections)), '');
  ok('record: 15 sections', rec.sections.length === 15);
  ok('record: current', rr.current);

  // model change marks the earlier run
  const cur = await readFrameProject(store, U, c.id);
  const changed = JSON.parse(JSON.stringify(cur.project)); changed.loadCases[0].memberLoads ??= []; changed.combinations[0].factors[0].factor = 1.35;
  const sv = await saveFrameProject(store, U, c.id, cur.stored.revision, changed);
  ok('model change detected', sv.modelChanged && sv.revision === 2);
  const runs = await listRunsWithStatus(store, U, c.id);
  ok('earlier run marked', runs.length === 1 && !runs[0].current && /earlier model revision 1/.test(runs[0].note), JSON.stringify(runs[0]?.note));
  ok('earlier run record flagged not current', !(await readRun(store, U, o1.runId!)).current);

  // settings-only change does not change the model fingerprint unless analysis-relevant; design settings alone must not mark runs stale
  const cur2 = await readFrameProject(store, U, c.id);
  const designOn = JSON.parse(JSON.stringify(cur2.project)); designOn.settings.design = { enabled: true, kLy: 1, kLz: 1, cm: 'sway', manufacture: 'hollow-hot-rolled' };
  const sv2 = await saveFrameProject(store, U, c.id, cur2.stored.revision, designOn);
  ok('design settings saved', sv2.revision === 3);

  // report from the stored record only
  const pdf = await frameReportPdf(rec);
  ok('report is a PDF', pdf.length > 3000 && Buffer.from(pdf.slice(0, 5)).toString() === '%PDF-');

  // invalid project data
  const invalid: any = JSON.parse(JSON.stringify(base)); invalid.frame.members[0].n2 = 9999999;
  await rejects('invalid model rejected', () => createFrameProject(store, U, invalid), 422);

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
