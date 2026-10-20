import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route({ auth: 'user' }, async ({ user }) => ({ user }));
