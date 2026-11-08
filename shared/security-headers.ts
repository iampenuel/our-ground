export type SecurityHeaderOptions = { https?: boolean; authOrigin?: string; development?: boolean; fixtureAuth?: boolean };

export const documentBoundaryPolicy = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

/** Only a canonical selected Supabase HTTPS project may receive browser Auth
 * requests. A loopback fixture is an explicit local-development exception.
 */
export function cspAuthOrigin(value?: string, development = false): string | undefined {
  if(!value || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    if(url.origin !== value.replace(/\/$/,'') || url.username || url.password || url.search || url.hash || url.pathname !== '/') return undefined;
    if(url.protocol === 'https:' && !url.port && /^[a-z0-9]{10,30}\.supabase\.co$/.test(url.hostname)) return url.origin;
    if(development && url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)) return url.origin;
  } catch { /* No untrusted value becomes a directive. */ }
  return undefined;
}

/** Actually enforced. Google login uses top-level OAuth navigation, not remote
 * Google scripts/iframes. No Realtime socket or wildcard Auth host is needed.
 * MapLibre uses bundled workers and direct style-property updates, so installed
 * v6.16 requires no inline-style/eval/WebAssembly exception. Dev HMR alone needs
 * injected styles and loopback WebSockets; those are never in hosted config.
 */
export function resourcePolicy(authOrigin?: string, development = false, fixtureAuth = false): string {
  const auth = cspAuthOrigin(authOrigin, development || fixtureAuth);
  const local = development ? ' ws://127.0.0.1:* ws://localhost:*' : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-elem 'self'" + (development ? " 'unsafe-inline'" : ''),
    "style-src-attr 'none'",
    "img-src 'self' data: blob: https://maps.geoapify.com",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "connect-src 'self' https://api.geoapify.com https://maps.geoapify.com" + (auth ? ' '+auth : '') + local,
    "manifest-src 'self'",
    "frame-src 'none'",
    "media-src 'none'",
    documentBoundaryPolicy
  ].join('; ');
}

export function browserSecurityHeaders(options: SecurityHeaderOptions = {}): Record<string,string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
    'Content-Security-Policy': resourcePolicy(options.authOrigin,options.development,options.fixtureAuth),
    ...(options.https ? {'Strict-Transport-Security':'max-age=31536000'} : {})
  };
}

/** Browser capability only, never provider admission. Call exclusively after
 * the local eden-review document/loopback check; the API separately verifies
 * actual backend binding, owner/eligibility attestations and session consent.
 * Public/build/preview policies never call this helper.
 */
export function edenLocalReviewHeaders():Record<string,string> {
  return {
    'Content-Security-Policy':resourcePolicy(undefined,true)
      .replace("script-src 'self';","script-src 'self' 'wasm-unsafe-eval';")
      .replace("connect-src 'self' ","connect-src 'self' wss://generativelanguage.googleapis.com ")
      .replace("media-src 'none'",'media-src blob:'),
    'Permissions-Policy':'camera=(), microphone=(self), geolocation=(self), payment=()',
    'Cache-Control':'no-store'
  };
}

export const privateCacheHeaders: Record<string,string> = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export const privateDocumentHeaders: Record<string,string> = {
  ...privateCacheHeaders, 'Referrer-Policy':'no-referrer'
};

export function isPrivateDocumentPath(path: string) {
  return /^\/(?:account|staff|auth)(?:\/|$)/.test(path);
}

