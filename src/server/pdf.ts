import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SCHEMA } from '@/shared/schema';
import { visible } from '@/lib/inputs';
import { U } from '@/shared/util';
import { APP_VERSION } from '@/shared/version';

/**
 * Engineering report as a PDF, generated on the server from the validated inputs and the recalculated results.
 * It contains: project data, inputs, design basis, member properties, every design check with demand / resistance /
 * utilisation / status, warnings and the assumptions. It never contains equations, intermediate steps, source code, credentials or UI.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = { l: 46, r: 46, t: 70, b: 56 };
const COL = { ink: rgb(0.11, 0.14, 0.19), mute: rgb(0.36, 0.4, 0.46), line: rgb(0.82, 0.85, 0.9), head: rgb(0.12, 0.22, 0.39), band: rgb(0.94, 0.96, 0.98),
  pass: rgb(0.12, 0.49, 0.27), fail: rgb(0.7, 0.15, 0.12), review: rgb(0.54, 0.35, 0), na: rgb(0.42, 0.45, 0.5) };

const F = (x: number, d = 2): string => (Number.isFinite(x) ? U.fmt(x, d) : x === Infinity ? '∞' : '–');
const clean = (s: unknown): string => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
// The engine's clause strings sometimes carry the governing expression after the reference. The report shows the code reference only.
const REF = /\b(?:IS \d{3}(?::\d{4})?)(?:\s+(?:Table|Tables|eq\.|Clause|cl\.))?(?:\s*[A-Z]?\d+(?:\.\d+)*(?:\(\d+\))?)?/g;
export const clauseRef = (c: unknown): string => {
  const s = clean(c);
  const m = (s.match(REF) || []).map((x) => x.trim());
  if (m.length) return [...new Set(m)].slice(0, 2).join('; ');
  const first = s.split(/[;(]/)[0].trim();
  if (/[=+×÷/≤≥√^]/.test(first)) return '–'; // an expression, not a reference
  return first.length > 48 ? first.slice(0, 45).trimEnd() + '…' : first;
};
// a check name may end with its expression in brackets, e.g. "Corner welds (V S/I + T/(2A_m))": drop the bracket when it holds an expression
export const plainName = (n: unknown): string => {
  let s = clean(n).replace(/\s*:\s*$/, '');
  if (s.endsWith(')')) {
    let depth = 0, i = s.length - 1;
    for (; i >= 0; i--) {
      if (s[i] === ')') depth++;
      else if (s[i] === '(') { depth--; if (depth === 0) break; }
    }
    if (i > 0 && /[=+×÷/≤≥√^]/.test(s.slice(i + 1, -1))) s = s.slice(0, i).trimEnd();
  }
  return s;
};
const stColor = (s: string) => (s === 'PASS' ? COL.pass : s === 'FAIL' ? COL.fail : s === 'REVIEW' ? COL.review : COL.na);

export interface ReportInput {
  project: { name: string; reference: string; customer: string; customer_contact: string; site: string; notes: string; revision: number; owner: string };
  inputs: Record<string, any>;
  res: any; // a successful MODEL.compute result
  generatedAt: Date;
}

class Doc {
  pdf!: PDFDocument;
  reg!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  constructor(private meta: ReportInput) {}

  async init() {
    this.pdf = await PDFDocument.create();
    this.pdf.registerFontkit(fontkit);
    const dir = path.join(process.cwd(), 'src', 'server', 'fonts');
    this.reg = await this.pdf.embedFont(readFileSync(path.join(dir, 'DejaVuSans.ttf')), { subset: true });
    this.bold = await this.pdf.embedFont(readFileSync(path.join(dir, 'DejaVuSans-Bold.ttf')), { subset: true });
    this.pdf.setTitle(`Design report: ${clean(this.meta.project.name)}`);
    this.pdf.setAuthor('Mezzanine Design Tool');
    this.pdf.setSubject(`Revision ${this.meta.project.revision}`);
    this.pdf.setProducer('Mezzanine Design Tool');
    this.pdf.setCreationDate(this.meta.generatedAt);
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = A4.h - M.t;
  }
  get width() { return A4.w - M.l - M.r; }
  space(h: number) { if (this.y - h < M.b) this.newPage(); }

  wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        // break very long tokens
        const parts: string[] = [];
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
          let n = w.length - 1;
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > maxW) n--;
          parts.push(w.slice(0, n));
          w = w.slice(n);
        }
        parts.push(w);
        for (const p of parts) {
          const t = line ? line + ' ' + p : p;
          if (font.widthOfTextAtSize(t, size) <= maxW || !line) line = t;
          else { out.push(line); line = p; }
        }
      }
      out.push(line);
    }
    return out;
  }

  text(t: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: any; align?: 'l' | 'r' | 'c'; w?: number } = {}) {
    const size = o.size ?? 9, font = o.bold ? this.bold : this.reg, s = clean(t);
    let px = x;
    if (o.align === 'r' && o.w !== undefined) px = x + o.w - font.widthOfTextAtSize(s, size);
    if (o.align === 'c' && o.w !== undefined) px = x + (o.w - font.widthOfTextAtSize(s, size)) / 2;
    this.page.drawText(s, { x: px, y, size, font, color: o.color ?? COL.ink });
  }

  h1(t: string) {
    this.space(40);
    this.y -= 6;
    this.page.drawRectangle({ x: M.l, y: this.y - 6, width: this.width, height: 20, color: COL.head });
    this.text(t, M.l + 8, this.y - 0.5, { size: 11, bold: true, color: rgb(1, 1, 1) });
    this.y -= 28;
  }
  h2(t: string) {
    this.space(32);
    this.y -= 4;
    this.text(t, M.l, this.y, { size: 10, bold: true, color: COL.head });
    this.page.drawLine({ start: { x: M.l, y: this.y - 3 }, end: { x: M.l + this.width, y: this.y - 3 }, thickness: 0.6, color: COL.line });
    this.y -= 16;
  }
  para(t: string, o: { size?: number; color?: any; indent?: number } = {}) {
    const size = o.size ?? 9, lh = size * 1.35, maxW = this.width - (o.indent ?? 0);
    for (const l of this.wrap(t, this.reg, size, maxW)) {
      this.space(lh);
      this.text(l, M.l + (o.indent ?? 0), this.y, { size, color: o.color });
      this.y -= lh;
    }
    this.y -= 3;
  }

  /** Table with wrapped cells. cols: widths as fractions of the page width. */
  table(cols: { w: number; align?: 'l' | 'r' | 'c'; head: string }[], rows: (string | { t: string; color?: any; bold?: boolean })[][], size = 8) {
    const total = cols.reduce((a, c) => a + c.w, 0);
    const widths = cols.map((c) => (c.w / total) * this.width), pad = 3, lh = size * 1.3;
    const cell = (c: string | { t: string; color?: any; bold?: boolean }) => (typeof c === 'string' ? { t: c } : c);
    const draw = (cells: ReturnType<typeof cell>[], head: boolean, shade: boolean) => {
      const lines = cells.map((c, i) => this.wrap(c.t, (head || c.bold) ? this.bold : this.reg, size, widths[i] - 2 * pad));
      const h = Math.max(...lines.map((l) => l.length)) * lh + 2 * pad;
      if (this.y - h - 1 < M.b) { this.newPage(); if (!head) draw(cols.map((c) => ({ t: c.head })), true, false); }
      if (head) this.page.drawRectangle({ x: M.l, y: this.y - h + pad, width: this.width, height: h, color: COL.band });
      else if (shade) this.page.drawRectangle({ x: M.l, y: this.y - h + pad, width: this.width, height: h, color: rgb(0.98, 0.985, 0.99) });
      let x = M.l;
      cells.forEach((c, i) => {
        lines[i].forEach((l, k) => this.text(l, x + pad, this.y - pad - size - k * lh + size * 0.85 - size * 0.2, { size, bold: head || c.bold, color: head ? COL.head : c.color, align: cols[i].align, w: widths[i] - 2 * pad }));
        x += widths[i];
      });
      this.page.drawLine({ start: { x: M.l, y: this.y - h + pad }, end: { x: M.l + this.width, y: this.y - h + pad }, thickness: 0.4, color: COL.line });
      this.y -= h;
    };
    // keep the header together with the first row
    const firstH = rows.length ? Math.max(...rows[0].map(cell).map((c, i) => this.wrap(c.t, this.reg, size, widths[i] - 2 * pad).length)) * lh + 2 * pad : 0;
    const headH = Math.max(...cols.map((c, i) => this.wrap(c.head, this.bold, size, widths[i] - 2 * pad).length)) * lh + 2 * pad;
    this.space(headH + firstH + 2);
    draw(cols.map((c) => ({ t: c.head })), true, false);
    rows.forEach((r, i) => draw(r.map(cell), false, i % 2 === 1));
    this.y -= 8;
  }

  kv(rows: [string, string][], labelW = 0.32) {
    this.table([{ w: labelW, head: 'Item' }, { w: 1 - labelW, head: 'Value' }], rows.map(([a, b]) => [{ t: a, bold: true }, b]));
  }

  finish() {
    const n = this.pdf.getPageCount(), p = this.meta.project;
    for (let i = 0; i < n; i++) {
      const pg = this.pdf.getPage(i);
      this.page = pg;
      pg.drawLine({ start: { x: M.l, y: A4.h - 46 }, end: { x: A4.w - M.r, y: A4.h - 46 }, thickness: 0.8, color: COL.head });
      this.text('MEZZANINE STRUCTURAL DESIGN REPORT', M.l, A4.h - 38, { size: 9, bold: true, color: COL.head });
      this.text(`${clean(p.name)}${p.reference ? ' · ' + clean(p.reference) : ''}`, M.l, A4.h - 38, { size: 8, color: COL.mute, align: 'r', w: this.width });
      pg.drawLine({ start: { x: M.l, y: 42 }, end: { x: A4.w - M.r, y: 42 }, thickness: 0.4, color: COL.line });
      this.text(`Revision ${p.revision} · ${this.meta.generatedAt.toISOString().slice(0, 10)} · ${APP_VERSION}`, M.l, 30, { size: 7.5, color: COL.mute });
      this.text(`Page ${i + 1} of ${n}`, M.l, 30, { size: 7.5, color: COL.mute, align: 'r', w: this.width });
    }
  }
}

// ---------------- content ----------------
const optLabel = (f: any, v: any): string => {
  if (f.type === 'b') return String(v) === 'yes' ? 'Yes' : 'No';
  if (f.type === 's') { const o = (f.opts || []).find((x: any) => String(x[0]) === String(v)); return o ? o[1] : String(v); }
  const s = String(v ?? '').trim();
  return s === '' ? '–' : f.unit ? `${s} ${f.unit}` : s;
};

function planDiagram(d: Doc, I: Record<string, any>) {
  const nb = Math.max(1, Math.round(+I.nb)), nm = Math.max(1, Math.round(+I.nm)), Lmb = +I.Lmb, Lsb = +I.Lsb;
  if (!(nb > 0 && nm > 0 && Lmb > 0 && Lsb > 0)) return;
  const totW = nb * Lmb, totH = nm * Lsb, boxW = d.width - 90, boxH = 150;
  const sc = Math.min(boxW / totW, boxH / totH), w = totW * sc, h = totH * sc;
  d.space(h + 46);
  const x0 = M.l + 45 + (boxW - w) / 2, yTop = d.y - 12, y0 = yTop - h;
  const pg = d.page;
  pg.drawRectangle({ x: x0, y: y0, width: w, height: h, borderColor: COL.mute, borderWidth: 0.8, color: rgb(0.97, 0.98, 1) });
  for (let i = 1; i < nb; i++) pg.drawLine({ start: { x: x0 + i * Lmb * sc, y: y0 }, end: { x: x0 + i * Lmb * sc, y: y0 + h }, thickness: 0.5, color: COL.mute, dashArray: [3, 2] });
  for (let j = 1; j < nm; j++) pg.drawLine({ start: { x: x0, y: y0 + j * Lsb * sc }, end: { x: x0 + w, y: y0 + j * Lsb * sc }, thickness: 1.4, color: COL.head });
  for (let i = 0; i <= nb; i++) for (let j = 0; j <= nm; j++) pg.drawRectangle({ x: x0 + i * Lmb * sc - 2.5, y: y0 + j * Lsb * sc - 2.5, width: 5, height: 5, color: COL.ink });
  d.text(`${nb} bays × ${F(Lmb, 0)} mm  =  ${F(totW, 0)} mm`, x0, y0 - 11, { size: 7.5, color: COL.mute, align: 'c', w });
  d.text(`${nm} × ${F(Lsb, 0)} mm = ${F(totH, 0)} mm`, M.l, yTop - h / 2, { size: 7.5, color: COL.mute });
  d.text('Plan (schematic): main beams along the bays, secondaries across; ■ columns', M.l, y0 - 22, { size: 7.5, color: COL.mute });
  d.y = y0 - 34;
}

export async function buildReport(inp: ReportInput): Promise<Uint8Array> {
  const { project: p, inputs: I, res } = inp;
  const d = new Doc(inp);
  await d.init();
  const S = res.summary;

  // ----- title block -----
  d.page.drawRectangle({ x: M.l, y: d.y - 78, width: d.width, height: 90, color: COL.band });
  d.text(clean(p.name), M.l + 12, d.y - 14, { size: 17, bold: true, color: COL.head });
  d.text(`Cold-formed C-section mezzanine · IS 875 / IS 800:2007`, M.l + 12, d.y - 32, { size: 9.5, color: COL.mute });
  d.text(`Reference: ${clean(p.reference) || '–'}`, M.l + 12, d.y - 50, { size: 9 });
  d.text(`Revision ${p.revision} · ${inp.generatedAt.toISOString().slice(0, 10)}`, M.l + 12, d.y - 64, { size: 9 });
  d.text(S.overall.status === 'PASS' ? 'ALL CHECKS PASS' : S.overall.status === 'REVIEW' ? 'REVIEW REQUIRED' : 'DESIGN FAILS', M.l, d.y - 34, { size: 14, bold: true, color: stColor(S.overall.status), align: 'r', w: d.width - 12 });
  d.y -= 100;

  // ----- 1 project -----
  d.h1('1  Project identification');
  d.kv([
    ['Project', clean(p.name)], ['Reference', clean(p.reference) || '–'], ['Customer', clean(p.customer) || '–'], ['Customer contact', clean(p.customer_contact) || '–'],
    ['Site / location', clean(p.site) || '–'], ['Designer', clean(I.eng) || '–'], ['Project owner', clean(p.owner)], ['Report date', inp.generatedAt.toISOString().slice(0, 10)], ['Revision', String(p.revision)],
  ]);
  if (clean(p.notes)) { d.h2('Notes'); d.para(p.notes); }

  // ----- 2 summary -----
  d.h1('2  Design summary');
  const gov = S.overall.gov;
  d.kv([
    ['Overall status', S.overall.status], ['Maximum utilisation', gov ? `${F(gov.eta, 2)}  (${plainName(gov.name)})` : '–'],
    ['Checks', `${S.nPass} pass · ${S.nFail} fail · ${S.nReview} review · ${S.nNA} not applicable`],
  ]);
  d.table(
    [{ w: 3.2, head: 'Module' }, { w: 1, head: 'Status', align: 'c' }, { w: 0.9, head: 'Max η', align: 'r' }, { w: 4.2, head: 'Governing check' }],
    S.rows.map((r: any) => [r.label, { t: r.status, color: stColor(r.status), bold: true }, r.gov ? F(r.gov.eta, 2) : '–', r.gov ? plainName(r.gov.name) : '–']),
  );
  const fails = S.rows.flatMap((r: any) => r.list.filter((c: any) => c.status === 'FAIL').map((c: any) => ({ mod: r.label, c })));
  if (fails.length) {
    d.h2('Failing checks');
    d.table(
      [{ w: 2.4, head: 'Module' }, { w: 4.8, head: 'Check' }, { w: 0.9, head: 'η', align: 'r' }],
      fails.map(({ mod, c }: any) => [mod, plainName(c.name), c.eta === Infinity ? '∞' : F(c.eta, 2)]),
    );
  }

  // ----- 3 geometry & inputs -----
  d.h1('3  Mezzanine geometry and design inputs');
  planDiagram(d, I);
  const tabs = (SCHEMA.tabs as any[]).filter((t) => t.tabDef);
  for (const t of tabs) {
    const fs = (SCHEMA.T as any[]).filter((f) => !f.tabDef && f.tab === t.id && ['ci', 'ce', 'cm'].some((c) => visible(I, c, f.id)));
    if (!fs.length) continue;
    d.h2(t.label);
    const groups: { n: string; l: any[] }[] = [];
    for (const f of fs) { let g = groups.find((x) => x.n === f.grp); if (!g) groups.push((g = { n: f.grp, l: [] })); g.l.push(f); }
    for (const g of groups) {
      d.table([{ w: 4.6, head: g.n || 'Inputs' }, { w: 3.4, head: 'Value', align: 'r' }], g.l.map((f) => [clean(f.label), optLabel(f, I[f.id])]), 7.6);
    }
  }

  // ----- 4 design basis and loads -----
  d.h1('4  Design basis and loads');
  const R = res.R, A = res.area, L = res.load || {};
  d.kv([
    ['Design route', clean(R.name)], ['ULS combination', clean(R.ulsText)], ['SLS combination', clean(R.slsText)],
    ['Elastic / shear modulus', `${F(R.E, 0)} / ${F(R.E / (2 * (1 + +I.nu)), 0)} N/mm²`],
        ['Partial factors', 'γm0 1.10, γm1 1.25, γmb 1.25, γmw 1.25 (IS 800 Table 5)'],
  ]);
  d.h2('Load path (characteristic and design values)');
  d.kv([
    ['Permanent area load (surface + permanent)', `${F(+I.d_sw + +I.qG, 0)} kg/m²  →  ${F(A.Gk, 3)} kN/m²`], ['Imposed area load', `${F(+I.qQ, 0)} kg/m²  →  ${F(A.Qk, 3)} kN/m²`],
    ['ULS area load', `${F(A.qEd, 3)} kN/m²`], ['SB-Int tributary width', `${F(L.tribI, 0)} mm`], ['SB-End tributary width', `${F(L.tribE, 0)} mm`],
    ['SB-Int reaction, characteristic G / Q', `${F(L.RsbiG.G / 1e3, 2)} / ${F(L.RsbiG.Q / 1e3, 2)} kN`], ['SB-End reaction, characteristic G / Q', `${F(L.RsbeGQ.G / 1e3, 2)} / ${F(L.RsbeGQ.Q / 1e3, 2)} kN`],
    ['Main-beam reaction, characteristic G / Q', `${F(L.RmbGQ.G / 1e3, 2)} / ${F(L.RmbGQ.Q / 1e3, 2)} kN`], ['Column axial force N_Ed (ULS)', `${F(L.Ncol / 1e3, 2)} kN`],
  ], 0.46);

  // ----- 5 members -----
  d.h1('5  Selected members and section properties');
  const secRows: any[] = [];
  for (const [k, label] of [['mb', 'Main beam'], ['sbi', 'SB-Int'], ['sbe', 'SB-End']] as const) {
    const m = k === 'mb' ? res.mods.mb.gov : res.mods[k];
    if (!m || m.error) continue;
    const g = m.gross;
    secRows.push([{ t: label, bold: true }, clean(m.spec.title), F(g.A, 0), F(g.mass, 2), F(g.Iyy / 1e4, 1), F(g.Izz / 1e4, 1), 'pending', 'pending']);
  }
  if (secRows.length)
    d.table([{ w: 1.2, head: 'Member' }, { w: 3.2, head: 'Section' }, { w: 1, head: 'A [mm²]', align: 'r' }, { w: 1, head: 'kg/m', align: 'r' }, { w: 1.1, head: 'I_y [cm⁴]', align: 'r' }, { w: 1.1, head: 'I_z [cm⁴]', align: 'r' }, { w: 1.2, head: 'M_Rd [kNm]', align: 'r' }, { w: 1.1, head: 'V_Rd [kN]', align: 'r' }], secRows, 7.6);
  const col = res.mods.col;
  if (col && col.props) d.para(`Box column: A = ${F(col.props.A, 0)} mm², I_y = ${F(col.props.Iy / 1e4, 1)} cm⁴, I_z = ${F(col.props.Iz / 1e4, 1)} cm⁴. Design forces (ULS): N = ${F(col.loads.N / 1e3, 2)} kN, M_y = ${F(col.loads.My / 1e6, 3)} kNm, M_z = ${F(col.loads.Mz / 1e6, 3)} kNm, V = ${F(col.loads.V / 1e3, 2)} kN.`);

  // ----- 6 checks -----
  d.h1('6  Design checks');
  d.para('Demand and resistance are in the unit shown. η is the utilisation (demand / resistance); a check passes when η ≤ 1.00. REVIEW means a resistance could not be established from the inputs or lies outside the implemented scope.', { color: COL.mute, size: 8 });
  for (const row of S.rows) {
    const list = row.list.filter((c: any) => c.status !== 'N/A');
    if (!list.length) continue;
    d.h2(`${row.label}   ${row.status}`);
    d.table(
      [{ w: 4.1, head: 'Check' }, { w: 2.5, head: 'Clause' }, { w: 1.2, head: 'Demand', align: 'r' }, { w: 1.2, head: 'Resistance', align: 'r' }, { w: 0.8, head: 'Unit' }, { w: 0.8, head: 'η', align: 'r' }, { w: 0.9, head: 'Status', align: 'c' }],
      list.map((c: any) => [
        plainName(c.name), clauseRef(c.clause), c.Ed !== undefined && Number.isFinite(c.EdF ?? c.Ed) ? F(c.EdF ?? c.Ed, 2) : '–', c.Rd !== undefined && Number.isFinite(c.RdF ?? c.Rd) ? F(c.RdF ?? c.Rd, 2) : '–',
        clean(c.unit), c.eta === null || c.eta === undefined ? '–' : c.eta === Infinity ? '∞' : F(c.eta, 2), { t: c.status, color: stColor(c.status), bold: true },
      ]),
      7.2,
    );
  }

  // ----- 7 warnings -----
  d.h1('7  Engineering warnings and remedies');
  const issues = S.rows.flatMap((r: any) => r.list.filter((c: any) => c.status === 'FAIL' || c.status === 'REVIEW').map((c: any) => ({ mod: r.label, c })));
  const msgs: any[] = res.msgs || [];
  if (!issues.length && !msgs.length) d.para('No warnings.');
  for (const m of msgs) d.para(`• [${clean(m.level).toUpperCase()}] ${clean(m.text)}`, { indent: 6 });
  for (const { mod, c } of issues) {
    d.para(`• ${mod}: ${plainName(c.name)} (${c.status}, η ${c.eta === Infinity ? '∞' : c.eta == null ? '–' : F(c.eta, 2)})`, { indent: 6 });
    if (c.why) d.para(`Mechanism: ${clean(c.why)}`, { indent: 18, color: COL.mute, size: 8 });
    if (c.fix && c.status === 'FAIL') d.para(`Remedies: ${clean(c.fix)}`, { indent: 18, color: COL.mute, size: 8 });
    if (c.note) d.para(clean(c.note), { indent: 18, color: COL.mute, size: 8 });
  }

  // ----- 8 assumptions -----
  d.h1('8  Standards, assumptions and limitations');
  for (const t of [
    `Design route: ${clean(R.name)}. Loads, combinations and partial factors are as stated in section 4.`,
    'Members are analysed as lipped C-sections (single, back-to-back or four-section arrangements) with the restraints, joint stiffnesses and boundary conditions stated in the inputs. Restraints are credited only where their stiffness and strength are demonstrated.',
    'Connections, the box column, base plate, anchors and slab are checked for the forces derived from the load path above.',
    'The results depend entirely on the inputs listed in section 3; the designer is responsible for confirming that the inputs describe the actual structure, loading and supporting conditions.',
    'Resistances flagged REVIEW are not established by this calculation and need separate engineering justification (testing, manufacturer data or another method).',
    'This report does not replace the checking, approval and sign-off required by the applicable codes and the project procedures.',
  ]) d.para('• ' + t, { indent: 6 });
  d.para(`Calculation engine ${APP_VERSION}.`, { color: COL.mute, size: 8 });

  d.finish();
  return d.pdf.save();
}
