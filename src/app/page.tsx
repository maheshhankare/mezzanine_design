import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import { q } from '@/server/db';
import ProjectList from '@/components/ProjectList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const rows = await q(
    `select p.id, p.name, p.reference, p.customer, p.site, p.design_status, p.max_utilisation, p.revision, p.updated_at,
            u.name as owner_name, case when p.owner_id = $1 then 'owner' else m.role end as access
       from projects p join users u on u.id = p.owner_id
       left join project_members m on m.project_id = p.id and m.user_id = $1
      where p.owner_id = $1 or m.user_id is not null
      order by p.updated_at desc limit 500`,
    [user.id],
  );
  const projects = rows.map((r: any) => ({ ...r, updated_at: new Date(r.updated_at).toISOString() }));
  return <ProjectList user={{ name: user.name, email: user.email, role: user.role }} initial={projects} />;
}
