import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Page protection: without a valid session cookie every page except /login redirects to /login. (The user row and the permissions are
// checked again by the server pages and by every API route; this only stops unauthenticated visitors early.)
const PUBLIC = ['/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') || PUBLIC.includes(pathname)) return NextResponse.next();
  const token = req.cookies.get('mz_session')?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { algorithms: ['HS256'] });
      ok = true;
    } catch { /* expired or forged */ }
  }
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
