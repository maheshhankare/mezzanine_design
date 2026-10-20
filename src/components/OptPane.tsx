'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDesign } from '@/state/DesignProvider';
import { api, unitsNow } from '@/lib/api';
import { store } from '@/lib/store';

/**
 * Optimisation tab. The panel itself (tables, results, comparison) is rendered on the server from the calculated model;
 * the browser keeps the tab's settings and history, sends them with each request, shows the HTML it gets back and streams the search.
 */
const LS_S = 'csbd.opt.v2', LS_H = 'csbd.opthist.v2';
let memR: string | null = null; // the light form of the last result: kept while the user moves between tabs

type Panel = { html: string; S: any; hist: any[]; Rtxt: string | null; effects: any[]; ask: any };

export function OptPane() {
  const d = useDesign();
  const { res, unitsVer } = d;
  const box = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const S = useRef<any>(store.get(LS_S) || {});
  const hist = useRef<any[]>(store.get(LS_H) || []);
  const run = useRef<{ ac: AbortController; pct: number; msg: string } | null>(null);
  const seq = useRef(0);
  const dRef = useRef(d);
  dRef.current = d;

  const head = () => {
    const q = (id: string) => box.current?.querySelector<HTMLInputElement | HTMLSelectElement>(id) ?? null;
    const h: Record<string, any> = {};
    for (const id of ['#o_budget', '#o_alt', '#o_max', '#o_obj']) { const el = q(id); if (el) h[id] = { value: el.value }; }
    for (const id of ['#o_conn', '#o_lev']) { const el = q(id) as HTMLInputElement | null; if (el) h[id] = { checked: el.checked }; }
    return h;
  };

  const base = () => ({ inputs: dRef.current.getI(), units: unitsNow(), S: S.current, hist: hist.current, Rtxt: memR });

  const adopt = (out: Panel) => {
    S.current = out.S; hist.current = out.hist; memR = out.Rtxt;
    store.set(LS_S, out.S); store.set(LS_H, out.hist);
  };

  const render = useCallback(async () => {
    const my = ++seq.current;
    try {
      const body: any = base();
      if (run.current) Object.assign(body, { running: true, msg: run.current.msg, pct: run.current.pct });
      const out = await api<Panel>('/api/opt/render', 'POST', body);
      if (my !== seq.current) return;
      adopt(out);
      setHtml(out.html);
      setErr(null);
    } catch (e: any) {
      if (my === seq.current) setErr(e.message || 'The optimisation panel could not be loaded');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (res) render();
  }, [res, unitsVer, render]);

  // leaving the tab ends a running search
  useEffect(() => () => { if (run.current) { run.current.ac.abort(); run.current = null; } }, []);

  const scrollTo = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);

  const sendEvent = async (ev: any) => {
    let answers: unknown[] = [];
    for (let guard = 0; guard < 6; guard++) {
      let out: Panel;
      try {
        out = await api<Panel>('/api/opt/event', 'POST', { ...base(), head: head(), ev, answers });
      } catch (e: any) { dRef.current.toast(e.message || 'The action failed'); return; }
      if (out.ask) {
        // the server needs a dialog answered (confirm / prompt): ask, then repeat the event with the answer
        const a = out.ask;
        answers = [...answers, a.type === 'confirm' ? window.confirm(a.text) : window.prompt(a.text, a.def ?? '')];
        continue;
      }
      adopt(out);
      setHtml(out.html);
      dRef.current.applyEffects(out.effects);
      if (ev.id === 'o_cmp') scrollTo('o_cmpz');
      if (ev.dataset?.oedit) scrollTo('o_dim');
      return;
    }
  };

  const start = async () => {
    if (run.current) return;
    const ac = new AbortController();
    run.current = { ac, pct: 0, msg: 'Validating the ranges and analysing the baseline…' };
    memR = null;
    await render();
    try {
      const r = await fetch('/api/opt/run', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base(), head: head() }), signal: ac.signal });
      if (r.status === 401) { location.href = '/login'; return; }
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '', done: any = null;
      for (;;) {
        const { value, done: fin } = await reader.read();
        if (fin) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line);
          if (m.t === 'p' && run.current) {
            run.current.pct = m.pct; run.current.msg = m.msg;
            const pb = document.getElementById('o_pb'), tx = document.getElementById('o_msg');
            if (pb) pb.style.width = m.pct.toFixed(0) + '%';
            if (tx) tx.textContent = m.msg;
          } else if (m.t === 'done') done = m;
          else if (m.t === 'error') throw new Error(m.error);
        }
      }
      run.current = null;
      if (done) { S.current = done.S; hist.current = done.hist; memR = done.Rtxt; store.set(LS_S, done.S); store.set(LS_H, done.hist); }
      await render();
      scrollTo('o_res');
    } catch (e: any) {
      run.current = null;
      if (e?.name === 'AbortError') dRef.current.toast('Optimisation cancelled: no result was kept.');
      else dRef.current.toast(e.message || 'Optimisation failed');
      await render();
    }
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const dataset = (t: HTMLElement) => ({ ...t.dataset });
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('button, a') as HTMLElement | null;
      if (!t) return;
      if (t.id === 'o_go') { start(); return; }
      if (t.id === 'o_cancel') { run.current?.ac.abort(); return; }
      if (t.dataset.goto) { e.preventDefault(); dRef.current.goto(t.dataset.goto, { conn: t.dataset.conn || undefined, fid: t.dataset.fid || undefined }); return; }
      sendEvent({ type: 'click', id: t.id, className: t.className, value: (t as HTMLButtonElement).value, dataset: dataset(t) });
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t || !t.tagName) return;
      sendEvent({ type: 'change', id: t.id, className: t.className, name: t.name, value: t.value, checked: t.checked, dataset: dataset(t) });
    };
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <div className="optw"><section className="card bad"><h3>Optimisation unavailable</h3><p>{err}</p></section></div>;
  return <div className="optw" ref={box} dangerouslySetInnerHTML={{ __html: html || '<section class="card"><p>Loading the optimisation panel…</p></section>' }} />;
}
