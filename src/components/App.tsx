'use client';

import { useEffect } from 'react';
import { DesignProvider, useDesign } from '@/state/DesignProvider';
import { Header } from './Header';
import { LeftNav, Tabs } from './Nav';
import { InputsPane } from './InputsPane';
import { DiagDialog } from './DiagDialog';
import { OptPane } from './OptPane';
import { Card, Html } from './common';
import { BracPanel, ColPanel, ConnPanel, DeckPanel, JoistPanel, KneePanel } from './panels/Systems';
import { MemberPanel } from './panels/Member';
import { DwgPanel, GenPanel, Messages, SumPanel } from './panels/Overview';
import { tabLabel } from '@/lib/project';

function Results({ tab }: { tab: string }) {
  switch (tab) {
    case 'gen': return <GenPanel />;
    case 'mb': return <MemberPanel k="mb" />;
    case 'sbi': return <MemberPanel k="sbi" />;
    case 'sbe': return <MemberPanel k="sbe" />;
    case 'conn': return <ConnPanel />;
    case 'col': return <ColPanel />;
    case 'joist': return <JoistPanel />;
    case 'knee': return <KneePanel />;
    case 'deck': return <DeckPanel />;
    case 'brac': return <BracPanel />;
    default: return null;
  }
}

function Pane() {
  const { tab, res } = useDesign();
  if (tab === 'sum') return <div className="one"><SumPanel /></div>;
  if (tab === 'opt') return <OptPane />;
  if (tab === 'dwg') return <div className="one dwgw"><DwgPanel /></div>;
  const fatal = res && res.fatal;
  return (
    <div className="split">
      <InputsPane tab={tab} />
      <div className="results">
        <h2>Calculated</h2>
        {fatal && (
          <>
            <Card bad>
              <h3>No results</h3>
              <p>Results are withheld until the invalid inputs are corrected; nothing is reported as PASS from a substituted value.</p>
            </Card>
            {tab !== 'gen' && <Messages />}
          </>
        )}
        <Results tab={tab} />
      </div>
    </div>
  );
}

function Shell() {
  const { busy, toastMsg, reportHtml, flush, tab } = useDesign();

  // capture phase: any action button outside the inputs sees results that belong to the inputs on screen
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('button, a');
      if (t && !t.closest('#inputs')) flush();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [flush]);

  useEffect(() => {
    document.title = `${tabLabel(tab)} · C-Section Beam Designer`;
  }, [tab]);

  return (
    <>
      <Header />
      <Tabs />
      <div id="shell">
        <LeftNav />
        <main id="pane"><Pane /></main>
      </div>
      <div id="busy" hidden={!busy}>calculating…</div>
      <div id="toast" hidden={!toastMsg}>{toastMsg}</div>
      <div id="report"><Html html={reportHtml} /></div>
      <DiagDialog />
    </>
  );
}

export default function App() {
  return (
    <DesignProvider>
      <Shell />
    </DesignProvider>
  );
}
