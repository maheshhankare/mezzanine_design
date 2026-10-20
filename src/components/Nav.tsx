'use client';

import { useEffect, useState } from 'react';
import { useDesign } from '@/state/DesignProvider';
import { NAV_GROUPS, TABS, tabLabel, tabPillText, tabStatus } from '@/lib/project';

function TabPill({ t }: { t: string }) {
  const { res } = useDesign();
  const st = tabStatus(res, t);
  if (!st) return null;
  return <span className={`pill p-${st.replace('/', '')}`} title={st}>{tabPillText(res, t, st)}</span>;
}

export function Tabs() {
  const { tab, setTab, res } = useDesign();
  return (
    <nav id="tabs" role="tablist" aria-label="Design modules">
      {TABS.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={k === tab} data-st={tabStatus(res, k) || ''} onClick={() => setTab(k)}>
          <span className="tl">{l}</span>
          <span className="tp"><TabPill t={k} /></span>
        </button>
      ))}
    </nav>
  );
}

type Item = { id: string; label: string; res: boolean };

export function LeftNav() {
  const { tab, setTab, res, I, connSel, unitsVer } = useDesign();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState('');

  // sections of the open tab: input groups and result cards found in the rendered pane
  useEffect(() => {
    const found: Item[] = [];
    document.querySelectorAll<HTMLElement>('#inputs fieldset[data-grp]').forEach((f, i) => {
      if (f.hidden) return;
      f.id = f.id || 'ng_' + i;
      const l = f.querySelector('legend');
      found.push({ id: f.id, label: l ? l.textContent || 'Inputs' : 'Inputs', res: false });
    });
    document.querySelectorAll<HTMLElement>('#pane section.card').forEach((c, i) => {
      const h = c.querySelector('h3');
      if (!h || c.closest('.dwgrid')) return;
      c.id = c.id || 'nc_' + i;
      found.push({ id: c.id, label: (h.textContent || '').replace(/\b(PASS|FAIL|REVIEW|N\/A)\b/g, '').trim(), res: true });
    });
    setItems((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
  }, [tab, res, I, connSel, unitsVer]);

  return (
    <aside id="lnav" aria-label="Sections" className={open ? 'open' : ''}>
      <button type="button" className="lnbtn" onClick={() => setOpen((o) => !o)}>
        Sections ▾ <span>{tabLabel(tab)}</span>
      </button>
      <div className="lnbody">
        {NAV_GROUPS.map(([g, ts]) => (
          <div key={g}>
            <div className="lng">{g}</div>
            {ts.map((t) => (
              <div key={t}>
                <button type="button" className={`lni${t === tab ? ' on' : ''}`} onClick={() => { setOpen(false); setTab(t); }}>
                  <span>{tabLabel(t)}</span>
                  <TabPill t={t} />
                </button>
                {t === tab && (
                  <div className="lnsub" id="lnsub">
                    {items.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        className={`${it.res ? 'res' : ''}${active === it.id ? ' on' : ''}`}
                        title={it.label}
                        onClick={() => {
                          const el = document.getElementById(it.id);
                          if (el) {
                            setOpen(false);
                            el.scrollIntoView({ block: 'start', behavior: 'smooth' });
                            setActive(it.id);
                          }
                        }}
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
