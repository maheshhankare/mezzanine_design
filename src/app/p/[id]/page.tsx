import { redirect, notFound } from 'next/navigation';
import { SCHEMA } from '@/shared/schema';
import { TEMPLATES } from '@/shared/templates';
import { currentUser } from '@/server/auth/session';
import { HttpError } from '@/server/http';
import { loadProject, publicProject } from '@/server/projects';
import ToolApp from '@/components/App';

export const dynamic = 'force-dynamic';

// The tool page for one project. Authorisation happens here on the server; nothing of the project is sent to someone without access.
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; name?: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent('/p/' + id)}`);
  const u = { id: user.id, name: user.name, email: user.email, role: user.role };

  if (id === 'new') {
    const sp = await searchParams;
    const tpl = TEMPLATES.find((x) => x.id === sp.t) || TEMPLATES[0];
    const inputs = Object.assign(SCHEMA.defaults(), tpl.inputs);
    const name = String(sp.name || '').slice(0, 200) || String(inputs.proj || '');
    return (
      <ToolApp
        user={u}
        initial={{ isNew: true, inputs, project: { id: null, revision: null, access: 'owner', name, reference: String(inputs.ref || '').slice(0, 200), customer: '', customer_contact: '', site: '', notes: '' } }}
      />
    );
  }

  try {
    const { p, access } = await loadProject(id, user, 'viewer');
    const pp = publicProject(p, access);
    return (
      <ToolApp
        user={u}
        initial={{
          isNew: false,
          inputs: pp.inputs,
          project: { id: pp.id, revision: pp.revision, access, name: pp.name, reference: pp.reference, customer: pp.customer, customer_contact: pp.customer_contact, site: pp.site, notes: pp.notes, updated_at: pp.updated_at ? new Date(pp.updated_at).toISOString() : null },
        }}
      />
    );
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
}
