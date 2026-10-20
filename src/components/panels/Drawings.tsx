'use client';

import { useEffect, useState } from 'react';
import { useDesign } from '@/state/DesignProvider';
import { F } from '@/lib/format';
import { api, download, jsonInit, unitsNow } from '@/lib/api';
import { Card, Html, Pill } from '../common';
import { Messages } from './Overview';

// Drawings are generated on the server from the calculated model (SVG previews, DXF files on request).
export function DwgPanel() {
  const { res, I, toast } = useDesign();
  const [B, setB] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!res) return;
    const ac = new AbortController();
    setErr(null);
    api('/api/drawings', 'POST', { inputs: I, units: unitsNow() }, ac.signal)
      .then(setB)
      .catch((e) => { if (e?.name !== 'AbortError') setErr(e.message || 'Drawings could not be generated'); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  const dl = async (id: string, fallback: string) => {
    try {
      await download('/api/drawings/dxf', jsonInit('POST', { inputs: I, units: unitsNow(), id }), fallback);
      toast(id === 'drawings' ? `${B.list.length} drawings written to one DXF` : 'DXF downloaded');
    } catch (e: any) { toast('Download failed: ' + (e.message || e)); }
  };

  if (err) return <Card bad><h3>No drawings</h3><p>{err}</p></Card>;
  if (!B) return <Card><h3>Drawings (DXF)</h3><p>Generating the drawings…</p></Card>;
  if (B.error)
    return (
      <>
        <Card bad><h3>No drawings</h3><p>{B.error}</p></Card>
        <Messages />
      </>
    );
  const st = B.status;
  return (
    <>
      <Card>
        <h3>Drawings (DXF) <Pill st={st} /></h3>
        <p>All drawings are generated from the current calculation and update with every input change. Files are AutoCAD R12 DXF (opens in AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD and most CAM software), in millimetres, drawn 1:1 in model space, with layers {B.layers.join(', ')}.</p>
        {st !== 'PASS' && <p className="no"><b>The design does not pass ({st}).</b> Every drawing is stamped “NOT FOR FABRICATION” until all checks pass.</p>}
        <div className="dwgbar">
          <button type="button" className="big-btn" id="dw_all" onClick={() => dl('drawings', B.allFileName)}>Download all drawings (one DXF)</button>
          <span className="hint">{B.list.length} drawings. Use the button under each preview for a single drawing.</span>
        </div>
        <p className="hint">Cut lengths, end offsets and the member schedule come from the support widths and connection stand-offs in the model; confirm them against the connection details before ordering. Plates, bolts and decking are not in the schedule.</p>
      </Card>
      <Card>
        <h3>Member schedule</h3>
        <table className="rt">
          <tbody>
            <tr><th>Mark</th><th>Qty</th><th>Section</th><th className="num">Cut length [mm]</th><th className="num">kg each</th><th className="num">kg total</th></tr>
            {B.schedule.map((r: any) => (
              <tr key={r.mark}>
                <td>{r.mark}</td><td className="num">{r.qty}</td><td>{r.sec}</td>
                <td className="num">{F(r.L, 0)}</td><td className="num">{F(r.kg, 1)}</td><td className="num">{F(r.kg * r.qty, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="dwgrid">
        {B.list.map((D: any) => (
          <section className="card dwgc" key={D.id}>
            <h3>{D.title}</h3>
            <Html html={D.svg} />
            <p>
              <button type="button" onClick={() => dl(D.id, D.fileName)}>Download DXF</button> <span className="hint">{D.fileName}</span>
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
