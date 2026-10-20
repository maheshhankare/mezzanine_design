'use client';

import dynamic from 'next/dynamic';

// The designer reads browser storage, the URL hash and print events on start-up, so it renders on the client only.
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => <p className="p-4 text-ink2">Loading the designer…</p>,
});

export default function Home() {
  return <App />;
}
