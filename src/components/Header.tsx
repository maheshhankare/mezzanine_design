'use client';

import { useEffect, useRef } from 'react';
import { XCHK } from '@/engine/xcheck';
import { useDesign } from '@/state/DesignProvider';
import { APP_VERSION, takeoff } from '@/lib/project';
import { F, etaTxt } from '@/lib/format';
import { Pill } from './common';

const Kp = ({ lab, children, cls }: { lab: string; children: React.ReactNode; cls?: string }) => (
  <div className={`kp${cls ? ' ' + cls : ''}`}>
    <span>{lab}</span>
    <b>{children}</b>
  </div>
);

export function Header() {
  const d = useDesign();
  const { res, I } = d;
  const fileIn = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLElement>(null);

  // the sticky header's height is used by the left navigation and by anchors (--hh)
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty('--hh', (ref.current?.offsetHeight ?? 0) + 'px');
    set();
    window.addEventListener('resize', set);
    const ro = new ResizeObserver(set);
    if (ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', set);
      ro.disconnect();
    };
  }, []);

  let kpi: React.ReactNode;
  if (!res || res.fatal)
    kpi = (
      <>
        <Kp lab="Inputs"><Pill st="REVIEW" /></Kp>
        <Kp lab="Results" cls="gv">Inputs invalid: no results</Kp>
      </>
    );
  else {
    const S = res.summary,
      gov = S.overall.gov,
      row = gov ? S.rows.find((r: any) => r.list.includes(gov)) : null,
      tk = takeoff(res, I);
    kpi = (
      <>
        <Kp lab="Overall"><Pill st={S.overall.status} /></Kp>
        <Kp lab="Max utilisation">{gov ? etaTxt(gov) : '–'}</Kp>
        <Kp lab="FAIL / REVIEW">{`${S.nFail} / ${S.nReview}`}</Kp>
        {tk && <Kp lab="Steel">{`${F(tk.perArea, 1)} kg/m²`}</Kp>}
        {row && <Kp lab="Governing" cls="gv">{`${row.label}: ${gov.name}`}</Kp>}
      </>
    );
  }

  return (
    <header ref={ref}>
      <h1>
        C-Section Beam System Designer <small id="ver">{APP_VERSION} · engine {XCHK.ENGINE_VERSION}</small>
      </h1>
      <p className="lead">
        Lipped C-section beam systems for storage and racking mezzanines to EN 1990 / EN 1993-1-1, -1-3, -1-5 and -1-8: floor → surface / decking → SB-Int and SB-End secondaries → connections → main beam → box column → base plate. Restraints are credited only when they are demonstrated; every check shows its clause, equation, inputs, mechanism and remedy, with optimisation, DXF drawings and a printable design report.
      </p>
      <div className="hbar">
        <div className="tools">
          <label className="clab" htmlFor="caseSel">Design case</label>
          <select
            id="caseSel"
            aria-label="Design cases"
            value=""
            onChange={(e) => d.loadCase(e.target.value)}
          >
            <option value="">Design cases…</option>
            {d.caseNames.map((n) => <option key={n}>{n}</option>)}
          </select>
          <button id="bSave" type="button" onClick={d.saveCase}>Save case</button>
          <button id="bDel" type="button" onClick={d.deleteCase}>Delete case</button>
          <button id="bExport" type="button" title="Save the project (inputs, versions, result summary) as a .csbd.json file" onClick={d.exportProject}>Export</button>
          <button id="bImport" type="button" title="Open a .csbd.json project file" onClick={() => fileIn.current?.click()}>Import</button>
          <input
            id="fileIn"
            ref={fileIn}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) d.importFile(f);
              e.target.value = '';
            }}
          />
          <button id="bLink" type="button" onClick={d.copyLink}>Copy link</button>
          <button id="bDiag" type="button" title="Versions, browser, input fingerprint, cross-browser self-test" onClick={() => d.setDiagOpen(true)}>Diagnostics</button>
          <button id="bPrint" type="button" onClick={d.printReport}>Print report</button>
          <button id="bReset" type="button" onClick={d.resetAll}>Reset</button>
          <div className="themesel" role="radiogroup" aria-label="Screen theme">
            <button type="button" role="radio" aria-checked={d.theme === 'light'} title="Light Mode" onClick={() => d.setTheme('light', true)}>☀ Light</button>
            <button type="button" role="radio" aria-checked={d.theme === 'dark'} title="Dark Mode" onClick={() => d.setTheme('dark', true)}>☾ Dark</button>
          </div>
        </div>
        <div id="kpi">{kpi}</div>
      </div>
    </header>
  );
}

export { APP_VERSION };
