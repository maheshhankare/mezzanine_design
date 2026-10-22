// IS 800:2007-only conversion of the C-section designer: no other route can be selected or reached, stored projects of a removed route are migrated and must be
// reviewed, nothing unverified gives PASS, cold-formed member resistances are pending.   npm run test:legacy
import { SCHEMA } from '../src/shared/schema';
import { MODEL } from '../src/server/engine/model';
import { CHK, clauseVerified } from '../src/shared/check';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name} ${detail}`); } };
const REMOVED = /EN ?19\d\d|EN ?10\d{3}|EN ISO|Eurocode|National Annex|AISI|AISC|ASCE ?7|SCI P\d+|CIDECT/i;

// ---- the schema offers one design standard
const code = SCHEMA.byId.code;
ok('schema: one design standard', code.opts.length === 1 && code.opts[0][0] === 'IS' && code.def === 'IS');
for (const k of ['na', 'gM0', 'gM1', 'gM2', 'gG', 'gQ', 'combo', 'psi0']) ok(`schema: removed input "${k}"`, !(k in SCHEMA.byId));
ok('schema: no grade of another standard', SCHEMA.GRADES.every((g: any) => g[0] === 'user' || /IS 2062/.test(g[1])));
ok('schema: E default = IS 800 2.2.4.1 (200 000 N/mm²)', SCHEMA.byId.E.def === 200000);
const text = JSON.stringify(SCHEMA.T);
ok('schema: no mention of a removed standard', !REMOVED.test(text), (text.match(REMOVED) || [''])[0]);

// ---- migration of stored inputs of a removed route
const legacy = { code: 'EN', na: 'Recommended values', gM0: 1.0, gM1: 1.0, gM2: 1.25, gG: 1.35, gQ: 1.5, combo: '610ab', psi0: 1, mb_gr: 'S355', mb_fy: 355, mb_fu: 490, mb_t: 2 };
const m = SCHEMA.migrate(legacy);
ok('migrate: flagged', m.migrated && m.flags.length >= 9);
ok('migrate: code becomes IS', m.inputs.code === 'IS');
ok('migrate: removed inputs dropped', !['na', 'gM0', 'gM1', 'gM2', 'gG', 'gQ', 'combo', 'psi0'].some((k) => k in m.inputs));
ok('migrate: the user\'s f_y and f_u are kept, the grade becomes user-defined', m.inputs.mb_gr === 'user' && m.inputs.mb_fy === 355 && m.inputs.mb_fu === 490);
ok('migrate: review required', m.inputs.mig_ack === 'no');
ok('migrate AISI', SCHEMA.migrate({ code: 'AISI' }).inputs.code === 'IS' && SCHEMA.migrate({ code: 'AISI' }).inputs.mig_ack === 'no');
const again = SCHEMA.migrate(m.inputs);
ok('migrate: idempotent (nothing more to flag, the review flag stays)', !again.migrated && again.inputs.mig_ack === 'no');
const plain = SCHEMA.migrate({ code: 'IS' });
ok('migrate: an IS project is untouched', !plain.migrated && plain.inputs.mig_ack === undefined);

// ---- an obsolete route cannot trigger a calculation
let r: any = MODEL.compute(legacy);
ok('compute: a migrated project is not calculated before the review', r.fatal === true && r.msgs.some((x: any) => x.id === 'mig_ack'));
r = MODEL.compute({ ...m.inputs, mig_ack: 'yes' });
ok('compute: after the review it is calculated with IS 800', !r.fatal && r.R.code === 'IS');
r = MODEL.compute({ code: 'EN' });
ok('compute: code "EN" never selects another route', r.fatal === true || r.R.code === 'IS');
ok('compute: the route has no other standard\'s factors', !('gM0' in r.R) && r.R.gm0 === 1.10 && r.R.ulsText.includes('IS 800'));

// ---- the default project
r = MODEL.compute(SCHEMA.defaults());
ok('default: IS 800 route', !r.fatal && r.R.code === 'IS' && /IS 800/.test(r.R.name));
const all: any[] = [];
for (const row of r.summary.rows) for (const c of row.list) all.push(c);
ok('default: checks exist', all.length > 50);
ok('default: no check, clause, note or step of a removed standard', !all.some((c) => REMOVED.test([c.name, c.clause, c.note, c.eq, c.why, c.fix, ...(c.steps || []).map((s: any) => s[1])].join(' '))),
  all.filter((c) => REMOVED.test([c.name, c.clause, c.note].join(' '))).map((c) => c.name).slice(0, 5).join('; '));
ok('default: nothing that cites an unverified provision is PASS or FAIL', all.every((c) => c.status === 'N/A' || c.basis === 'user' || c.basis === 'num' || clauseVerified(c.clause) || c.status === 'REVIEW'),
  all.filter((c) => c.status !== 'N/A' && c.status !== 'REVIEW' && c.basis !== 'user' && c.basis !== 'num' && !clauseVerified(c.clause)).map((c) => c.name + ' [' + c.clause + ']').slice(0, 5).join('; '));
const rhs = (name: RegExp) => all.filter((c) => name.test(c.name));
for (const n of [/Lateral-torsional buckling/, /Shear \(web\)/, /Major-axis bending, sagging/, /Built-up connectors/]) {
  const cs = rhs(n);
  ok(`default: cold-formed resistance pending: ${n}`, cs.length > 0 && cs.every((c) => c.status === 'REVIEW' && c.pending === true && c.Rd === undefined && c.eta === null));
}
ok('default: the elastic buckling analysis is still reported (M_cr)', !!r.mods.sbi && Number.isFinite(r.mods.sbi.Mcr) && r.mods.sbi.Mcr > 0);
ok('default: no effective-section resistance object', r.mods.sbi.eff === null && r.mods.sbi.dsm === null);
ok('default: joint model nominally pinned, no joint stiffness', r.mods.conn.ci.stiff.cls === 'nominally pinned' && r.mods.conn.ci.stiff.Kc === 0);
ok('default: the only credited restraint is the USER-DEFINED SB-Int restraint of the main beam, labelled review', (() => { const d = r.mods.mb.gov; const cr = [...d.spec.restr.lat, ...d.spec.restr.latC, ...d.spec.restr.tor, ...d.spec.restr.torC].filter((q: any) => q.credited); return cr.length > 0 && cr.every((q: any) => /USER-DEFINED/.test(q.why)) && d.checks.some((c: any) => /User-defined lateral restraint/.test(c.name) && c.status === 'REVIEW'); })());
ok('no restraint is credited for the secondaries (surface, joists)', ['sbi', 'sbe'].every((k) => r.mods[k].error || [...r.mods[k].spec.restr.lat, ...r.mods[k].spec.restr.latC, ...r.mods[k].spec.restr.tor, ...r.mods[k].spec.restr.torC].every((q: any) => !q.credited)));
const noJ: any = MODEL.compute({ ...SCHEMA.defaults(), mb_lat: 'user', mb_latJ: '' });
ok('user-defined restraint without a justification is refused', noJ.fatal === true && noJ.msgs.some((x: any) => x.id === 'mb_latJ'));
const none: any = MODEL.compute({ ...SCHEMA.defaults(), mb_lat: 'none' });
ok('restraint "none": end forks only (lower M_cr)', none.mods.mb.gov.Mcr < r.mods.mb.gov.Mcr);

// ---- the box column: verified IS 800 hollow-section design, effective lengths required
const base = { ...SCHEMA.defaults(), col_type: 'rhsH', col_frame: 'user', col_ky: 1, col_kz: 1 };
r = MODEL.compute(base);
const col = r.mods.col.checks;
const numeric = col.filter((c: any) => c.status === 'PASS' || c.status === 'FAIL');
ok('column RHS: verified IS 800 checks are calculated (PASS / FAIL with a number)', numeric.length >= 4 && numeric.every((c: any) => Number.isFinite(c.eta)), col.map((c: any) => c.name + ':' + c.status).join(' | '));
ok('column RHS: compression buckling uses IS 800 7.1.2', col.some((c: any) => /7\.1\.2/.test(c.clause)));
r = MODEL.compute({ ...base, col_frame: 'knee', col_base: 'fix' });
ok('column: a frame configuration without user k factors is pending, nothing assumed', r.mods.col.checks.length >= 1 && r.mods.col.checks.every((c: any) => c.status === 'REVIEW' || c.status === 'N/A'));
r = MODEL.compute({ ...base, col_type: 'weld' });
ok('column: a welded box is pending (outside the verified scope)', r.mods.col.checks.some((c: any) => c.pending && /Welded box/.test(c.name)));

// ---- the clause gate
ok('gate: verified IS 800 clauses', clauseVerified('IS 800:2007 8.4.1') && clauseVerified('IS 800 9.3.2.2') && clauseVerified('IS 800:2007 7.1.2') && clauseVerified('IS 800:2007 6.2'));
ok('gate: unverified IS 800 clauses', clauseVerified('IS 800:2007 8.3.4') && !clauseVerified('IS 800:2007 10.5.7.1.1') && !clauseVerified('IS 800:2007 7.4.3.1') && !clauseVerified('IS 800:2007 (verify)') && !clauseVerified('IS 800:2007 6.3'));
ok('gate: other standards that were not supplied', !clauseVerified('IS 801') && !clauseVerified('IS 456:2000 31.6') && !clauseVerified('IS 875 Part 2'));
ok('gate: no standard cited', clauseVerified('') && clauseVerified('project limit'));
const c1 = CHK.mk({ grp: 'g', name: 'bolt', clause: 'IS 800:2007 10.5.7.1.1', Ed: 1, Rd: 10, unit: 'kN' });
ok('gate: an unverified provision is REVIEW even with a small utilisation', c1.status === 'REVIEW' && c1.basis === 'unverified');
const c2 = CHK.mk({ grp: 'g', name: 'shear', clause: 'IS 800:2007 8.4.1', Ed: 1, Rd: 10, unit: 'kN' });
ok('gate: a verified provision gives PASS', c2.status === 'PASS');
const c3 = CHK.mk({ grp: 'g', name: 'shear', clause: 'IS 800:2007 8.4.1', Ed: 11, Rd: 10, unit: 'kN' });
ok('gate: a verified provision gives FAIL', c3.status === 'FAIL');
const p1 = CHK.pending({ grp: 'g', name: 'x', clause: 'IS 801', Ed: 5, unit: 'kN' }, 'needs IS 801');
ok('pending: demand shown, no resistance, REVIEW', p1.status === 'REVIEW' && p1.Ed === 5 && p1.Rd === undefined && p1.eta === null);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
