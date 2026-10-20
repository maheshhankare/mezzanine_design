'use client';

import { useState } from 'react';
import { SCHEMA } from '@/engine/schema';
import { useDesign } from '@/state/DesignProvider';
import { dispOf, unitOf, validateField, visible } from '@/lib/inputs';
import { tabLabel } from '@/lib/project';

function Field({ f }: { f: any }) {
  const { I, setField, connSel } = useDesign();
  const [help, setHelp] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // text being typed (avoids unit round-trip fighting the caret)
  if (!visible(I, connSel, f.id)) return null;
  const shown = draft ?? dispOf(f, I[f.id]);
  const msg = validateField(I, f.id);
  const unit = f.unit ? <span className="unit">{unitOf(f)}</span> : null;
  const onChange = (v: string) => {
    setDraft(v);
    setField(f.id, v);
  };
  let ctl;
  if (f.type === 's' || f.type === 'b') {
    const opts: [string, string][] = f.type === 'b' ? [['yes', 'Yes'], ['no', 'No']] : f.opts;
    ctl = (
      <select id={`f_${f.id}`} data-id={f.id} className={msg ? 'bad' : undefined} value={String(I[f.id])} onChange={(e) => setField(f.id, e.target.value)}>
        {opts.map((o) => <option key={String(o[0])} value={String(o[0])}>{o[1]}</option>)}
      </select>
    );
  } else
    ctl = (
      <input
        id={`f_${f.id}`}
        data-id={f.id}
        type="text"
        inputMode={f.type === 'n' ? 'decimal' : undefined}
        className={msg ? 'bad' : undefined}
        value={shown === undefined ? '' : String(shown)}
        placeholder={f.opt ? 'blank = not given' : undefined}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setDraft(null)}
      />
    );
  return (
    <div className="fld" data-row={f.id}>
      <label htmlFor={`f_${f.id}`}>
        {f.label}
        {f.help && <button type="button" className="hbtn" aria-label="Help" onClick={() => setHelp((h) => !h)}>?</button>}
      </label>
      <div className="ctl">{ctl}{unit}</div>
      <div className="fmsg" id={`m_${f.id}`}>{msg}</div>
      {f.help && <div className="fhelp" id={`h_${f.id}`} hidden={!help}>{f.help}</div>}
    </div>
  );
}

export function InputsPane({ tab }: { tab: string }) {
  const { I, connSel, setConnSel } = useDesign();
  const fs: any[] = SCHEMA.T.filter((f: any) => !f.tabDef && f.tab === tab);
  const groups: { name: string; list: any[] }[] = [];
  for (const f of fs) {
    let g = groups.find((x) => x.name === f.grp);
    if (!g) groups.push((g = { name: f.grp, list: [] }));
    g.list.push(f);
  }
  return (
    <div className="inputs" id="inputs">
      <h2>{tabLabel(tab)} – inputs</h2>
      {tab === 'conn' && (
        <div className="seg" role="tablist">
          {[['ci', 'SB-Int → main beam'], ['ce', 'SB-End → column'], ['cm', 'Main beam → column']].map(([k, l]) => (
            <button key={k} type="button" className={k === connSel ? 'on' : ''} onClick={() => setConnSel(k)}>{l}</button>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <fieldset key={g.name} data-grp={g.name} hidden={g.list.every((f) => !visible(I, connSel, f.id))}>
          <legend>{g.name || 'Inputs'}</legend>
          {g.list.map((f) => <Field key={f.id} f={f} />)}
        </fieldset>
      ))}
    </div>
  );
}
