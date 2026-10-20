'use client';

import { useEffect } from 'react';
import { DesignProvider, useDesign, type ProjectState, type User } from '@/state/DesignProvider';
import { Header } from './Header';
import { LeftNav, Tabs } from './Nav';
import { InputsPane } from './InputsPane';
import { DiagDialog } from './DiagDialog';
import { DetailsDialog } from './DetailsDialog';
import { OptPane } from './OptPane';
import { Card } from './common';
import { BracPanel, ColPanel, ConnPanel, DeckPanel, JoistPanel, KneePanel } from './panels/Systems';
import { MemberPanel } from './panels/Member';
import { GenPanel, Messages, SumPanel } from './panels/Overview';
import { DwgPanel } from './panels/Drawings';
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
        {!res && <Card><p>Calculating on the server…</p></Card>}
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
  const { busy, toastMsg, tab, project } = useDesign();

  useEffect(() => {
    document.title = `${tabLabel(tab)} · ${project.name || 'New project'} · C-Section Beam Designer`;
  }, [tab, project.name]);

  return (
    <>
      <Header />
      <div className="no-print">
        <Tabs />
        <div id="shell">
          <LeftNav />
          <main id="pane"><Pane /></main>
        </div>
      </div>
      <div className="print-only print-notice">
        <h2>Printing the application screen is not available</h2>
        <p>Use <b>Generate PDF Report</b> in the application to produce the engineering report. The PDF can be saved or printed from your PDF viewer.</p>
      </div>
      <div id="busy" className="no-print" hidden={!busy}>calculating…</div>
      <div id="toast" className="no-print" hidden={!toastMsg} role="status">{toastMsg}</div>
      <DiagDialog />
      <DetailsDialog />
    </>
  );
}

export default function ToolApp({ user, initial }: { user: User; initial: { project: ProjectState; inputs: Record<string, any>; isNew: boolean } }) {
  return (
    <DesignProvider user={user} initial={initial}>
      <Shell />
    </DesignProvider>
  );
}
