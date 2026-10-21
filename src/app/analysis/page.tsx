import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import AnalysisSettingsPanel from '@/components/AnalysisSettingsPanel';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/analysis');
  return <AnalysisSettingsPanel />;
}
