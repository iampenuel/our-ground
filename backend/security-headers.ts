import { browserSecurityHeaders, privateCacheHeaders,cspAuthOrigin } from '../shared/security-headers.ts';

/** Preserve application-specific Retry-After and other response headers. */
export function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers), url = new URL(request.url);
  for (const [key,value] of Object.entries(browserSecurityHeaders({https:url.protocol==='https:',authOrigin:cspAuthOrigin(process.env.SUPABASE_URL)}))) headers.set(key,value);
  // API responses can contain private state, source failures or user-specific
  // authorization results. Do not permit an intermediary to cache them.
  for (const [key,value] of Object.entries(privateCacheHeaders)) {
    if(key==='Cache-Control' && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(headers.get(key)??'')) continue;
    headers.set(key,value);
  }
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Vary',[...new Set((headers.get('Vary')??'').split(',').map(x=>x.trim()).filter(Boolean).concat('Authorization','Origin'))].join(', '));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
