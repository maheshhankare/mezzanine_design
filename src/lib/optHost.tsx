import { renderToStaticMarkup } from 'react-dom/server';
import { OPTUI } from '@/engine/optui';
import { Checks, KvTable, Pill } from '@/components/common';
import { diffOf, takeoff } from '@/lib/project';

/**
 * The optimisation panel is the mockup's imperative module (string templates plus a background search that updates the
 * DOM directly). It is hosted inside React by <OptPane/>; this bridge gives it the app state and the display helpers.
 * The helpers render the same React components to static markup, so there is a single implementation of each.
 */
let bound = false;
export const optHost = {
  bind(h: {
    getI: () => any; getRes: () => any; toast: (m: string) => void; render: () => void;
    assign: (ov: any) => void; setInputs: (o: any) => void; saveCase: (n: string, i: any) => void;
  }) {
    if (bound) return;
    bound = true;
    OPTUI.init({
      I: h.getI,
      res: h.getRes,
      diffOf,
      takeoff: (r: any, J: any) => takeoff(r, J),
      pill: (s: string) => renderToStaticMarkup(<Pill st={s} />),
      kvTable: (rows: any[], cap?: string) => renderToStaticMarkup(<KvTable rows={rows} caption={cap} />),
      checksHTML: (list: any[], title?: string) => renderToStaticMarkup(<Checks list={list} title={title} />),
      toast: h.toast,
      render: h.render,
      assign: h.assign,
      setInputs: h.setInputs,
      saveCase: h.saveCase,
    });
  },
};
