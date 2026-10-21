'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CODE_REGISTER } from '@/shared/codeRegister';
import { defaultSettings, optionAvailability, validateSettings, type AnalysisSettings, type Standard } from '@/shared/analysisSettings';

// Analysis settings of the second-order frame analysis. Everything shown here comes from the shared validation and the code-verification register:
// an option that needs an unresolved decision is disabled and says why; nothing is enabled to make the form look complete.

const LABELS: Record<string, string> = { verified: 'verified', provisional: 'provisional', 'user-defined': 'user-defined values', blocked: 'blocked' };
const ck = { flexBasis: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 } as const; // checkbox rows
const pillClass = (s: string) => (s === 'verified' ? 'p-OK' : s === 'blocked' || s === 'pending' ? 'p-FAIL' : 'p-REVIEW');

export default function AnalysisSettingsPanel() {
  const [s, setS] = useState<AnalysisSettings>(defaultSettings('IS800'));
  const set = (p: Partial<AnalysisSettings>) => setS((o) => ({ ...o, ...p }));
  const v = useMemo(() => validateSettings(s), [s]);
  const av = useMemo(() => optionAvailability(s.standard), [s.standard]);
  const items = CODE_REGISTER.filter((i) => (s.standard === 'IS800' ? i.standard === 'IS 800' : s.standard === 'EN1993' ? i.standard === 'EN 1993-1-1' : false));
  const isIS = s.standard === 'IS800', isEN = s.standard === 'EN1993', isUser = s.standard === 'user';
  const num = (x: string) => (x === '' ? NaN : Number(x));
  const swayMode = s.sway?.mode ?? 'none';
  const bowMode = s.bow?.mode ?? 'none';
  const memberReason = av['member-design']?.reason;

  const setSway = (mode: string) => {
    if (mode === 'none') return set({ sway: undefined });
    const source = isIS && mode === 'notional-loads' ? 'code' : isUser ? 'user' : s.sway?.source ?? (isEN ? 'code' : 'user');
    set({ sway: { mode: mode as any, source, phi0: s.sway?.phi0, direction: s.sway?.direction ?? '+X' } });
  };
  const setBow = (mode: string) => {
    if (mode === 'none') return set({ bow: undefined });
    set({ bow: { mode: mode as any, source: isUser || isIS ? 'user' : s.bow?.source ?? 'code', e0OverL: s.bow?.e0OverL, curve: s.bow?.curve ?? 'b' } });
  };

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Analysis settings <small>second-order frame analysis</small></h1>
        <div className="tools"><Link className="btn" href="/">← Projects</Link></div>
      </header>

      <section className="card" aria-live="polite">
        <h3>Result labelling for these settings: <span className={`pill ${pillClass(v.label)}`}>{LABELS[v.label]}</span></h3>
        <p className="hint">A converged analysis is not proof of design-code compliance. The member design checks of both standards are not implemented yet, so no setting can produce a “code compliant” result.</p>
        {v.errors.length > 0 && <ul className="chk-err" role="alert">{v.errors.map((e, i) => <li key={i}><b className="no">{e.field}</b>{e.clause ? ` (${e.clause})` : ''}: {e.message}</li>)}</ul>}
        {v.warnings.length > 0 && <ul className="chk-warn">{v.warnings.map((e, i) => <li key={i}><b>{e.field}</b>{e.clause ? ` (${e.clause})` : ''}: {e.message}</li>)}</ul>}
        {v.errors.length === 0 && v.warnings.length === 0 && <p className="hint">No issues.</p>}
      </section>

      <section className="card">
        <h3>Design standard</h3>
        <form className="optf" onSubmit={(e) => e.preventDefault()}>
          <label>Standard
            <select value={s.standard} onChange={(e) => setS({ ...defaultSettings(e.target.value as Standard), standard: e.target.value as Standard })}>
              <option value="IS800">IS 800:2007</option>
              <option value="EN1993">EN 1993-1-1:2005 (+ National Annex)</option>
              <option value="user">None: user-defined values only</option>
            </select>
          </label>
          {isEN && (
            <>
              <label>National Annex
                <select disabled value="" aria-describedby="na-why"><option value="">none selected</option></select>
              </label>
              <p id="na-why" className="hint">The National Annex of the project has not been supplied, so none can be selected and none is assumed. Its choices (φ0, e0/L, α_cr limits, k, γM) stay unset.</p>
              <label style={{ ...ck, flexBasis: 'auto' }}><input type="checkbox" checked={s.acceptEurocodeTextValues} onChange={(e) => set({ acceptEurocodeTextValues: e.target.checked })} /> Use the values printed in the Eurocode text (φ0 = 1/200, Table 5.1, k = 0.5) <span className="hint">provisional until the Annex is verified</span></label>
              <label>Stability method, 5.2.2(3)
                <select value={s.stabilityMethod ?? ''} onChange={(e) => set({ stabilityMethod: (e.target.value || undefined) as any })}>
                  <option value="">not selected</option><option value="a">a) totally by the global analysis</option><option value="b">b) partly global, partly member checks (6.3)</option><option value="c">c) equivalent members</option>
                </select>
              </label>
            </>
          )}
        </form>
      </section>

      <section className="card">
        <h3>Analysis</h3>
        <form className="optf" onSubmit={(e) => e.preventDefault()}>
          <label>Order
            <select value={s.order} onChange={(e) => set({ order: e.target.value as any })}><option value="second">second order</option><option value="first">first order</option></select>
          </label>
          <label>Second-order theory
            <select value={s.theory} disabled={s.order === 'first'} onChange={(e) => set({ theory: e.target.value as any })}>
              <option value="II">Theory II</option>
              <option value="vonKarman">von Kármán</option>
            </select>
          </label>
          <label style={{ ...ck, flexBasis: 'auto' }}><input type="checkbox" checked={s.shearDeformation} onChange={(e) => set({ shearDeformation: e.target.checked })} /> Shear deformation (printed shear areas)</label>
          {(['EA', 'EI', 'GJ'] as const).map((k) => (
            <label key={k}>Stiffness factor {k}
              <input type="number" step="0.01" min="0.01" max="1.5" value={Number.isNaN(s.stiffnessFactors[k]) ? '' : s.stiffnessFactors[k]} onChange={(e) => set({ stiffnessFactors: { ...s.stiffnessFactors, [k]: num(e.target.value) } })} />
            </label>
          ))}
          <p className="hint" style={{ flexBasis: '100%' }}>Second order accounts for global P-Δ and member P-δ through one geometric-stiffness term. Theory II (linear strains) is the code-type second-order elastic analysis; von Kármán also shortens bent members, which the codes do not assume.</p>
          <label>Iteration limit (1–100)<input type="number" min={1} max={100} value={Number.isNaN(s.maxIterations) ? '' : s.maxIterations} onChange={(e) => set({ maxIterations: num(e.target.value) })} /></label>
          <label>Load steps<input type="number" min={1} max={100} value={Number.isNaN(s.loadSteps) ? '' : s.loadSteps} onChange={(e) => set({ loadSteps: num(e.target.value) })} /></label>
        </form>
      </section>

      <section className="card">
        <h3>Imperfections</h3>
        <p className="hint">Sway, bow, notional / equivalent loads and explicit geometry are different representations. They are not interchangeable and are never added for the same effect.</p>
        <form className="optf" onSubmit={(e) => e.preventDefault()}>
          <label>Global sway
            <select value={swayMode} onChange={(e) => setSway(e.target.value)}>
              <option value="none">none</option>
              <option value="notional-loads" disabled={!isIS} title={isIS ? av['sway.notional-loads']?.reason : 'IS 800 4.3.6 only'}>notional horizontal loads (IS 800 4.3.6)</option>
              <option value="equivalent-loads">equivalent horizontal loads ±φN{isEN ? ' (EN 5.3.2(7))' : ' (user-defined)'}</option>
              <option value="geometry">explicit geometric lean{isIS ? ' (user-defined: IS 800 has no provision)' : ''}</option>
            </select>
          </label>
          {s.sway && (
            <>
              <label>Source
                <select value={s.sway.source} disabled={isUser || (isIS && s.sway.mode === 'notional-loads')} onChange={(e) => set({ sway: { ...s.sway!, source: e.target.value as any } })}>
                  <option value="code">code{isEN ? ' (Eurocode text values / National Annex)' : ''}</option><option value="user">user-defined</option>
                </select>
              </label>
              {(s.sway.source === 'user' || isUser) && <label>φ0 (inclination, e.g. 0.005 = 1/200)<input type="number" step="0.0005" value={s.sway.phi0 ?? ''} onChange={(e) => set({ sway: { ...s.sway!, phi0: num(e.target.value) } })} /></label>}
              <label>Direction (one at a time)
                <select value={s.sway.direction} onChange={(e) => set({ sway: { ...s.sway!, direction: e.target.value as any } })}><option>+X</option><option>-X</option><option>+Y</option><option>-Y</option></select>
              </label>
            </>
          )}
          <label>Member bow
            <select value={bowMode} onChange={(e) => setBow(e.target.value)}>
              <option value="none">none</option><option value="geometry">explicit geometric bow (half sine)</option><option value="equivalent-loads">equivalent forces (EN Figure 5.4)</option>
            </select>
          </label>
          {s.bow && (
            <>
              <label>Source
                <select value={s.bow.source} disabled={isUser || isIS} onChange={(e) => set({ bow: { ...s.bow!, source: e.target.value as any } })}>
                  <option value="code" disabled={isIS || isUser}>code (EN Table 5.1)</option><option value="user">user-defined</option>
                </select>
              </label>
              {(s.bow.source === 'user' || isUser || isIS) && <label>e0/L (e.g. 0.004 = L/250)<input type="number" step="0.0005" value={s.bow.e0OverL ?? ''} onChange={(e) => set({ bow: { ...s.bow!, e0OverL: num(e.target.value) } })} /></label>}
              {isEN && s.bow.source === 'code' && <label>Buckling curve (Table 6.2)<select value={s.bow.curve} onChange={(e) => set({ bow: { ...s.bow!, curve: e.target.value as any } })}>{['a0', 'a', 'b', 'c', 'd'].map((c) => <option key={c}>{c}</option>)}</select></label>}
            </>
          )}
          <p className="hint" style={{ flexBasis: '100%', margin: '10px 0 0' }}><b>What else acts in the combinations that contain the imperfection</b></p>
            <label style={ck}><input type="checkbox" checked={s.otherLateralLoadsInCombination} onChange={(e) => set({ otherLateralLoadsInCombination: e.target.checked })} /> wind or earthquake</label>
            <label style={ck}><input type="checkbox" checked={s.temperatureInCombination} onChange={(e) => set({ temperatureInCombination: e.target.checked })} /> temperature effects</label>
            <label style={ck}><input type="checkbox" checked={s.usedForOverturningCheck} onChange={(e) => set({ usedForOverturningCheck: e.target.checked })} /> results used for overturning / overall instability / foundation shear</label>
            <label style={ck}><input type="checkbox" checked={s.imperfectionLoadsInLoadCases} onChange={(e) => set({ imperfectionLoadsInLoadCases: e.target.checked })} /> notional / equivalent imperfection loads are already in my load cases</label>
        </form>
      </section>

      <section className="card">
        <h3>Member design checks</h3>
        <form className="optf" onSubmit={(e) => e.preventDefault()}>
          <label style={ck}>
            <input type="checkbox" checked={s.memberChecks} disabled={isUser || !av['member-design']?.available} onChange={(e) => set({ memberChecks: e.target.checked })} /> Run member design checks
          </label>
          <p className="hint">{isUser ? 'Needs a design standard.' : `Not available yet: ${memberReason}`}</p>
        </form>
      </section>

      <section className="card">
        <h3>What is available for this standard</h3>
        <div className="tscroll">
          <table className="rt"><tbody>
            <tr><th>Option</th><th>State</th><th>Clause</th><th>Reason / outstanding</th></tr>
            {Object.entries(av).map(([k, a]) => <tr key={k}><td>{k}</td><td><span className={`pill ${a.state === 'verified' || a.state === 'user' ? 'p-OK' : a.state === 'provisional' ? 'p-REVIEW' : 'p-FAIL'}`}>{a.state}</span></td><td>{a.clause ?? ''}</td><td>{a.reason}</td></tr>)}
          </tbody></table>
        </div>
      </section>

      {items.length > 0 && (
        <section className="card">
          <h3>Code-verification register: {isIS ? 'IS 800:2007' : 'EN 1993-1-1:2005'}</h3>
          <p className="hint">{items[0].edition}. {isEN && items[0].nationalAnnex}</p>
          <div className="tscroll">
            <table className="rt"><tbody>
              <tr><th>Id</th><th>Clause</th><th>Status</th><th>Implementation</th><th>Test</th><th>Outstanding</th></tr>
              {items.map((i) => <tr key={i.id}><td className="nw">{i.id}</td><td>{i.clause}</td><td><span className={`pill ${pillClass(i.status)}`}>{i.status}</span></td><td>{i.implementation || 'none'}</td><td>{i.validation || 'none'}</td><td>{i.outstanding}</td></tr>)}
            </tbody></table>
          </div>
        </section>
      )}
    </main>
  );
}
