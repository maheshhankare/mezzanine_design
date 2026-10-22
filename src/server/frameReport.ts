import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { CalculationRecord } from './frame/record';

/**
 * PDF of a stored calculation record. The report is generated from the SAVED record only (the settings actually used, the results and design checks
 * of that run): nothing is recomputed and nothing is added. It states IS 800:2007 as the only design standard, keeps analysis results apart from the design
 * checks, and prints the warnings and the verification status of the provisions.
 */
const A4 = { w: 595.28, h: 841.89 }, M = { l: 48, r: 48, t: 64, b: 52 };
const INK = rgb(0.11, 0.14, 0.19), MUTE = rgb(0.36, 0.4, 0.46), HEAD = rgb(0.12, 0.22, 0.39), WARN = rgb(0.54, 0.35, 0), BAD = rgb(0.7, 0.15, 0.12);
const clean = (s: unknown) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

export async function frameReportPdf(rec: CalculationRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), 'src', 'server', 'fonts');
  const reg: PDFFont = await pdf.embedFont(readFileSync(path.join(dir, 'DejaVuSans.ttf')), { subset: true });
  const bold: PDFFont = await pdf.embedFont(readFileSync(path.join(dir, 'DejaVuSans-Bold.ttf')), { subset: true });
  const id = rec.identity;
  pdf.setTitle(`Calculation record: ${clean(id.projectName)}`); pdf.setSubject(`IS 800:2007, model revision ${id.modelRevision}, run ${id.runId}`); pdf.setProducer('Mezzanine Design Tool'); pdf.setCreationDate(new Date(id.createdAt));

  let page: PDFPage, y = 0, n = 0;
  const pages: PDFPage[] = [];
  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); pages.push(page); n++; y = A4.h - M.t; };
  const room = (h: number) => { if (y - h < M.b) newPage(); };
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const out: string[] = []; let line = '';
    for (const word of clean(text).split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(t, size) <= width) line = t;
      else { if (line) out.push(line); let w = word; while (font.widthOfTextAtSize(w, size) > width) { let k = w.length - 1; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--; out.push(w.slice(0, k)); w = w.slice(k); } line = w; }
    }
    if (line) out.push(line); return out;
  };
  const write = (text: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 9, font = o.font ?? reg, indent = o.indent ?? 0, width = A4.w - M.l - M.r - indent;
    for (const l of wrap(text, font, size, width)) { room(size * 1.4); page.drawText(l, { x: M.l + indent, y: y - size, size, font, color: o.color ?? INK }); y -= size * 1.4; }
    y -= o.gap ?? 0;
  };
  newPage();
  write('Calculation record', { size: 20, font: bold, color: HEAD, gap: 4 });
  write(`Design standard: IS 800:2007 (the only design standard of this application)`, { size: 11, font: bold, gap: 2 });
  write(`Project: ${id.projectName}`, { size: 11 }); write(`Model revision ${id.modelRevision} · run ${id.runId}`, { size: 9, color: MUTE }); write(`Calculated ${id.createdAt} · engine ${id.engineVersion} · model fingerprint ${id.modelFingerprint}`, { size: 9, color: MUTE, gap: 6 });
  write(`Result labelling: ${rec.label.toUpperCase()}`, { size: 11, font: bold, color: rec.label === 'blocked' ? BAD : WARN });
  write('This record separates structural ANALYSIS results from IS 800 DESIGN checks. A converged analysis is not proof of design-code compliance; agreement with RSTAB internal forces is not proof of IS 800 compliance. Items marked provisional or pending are not verified.', { size: 8.5, color: MUTE, gap: 8 });
  for (const s of rec.sections) {
    room(40); write(`${s.n}. ${s.title}`, { size: 12, font: bold, color: HEAD, gap: 2 });
    if (!s.lines.length) write('(nothing to report)', { size: 8.5, color: MUTE });
    for (const l of s.lines) write('• ' + l, { size: 8.5, indent: 6, color: /^(ERROR|PENDING|warning)/.test(l) ? WARN : INK });
    y -= 6;
  }
  pages.forEach((p, i) => { p.drawText(`IS 800:2007 · ${clean(id.projectName)} · revision ${id.modelRevision} · run ${id.runId.slice(0, 8)}`, { x: M.l, y: 28, size: 7.5, font: reg, color: MUTE }); p.drawText(`Page ${i + 1} of ${pages.length}`, { x: A4.w - M.r - 52, y: 28, size: 7.5, font: reg, color: MUTE }); });
  return pdf.save();
}
