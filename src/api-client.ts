export class BackendError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) { super(message); this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}
/** Retain only bounded retry timing, never arbitrary response headers. */
function retryAfterSeconds(response: Response): number | undefined {
  const value=response.headers.get('Retry-After')?.trim();
  if(!value)return undefined;
  let seconds:number;
  if(/^\d+$/.test(value))seconds=Number(value);
  else {
    if(!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))return undefined;
    const date=Date.parse(value);if(!Number.isFinite(date))return undefined;
    seconds=Math.max(0,Math.ceil((date-Date.now())/1000));
  }
  return Number.isSafeInteger(seconds)&&seconds>=0&&seconds<=2678400?seconds:undefined;
}
// Tab-local, timing only: never store a query, location, response or provider data.
let legacyResolverRetryAt=0;
export async function apiRequest<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const legacy=!authenticated && /^places\/resolve(?:\?|$)/.test(path);
  if(legacy && Date.now()<legacyResolverRetryAt){
    init.signal?.throwIfAborted();
    throw new BackendError(429,'RATE_LIMITED','Location lookup is still rate limited. Please wait before trying again.',Math.ceil((legacyResolverRetryAt-Date.now())/1000));
  }
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const { authClient } = await import('./backend-client');
    const { data, error } = await authClient().auth.getSession();
    if (error || !data.session) throw new BackendError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    headers.set('Authorization', 'Bearer ' + data.session.access_token);
  }
  let response: Response;
  try { response = await fetch('/api/v1/' + path.replace(/^\/+/, ''), { ...init, headers }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new BackendError(0, 'NETWORK_ERROR', 'Could not reach Our Ground. Check your connection and try again.');
  }
  const retry=retryAfterSeconds(response);
  if(legacy && response.status===429 && retry)legacyResolverRetryAt=Math.max(legacyResolverRetryAt,Date.now()+retry*1000);
  let result;
  try { result = await response.json(); }
  catch { throw new BackendError(response.status, 'INVALID_RESPONSE', 'Resource information is temporarily unavailable. Please try again.', retryAfterSeconds(response)); }
  if (!response.ok) {
    if(import.meta.env?.DEV&&!authenticated){
      const service=/^(?:places\/(?:resolve|directory-city)|locations\/(?:resolve|suggest|retrieve|reverse))(?:\?|$)/.test(path)?'resolver':/^resources(?:\/|\?|$)/.test(path)?'resources':null;
      if(service){const{recordEdenDevelopmentIssue}=await import('./eden/development-diagnostics.ts');recordEdenDevelopmentIssue(service,response.status,result?.error?.code,retryAfterSeconds(response));}
    }
    throw new BackendError(response.status, result?.error?.code ?? 'REQUEST_FAILED', result?.error?.message ?? 'The request could not be completed.', retryAfterSeconds(response));
  }
  return result as T;
}
