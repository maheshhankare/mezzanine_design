'use client';

import { useEffect, useRef, useState } from 'react';
import { U } from '@/shared/util';
import { useDesign } from '@/state/DesignProvider';
import { api } from '@/lib/api';
import { APP_VERSION } from '@/lib/project';

const OK = /^IDENTICAL|^MATCH/;

// Versions and the SERVER-SIDE self-test: the calculation engine runs only on the server, so that is what is checked against the reference cases.
export function DiagDialog() {
  const { diagOpen, setDiagOpen, user, project, fingerprint, res, busy } = useDesign();
  const [info, setInfo] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!diagOpen) return;
    closeBtn.current?.focus();
    setErr(null);
    api('/api/diag').then(setInfo).catch((e) => setErr(e.message));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDiagOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [diagOpen, setDiagOpen]);

  if (!diagOpen) return null;

  const run = async () => {
    setRunning(true); setTest(null); setErr(null);
    try { setTest(await api('/api/diag', 'POST')); } catch (e: any) { setErr(e.message); } finally { setRunning(false); }
  };
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<tr><th>{k}</th><td>{children}</td></tr>);
  const status = busy ? 'calculating' : !res ? 'none' : res.fatal ? 'invalid inputs: no results' : res.summary.overall.status;

  return (
    <div id="diag" role="dialog" aria-modal="true" aria-labelledby="diagT" onClick={(e) => e.target === e.currentTarget && setDiagOpen(false)}>
      <div className="dg-box">
        <div className="dg-head">
          <h2 id="diagT">Diagnostics</h2>
          <button ref={closeBtn} type="button" className="btn" aria-label="Close" onClick={() => setDiagOpen(false)}>Close</button>
        </div>
        <p className="hint">The calculation engine runs on the server only. The self-test below runs the engine there against the recorded reference cases. A passing self-test shows reproducibility, not engineering correctness (see the QA log).</p>
        <table className="dg">
          <tbody>
            <Row k="Application">{APP_VERSION}</Row>
            <Row k="Calculation engine (server)">{info ? info.engineVersion : '…'}</Row>
            <Row k="Project data format">{info ? info.projectFormat : '…'}</Row>
            <Row k="Reference set">{info ? info.referenceSet : '…'}</Row>
            <Row k="Signed in as">{`${user.name} (${user.email}) · ${user.role}`}</Row>
            <Row k="Project">{project.id ? `${project.id} · revision ${project.revision} · ${project.access}` : 'not saved yet'}</Row>
            <Row k="Input fingerprint"><code>{fingerprint || '–'}</code></Row>
            <Row k="Results">{status}</Row>
          </tbody>
        </table>
        {err && <p className="d-bad">{err}</p>}
        <div className="obar">
          <button type="button" className="btn big-btn" disabled={running} onClick={run}>{running ? 'Running…' : 'Run server self-test'}</button>
        </div>
        {test && (
          <>
            <table className="dg dgt">
              <tbody>
                <tr><th>Case</th><th>Status</th><th>max η</th><th>Values compared</th><th>Bit-identical</th><th>Within tolerance</th><th>Max. rel. difference</th><th>Verdict</th><th>Time</th></tr>
                {test.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.id} {r.name}</td><td>{r.status}</td>
                    <td>{typeof r.eta === 'number' ? U.fmt(r.eta, 3) : r.eta === 'Inf' ? '∞' : r.eta || '–'}</td>
                    <td>{r.values || '–'}</td><td>{r.exact ?? '–'}</td><td>{r.withinTol ?? '–'}</td>
                    <td>{r.maxRel ? r.maxRel.toExponential(1) : r.values ? '0' : '–'}</td>
                    <td className={OK.test(r.verdict) ? 'd-ok' : 'd-bad'}>{r.verdict}</td><td>{r.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={test.pass ? 'd-ok' : 'd-bad'}><b>{test.pass ? `PASS: all ${test.rows.length} reference cases reproduce the reference results (relative tolerance ${test.tolerance.toExponential(0)}).` : 'DIFFERENCES FOUND: report this to the administrator.'}</b></p>
          </>
        )}
      </div>
    </div>
  );
}
