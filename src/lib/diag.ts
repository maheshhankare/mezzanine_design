// @ts-nocheck — browser/feature detection and diagnostic state, ported from the mockup (94_diag.js).
import { XCHK } from '@/engine/xcheck';
import { APP_VERSION } from '@/engine/xbref';

// features the application needs (required) or uses when present (optional)
const FEATURES: [string, boolean, () => boolean][] = [
  ['Typed arrays (Float64Array, Int32Array)', true, () => typeof Float64Array === 'function' && typeof Int32Array === 'function' && typeof Float64Array.from === 'function'],
  ['Math.imul (fingerprints)', true, () => typeof Math.imul === 'function'],
  ['Array.prototype.flatMap', true, () => typeof [].flatMap === 'function'],
  ['String.prototype.padStart', true, () => typeof ''.padStart === 'function'],
  ['Set / Map', true, () => typeof Set === 'function' && typeof Map === 'function'],
  ['Intl number formatting (en-GB)', true, () => typeof Intl === 'object' && (1234.5).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) === '1,234.50'],
  ['File download (Blob, object URL)', true, () => typeof Blob === 'function' && typeof URL === 'function' && typeof URL.createObjectURL === 'function'],
  ['File open (FileReader)', true, () => typeof FileReader === 'function'],
  ['Browser storage (design cases, last inputs)', false, () => { try { localStorage.setItem('csbd.probe', '1'); localStorage.removeItem('csbd.probe'); return true; } catch { return false; } }],
  ['Clipboard (Copy link)', false, () => !!(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext)],
  ['Print events (report)', false, () => 'onbeforeprint' in window],
];

export const features = () =>
  FEATURES.map(([name, required, test]) => {
    let ok = false;
    try { ok = !!test(); } catch { ok = false; }
    return { name, required, ok };
  });

// browser name and version from the user-agent data where available (Chromium), else the user-agent string
export function browser() {
  const ua = navigator.userAgent || '',
    m = (re: RegExp) => { const x = ua.match(re); return x ? x[1] : null; };
  let name = 'Unknown', ver: any = '', engine = 'unknown';
  const brands = navigator.userAgentData && navigator.userAgentData.brands ? navigator.userAgentData.brands.filter((b: any) => !/Not.?A.?Brand|Chromium/i.test(b.brand)) : [];
  if (/Avast|AvastSecure/i.test(ua)) { name = 'Avast Secure Browser'; ver = m(/Avast\/([\d.]+)/) || m(/Chrome\/([\d.]+)/) || ''; }
  else if (/Edg\//.test(ua)) { name = 'Microsoft Edge'; ver = m(/Edg\/([\d.]+)/); }
  else if (/OPR\//.test(ua)) { name = 'Opera'; ver = m(/OPR\/([\d.]+)/); }
  else if (/SamsungBrowser\//.test(ua)) { name = 'Samsung Internet'; ver = m(/SamsungBrowser\/([\d.]+)/); }
  else if (/Vivaldi\//.test(ua)) { name = 'Vivaldi'; ver = m(/Vivaldi\/([\d.]+)/); }
  else if (/Firefox\//.test(ua)) { name = 'Mozilla Firefox'; ver = m(/Firefox\/([\d.]+)/); }
  else if (/MSIE |Trident\//.test(ua)) { name = 'Internet Explorer (not supported)'; }
  else if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) { name = navigator.brave ? 'Brave' : brands.length ? brands[0].brand : 'Google Chrome / Chromium'; ver = m(/Chrome\/([\d.]+)/) || m(/CriOS\/([\d.]+)/); }
  else if (/Safari\//.test(ua)) { name = 'Safari'; ver = m(/Version\/([\d.]+)/) || ''; }
  if (/Firefox\//.test(ua)) engine = 'Gecko (SpiderMonkey)';
  else if (/Chrome\/|CriOS\/|Edg\//.test(ua) && !/CriOS\//.test(ua)) engine = 'Blink (V8)';
  else if (/AppleWebKit\//.test(ua)) engine = 'WebKit (JavaScriptCore)';
  return {
    name, version: ver || '', engine, ua,
    platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
    language: navigator.language || '',
    timeZone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
    screen: `${window.innerWidth}×${window.innerHeight} CSS px, device-pixel ratio ${window.devicePixelRatio || 1}`,
    secure: !!window.isSecureContext, protocol: location.protocol,
  };
}

export const SRC: Record<string, string> = {
  defaults: 'Example 3 defaults',
  link: 'a shared link (#c=…)',
  browser: 'restored from THIS browser’s storage (other browsers and computers keep their own)',
  case: 'a design case saved in this browser',
  file: 'a project file',
};

/** s = Design.diagState(); test = running/finished self-test (or null). */
export function diagSnapshot(s: any, test: any) {
  const b = browser(), F = features(), R = s.res;
  const current = !s.pending && s.resFp === s.curFp;
  return {
    application: 'C-Section Beam System Designer', appVersion: APP_VERSION, engineVersion: XCHK.ENGINE_VERSION, projectFormat: `${XCHK.FORMAT} v${XCHK.FORMAT_VERSION}`,
    dependencies: 'Next.js, React, Tailwind CSS; no other runtime libraries (the calculation engine is plain TypeScript)',
    engineeringData: 'built-in: steel grades (EN 10025-2, EN 10346, IS 2062, ASTM A653), bolt classes 4.6–10.9; no external profile library',
    referenceSet: XCHK.REF ? `${Object.keys(XCHK.REF.cases).length} cases recorded with ${XCHK.REF.runtime}, engine ${XCHK.REF.engine}` : 'not embedded',
    browser: b, features: F, missing: F.filter((f) => !f.ok).map((f) => f.name + (f.required ? ' (required)' : ' (optional)')),
    inputs: { source: SRC[s.src.kind] || s.src.kind, name: s.src.name || '', savedWith: s.src.version || '', edited: !!s.src.edited, changedFromDefaults: s.nChanged, fingerprint: s.curFp },
    results: {
      status: s.fatal ? 'invalid inputs: no results' : s.pending ? 'calculating' : R ? R.summary.overall.status : 'none', current, calculatedFrom: s.resFp,
      calculatedAt: s.resAt ? s.resAt.toISOString() : null, maxEta: R && !R.fatal ? R.summary.overall.eta : null,
      nFail: R && !R.fatal ? R.summary.nFail : null, nReview: R && !R.fatal ? R.summary.nReview : null,
      resultFingerprint: R && !R.fatal ? XCHK.hash(JSON.stringify(XCHK.summary(R))) : null,
    },
    mathProbe: XCHK.hash(JSON.stringify(XCHK.probe())),
    mathProbeReference: XCHK.REF && XCHK.REF.probe ? XCHK.hash(JSON.stringify(XCHK.REF.probe)) : null,
    selfTest: test,
  };
}
