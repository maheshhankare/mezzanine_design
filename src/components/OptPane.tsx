'use client';

import { useEffect, useRef } from 'react';
import { OPTUI } from '@/engine/optui';
import { useDesign } from '@/state/DesignProvider';

/**
 * Hosts the optimisation panel. The panel is the mockup's imperative module (it writes progress straight into the DOM
 * while a search runs), so React only provides the container and forwards its click / change events.
 */
export function OptPane() {
  const { res, tick, unitsVer, goto } = useDesign();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (box.current) box.current.innerHTML = OPTUI.panel();
  }, [res, tick, unitsVer]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('button, a') as HTMLElement | null;
      if (!t) return;
      if (t.dataset.goto) {
        e.preventDefault();
        goto(t.dataset.goto, { conn: t.dataset.conn || undefined, fid: t.dataset.fid || undefined });
        return;
      }
      if (t.dataset.help) {
        const h = document.getElementById('h_' + t.dataset.help);
        if (h) h.hidden = !h.hidden;
        return;
      }
      OPTUI.onClick(t);
    };
    const onChange = (e: Event) => OPTUI.onChange(e);
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('change', onChange);
    };
  }, [goto]);

  return <div className="optw" ref={box} />;
}
