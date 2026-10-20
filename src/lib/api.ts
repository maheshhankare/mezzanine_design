import { parse } from 'devalue';
import { UNITS } from '@/shared/units';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

function toLogin() {
  if (typeof window !== 'undefined' && !location.pathname.startsWith('/login'))
    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(path, { credentials: 'same-origin', ...init });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e; // superseded or cancelled on purpose: not an error to show
    throw new ApiError(0, 'The server could not be reached. Check your connection and try again.');
  }
  if (r.status === 401) {
    toLogin();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }
  if (!r.ok) {
    let data: any = null;
    try { data = await r.json(); } catch { /* not JSON */ }
    throw new ApiError(r.status, data?.error || `Request failed (${r.status})`, data);
  }
  return r;
}

const jsonInit = (method: string, body?: unknown, signal?: AbortSignal): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal,
});

export async function api<T = any>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  return (await request(path, jsonInit(method, body, signal))).json();
}

/** The display units are sent with every request that renders text or sketches on the server. */
export const unitsNow = () => UNITS.get();

/** Calculation on the server. The answer is devalue text: shared references and Infinity are preserved. */
export async function calcRequest(inputs: unknown, signal?: AbortSignal) {
  const r = await request('/api/calc', jsonInit('POST', { inputs, units: unitsNow() }, signal));
  return parse(await r.text()) as { res: any; takeoff: any; fingerprint: string; engine: string; appVersion: string; at: string };
}

export async function download(path: string, init: RequestInit, fallbackName: string) {
  const r = await request(path, init);
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export { jsonInit };
