'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDesign } from '@/state/DesignProvider';
import { APP_VERSION } from '@/lib/project';
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
  const { res, takeoff, project, canEdit } = d;
  const fileIn = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLElement>(null);

  // the sticky header's height is used by the left navigation and by anchors (--hh)
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty('--hh', (ref.current?.offsetHeight ?? 0) + 'px');
    set();
    window.addEventListener('resize', set);
    const ro = new ResizeObserver(set);
    if (ref.current) ro.observe(ref.current);
    return () => { window.removeEventListener('resize', set); ro.disconnect(); };
  }, []);

  let kpi: React.ReactNode;
  if (!res || res.fatal)
    kpi = (
      <>
        <Kp lab="Inputs"><Pill st="REVIEW" /></Kp>
        <Kp lab="Results" cls="gv">{res ? 'Inputs invalid: no results' : 'Calculating…'}</Kp>
      </>
    );
  else {
    const S = res.summary, gov = S.overall.gov, row = gov ? S.rows.find((r: any) => r.list.includes(gov)) : null;
    kpi = (
      <>
        <Kp lab="Overall"><Pill st={S.overall.status} /></Kp>
        <Kp lab="Max utilisation">{gov ? etaTxt(gov) : '–'}</Kp>
        <Kp lab="FAIL / REVIEW">{`${S.nFail} / ${S.nReview}`}</Kp>
        {takeoff && <Kp lab="Steel">{`${F(takeoff.perArea, 1)} kg/m²`}</Kp>}
        {row && <Kp lab="Governing" cls="gv">{`${row.label}: ${gov.name}`}</Kp>}
      </>
    );
  }

  const state = d.saving ? 'Saving…' : d.dirty ? 'Unsaved changes' : project.id ? `Saved · revision ${project.revision}` : 'Not saved';

  return (
    <header ref={ref} className="no-print">
      <h1>
        C-Section Beam System Designer <small id="ver">{APP_VERSION}</small>
      </h1>
      <div className="pbar2">
        <Link href="/" className="plink" onClick={(e) => { if (d.dirty && !confirm('You have unsaved changes. Leave without saving?')) e.preventDefault(); }}>← Projects</Link>
        <b className="pname" title={project.name}>{project.name || 'Untitled project'}</b>
        {project.reference && <span className="pref">{project.reference}</span>}
        <span className={`pstate${d.dirty ? ' dirty' : ''}`} role="status">{state}</span>
        {!canEdit && <span className="pstate">View only</span>}
        <span className="puser">{d.user.name}</span>
      </div>
      <div className="hbar">
        <div className="tools">
          <button id="bSave" type="button" className="prim" disabled={!canEdit || d.saving} onClick={() => d.save()} title="Save the project data to the database (Ctrl+S)">Save Project</button>
          <button id="bSaveAs" type="button" disabled={d.saving} onClick={() => d.saveAsNew()} title="Create a new project record from the current inputs">Save As New Project</button>
          <button id="bDetails" type="button" onClick={() => d.setDetailsOpen(true)}>Project details</button>
          <button id="bPdf" type="button" className="prim" onClick={() => d.generatePdf()} title="Generate the engineering report as a PDF">Generate PDF Report</button>
          <button id="bExport" type="button" title="Export the project's inputs and results as JSON (no application code)" onClick={() => d.exportData()}>Export project data</button>
          <button id="bImport" type="button" disabled={!canEdit} title="Load project inputs from an exported data file" onClick={() => fileIn.current?.click()}>Import project data</button>
          <input
            id="fileIn" ref={fileIn} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) d.importData(f); e.target.value = ''; }}
          />
          <button id="bReset" type="button" disabled={!canEdit} onClick={d.resetInputs}>Reset inputs</button>
          <button id="bDiag" type="button" title="Versions, server self-test" onClick={() => d.setDiagOpen(true)}>Diagnostics</button>
          {project.access === 'owner' && project.id && <button id="bDel" type="button" onClick={() => d.deleteProject()}>Delete project</button>}
          <button id="bOut" type="button" onClick={() => d.logout()}>Sign out</button>
          <div className="themesel" role="radiogroup" aria-label="Screen theme">
            <button type="button" role="radio" aria-checked={d.theme === 'light'} title="Light Mode" onClick={() => d.setTheme('light', true)}>☀ Light</button>
            <button type="button" role="radio" aria-checked={d.theme === 'dark'} title="Dark Mode" onClick={() => d.setTheme('dark', true)}>☾ Dark</button>
          </div>
        </div>
        <div id="kpi">{kpi}</div>
      </div>
      {d.calcError && <p className="banner bad" role="alert">The calculation service is not responding ({d.calcError}). The results shown may not match the inputs. Your inputs are kept; they are only saved when you press Save Project.</p>}
      {d.saveError && (
        <div className="banner bad" role="alert">
          <b>Not saved:</b> {d.saveError.message}
          {d.saveError.errors && d.saveError.errors.length > 0 && (
            <ul>{d.saveError.errors.slice(0, 10).map((e) => <li key={e.id}>{e.label}: {e.message}</li>)}</ul>
          )}
          <button type="button" className="btn sm" onClick={d.dismissSaveError}>Dismiss</button>
        </div>
      )}
    </header>
  );
}
