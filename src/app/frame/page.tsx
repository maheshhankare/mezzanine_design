import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import FrameProjects from '@/components/FrameProjects';

export const dynamic = 'force-dynamic';

export default async function FramePage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/frame');
  return <FrameProjects />;
}
