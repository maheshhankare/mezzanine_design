'use client';

import { useEffect, useRef, useState } from 'react';
import { XCHK } from '@/engine/xcheck';
import { U } from '@/engine/util';
import { useDesign } from '@/state/DesignProvider';
import { diagSnapshot } from '@/lib/diag';
import { download } from '@/lib/store';

const OK = /^IDENTICAL|^MATCH/;

type Test = { started: string; rows: any[]; done: boolean; pass: boolean };

export function DiagDialog() {
  const { diagOpen, setDiagOpen, diagState } = useDesign();
  const [test, setTest] = useState<Test | null>(null);
  const [running, setRunning] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!diagOpen) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDiagOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [diagOpen, setDiagOpen]);

  if (!diagOpen) return <div id="diag" role="dialog" aria-modal="true" aria-labelledby="diagT" hidden />;

  const S = diagSnapshot(diagState(), test),
    b = S.browser;

  const run = () => {
    if (running) return;
    setRunning(true);
    const t: Test = { started: new Date().toISOString(), rows: [], done: false, pass: false };
    setTest({ ...t });
    const g = XCHK.selfTest();
    const step = () => {
      const r = g.next();
      if (r.done) {
        t.done = true;
        t.pass = t.rows.every((x) => OK.test(x.verdict));
        setRunning(false);
        setTest({ ...t, rows: [...t.rows] });
        return;
      }
      t.rows.push(r.value);
      setTest({ ...t, rows: [...t.rows] });
      setTimeout(step, 20);
    };
    setTimeout(step, 30);
  };

  // diagnostic report: versions, browser, features, fingerprints, result summary and self-test; no project inputs, names or design cases
  const exportReport = () => {
    const name = `csbd-diagnostics_${b.name.replace(/[^\w]+/g, '-')}_${XCHK.localDate()}.json`;
    const body = Object.assign({ generated: new Date().toISOString(), note: 'Contains no project inputs, names or design cases.' }, S, {
      inputs: Object.assign({}, S.inputs, { name: S.inputs.name ? '(withheld)' : '' }),
    });
    download(name, JSON.stringify(body, null, 2), 'application/json');
  };

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<tr><th>{k}</th><td>{children}</td></tr>);

  return (
    <div id="diag" role="dialog" aria-modal="true" aria-labelledby="diagT" onClick={(e) => e.target === e.currentTarget && setDiagOpen(false)}>
      <div className="dg-box">
        <div className="dg-head">
          <h2 id="diagT">Compatibility and diagnostics</h2>
          <button ref={closeBtn} type="button" className="btn" aria-label="Close" onClick={() => setDiagOpen(false)}>Close</button>
        </div>
        <p className="hint">Compare this panel in two browsers or on two computers: the same application version, the same input fingerprint and a passing self-test mean the same calculation. Cross-browser agreement is not proof of engineering correctness (see the QA log).</p>
        <table className="dg">
          <tbody>
            <Row k="Application">{S.appVersion}</Row>
            <Row k="Calculation engine">{S.engineVersion}</Row>
            <Row k="Project-file format">{S.projectFormat}</Row>
            <Row k="Dependencies">{S.dependencies}</Row>
            <Row k="Engineering data">{S.engineeringData}</Row>
            <Row k="Browser">{`${b.name} ${b.version} · ${b.engine}`}</Row>
            <Row k="Platform">{`${b.platform} · ${b.language} · time zone ${b.timeZone} · ${b.screen}`}</Row>
            <Row k="Opened from">{`${b.protocol}${b.secure ? ' (secure context)' : ''}`}</Row>
            <Row k="Browser features">{S.missing.length ? <span className="d-bad">missing: {S.missing.join('; ')}</span> : <span className="d-ok">all available</span>}</Row>
            <Row k="Inputs from">{S.inputs.source + (S.inputs.name ? ` “${S.inputs.name}”` : '') + (S.inputs.edited ? ', then edited' : '') + ` · ${S.inputs.changedFromDefaults} input(s) differ from the defaults`}</Row>
            <Row k="Input fingerprint"><code>{S.inputs.fingerprint}</code></Row>
            <Row k="Results">
              {S.results.status} · {S.results.current ? <span className="d-ok">correspond to the current inputs</span> : <span className="d-bad">NOT current: recalculating</span>}
              {S.results.resultFingerprint && <> · result fingerprint <code>{S.results.resultFingerprint}</code></>}
            </Row>
            <Row k="Elementary maths">
              {S.mathProbeReference ? (
                S.mathProbe === S.mathProbeReference ? <span className="d-ok">bit-identical to the reference engine</span> : <span className="d-warn">last-digit differences from the reference engine (normal between browsers; see the self-test for their effect)</span>
              ) : S.mathProbe}
            </Row>
            <Row k="Reference set">{S.referenceSet}</Row>
          </tbody>
        </table>
        <div className="obar">
          <button type="button" className="btn big-btn" disabled={running} onClick={run}>{running ? 'Running…' : 'Run cross-browser self-test'}</button>
          <button type="button" className="btn" onClick={exportReport}>Export diagnostics (JSON)</button>
        </div>
        {test && (
          <>
            <table className="dg dgt">
              <tbody>
                <tr><th>Case</th><th>Status</th><th>max η</th><th>Values compared</th><th>Bit-identical</th><th>Within tolerance</th><th>Max. rel. difference</th><th>Verdict</th><th>Time</th></tr>
                {test.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id} {r.name}</td>
                    <td>{r.status}</td>
                    <td>{typeof r.eta === 'number' ? U.fmt(r.eta, 3) : r.eta === 'Inf' ? '∞' : r.eta || '–'}</td>
                    <td>{r.values || '–'}</td>
                    <td>{r.exact === undefined ? '–' : r.exact}</td>
                    <td>{r.withinTol === undefined ? '–' : r.withinTol}</td>
                    <td>{r.maxRel ? r.maxRel.toExponential(1) : r.values ? '0' : '–'}</td>
                    <td className={OK.test(r.verdict) ? 'd-ok' : 'd-bad'}>
                      {r.verdict}
                      {r.nFail ? <><br /><small>{r.fails.slice(0, 3).map((f: any, i: number) => <span key={i}>{(f.check || f.path) + ': ' + f.exp + ' → ' + f.act}<br /></span>)}</small></> : null}
                    </td>
                    <td>{r.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={test.pass ? 'd-ok' : 'd-bad'}>
              <b>
                {test.done
                  ? test.pass
                    ? `PASS: all ${test.rows.length} reference cases reproduce the reference results in this browser (relative tolerance ${XCHK.RTOL.toExponential(0)}, statuses exact).`
                    : 'DIFFERENCES FOUND: export the diagnostics and send them with the browser details.'
                  : 'Running…'}
              </b>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
