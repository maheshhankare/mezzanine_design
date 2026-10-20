import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import UserAdmin from '@/components/UserAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/');
  return <UserAdmin me={user.id} />;
}
