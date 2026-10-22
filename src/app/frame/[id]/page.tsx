import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import FrameProject from '@/components/FrameProject';

export const dynamic = 'force-dynamic';

export default async function FrameProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/frame/' + id)}`);
  return <FrameProject id={id} />;
}
