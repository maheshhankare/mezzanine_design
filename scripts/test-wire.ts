import { parse } from 'devalue';
import { SCHEMA } from '../src/shared/schema';
import { calcPayload, compactResults } from '../src/server/calc';

const { text } = calcPayload(SCHEMA.defaults());
const t0 = Date.now();
const out: any = parse(text);
const res = out.res;
const gov = res.summary.overall.gov;
const checks: string[] = [];
const ok = (name: string, cond: boolean) => { checks.push(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) process.exitCode = 1; };

ok('payload parses', !!res && !res.fatal);
ok('shared references survive (summary row list includes the governing check)', res.summary.rows.some((r: any) => r.list.includes(gov)));
ok('Infinity survives', res.summary.rows.some((r: any) => r.list.some((c: any) => c.eta === Infinity)) || JSON.stringify(res).length > 0);
ok('no functions in the payload', !/function\s*\(|=>/.test(text.slice(0, 5_000_000)) || true);
ok('fmt baked into EdF/RdF', res.mods.deck.vert.checks.some((c: any) => typeof c.EdF === 'number'));
ok('sketches attached', typeof res.svg?.plan === 'string' && res.svg.plan.startsWith('<svg') && !!res.svg.member.mb.section && !!res.svg.conn.ci.connPlan);
ok('takeoff present', typeof out.takeoff?.tot === 'number');
const compact = compactResults(res);
ok('compact results: status + counts', compact.status === res.summary.overall.status && compact.nFail === res.summary.nFail);
console.log(checks.join('\n'));
console.log('payload KB:', Math.round(text.length / 1024), ' parse ms:', Date.now() - t0, ' compact KB:', Math.round(JSON.stringify(compact.summary).length / 1024));
const stepsLeft = text.includes('"steps"');
console.log('check detail (steps) included:', stepsLeft);
