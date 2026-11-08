import {requiresStagingAdmission,stagingAdmission} from './staging-limiter.ts';
// Server-side REST client: no SDK, retries, raw IP storage or secret-bearing logs.
export class DiscoveryLimitError extends Error {
  status: number; code: string; retryAfter: number;
  constructor(status: number, code: string, message: string, retryAfter = 60) {
    super(message); this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
// Redis TIME, not an instance clock. All keys share a cluster hash tag.
// Check every limit before incrementing any counter. Expiry bounds key retention.
export const admissionScript = `
local t = tonumber(redis.call('TIME')[1])
local specs = {}
if ARGV[1] == 'search' then
  specs = {{KEYS[1]..':search:'..math.floor(t/60),6,60-t%60}}
else
  specs = {{KEYS[2]..':day:'..math.floor(t/86400),math.min(200,tonumber(ARGV[2] or '200')),86400-t%86400},
           {KEYS[2]..':second:'..t,2,1},
           {KEYS[1]..':provider:'..math.floor(t/60),12,60-t%60}}
end
for _,s in ipairs(specs) do
  if tonumber(redis.call('GET',s[1]) or '0') >= s[2] then return {0,s[3]} end
end
for _,s in ipairs(specs) do
  redis.call('INCR',s[1]); redis.call('EXPIRE',s[1],s[3]+1)
end
if ARGV[1]~='search' then
 local used=tonumber(redis.call('GET',specs[1][1]) or '0')
 local threshold=math.floor(specs[1][2]*tonumber(ARGV[3] or '80')/100)
 if used>=threshold then redis.call('SET',KEYS[2]..':warning:'..math.floor(t/86400),used,'EX',86400-t%86400,'NX') end
end
return {1,0}
`;
// Accept only one platform-provided address; malformed/missing identities share
// a conservative bucket. Group IPv6 privacy addresses into the same /64.
export function clientNetwork(raw?: string): string {
  if (!raw || raw.length > 64 || raw.includes(',')) return 'unknown';
  const v = raw.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v) && v.split('.').every(n => +n <= 255)) return v.split('.').map(Number).join('.');
  if (!/^[a-fA-F0-9:]+$/.test(v) || !v.includes(':')) return 'unknown';
  try {
    const canonical = new URL(`http://[${v}]/`).hostname.slice(1,-1);
    const halves = canonical.split('::'), left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
    const words = halves.length === 2 ? [...left,...Array(8-left.length-right.length).fill('0'),...right] : left;
    // IPv4-mapped addresses use the IPv4 bucket too.
    if (words.slice(0,5).every(n => parseInt(n,16) === 0) && parseInt(words[5],16) === 65535) {
      const a=parseInt(words[6],16), b=parseInt(words[7],16); return [a>>8,a&255,b>>8,b&255].join('.');
    }
    return words.slice(0,4).map(n=>parseInt(n,16).toString(16)).join(':')+'::/64';
  } catch { return 'unknown'; }
}
type ProtectionReason = 'CONFIG_MISSING'|'URL_INVALID'|'TOKEN_INVALID'|'IDENTITY_HASH_FAILED'|'REDIS_AUTH_REJECTED'|'REDIS_COMMAND_REJECTED'|'REDIS_RESPONSE_INVALID'|'REDIS_TIMEOUT'|'REDIS_NETWORK_ERROR'|'REQUEST_CANCELLED';
export function createDiscoveryLimiter(env: Record<string,string|undefined>, fetcher: typeof fetch = fetch) {
  const required = env.VERCEL === '1' || Boolean(env.VERCEL_ENV) || env.NODE_ENV === 'production';
  const budget=Number(env.GEOAPIFY_SERVER_DAILY_BUDGET??200),warning=Number(env.GEOAPIFY_SERVER_WARNING_PERCENT??80);
  const configured = Boolean(env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN);
  async function admit(kind: 'search'|'provider', client?: string, signal?: AbortSignal) {
    if(requiresStagingAdmission(env)){
      try{
        const answer=await stagingAdmission(env).take(kind==='search'?'geo_search':'geo_provider',clientNetwork(client),budget,warning,signal);
        if(!answer.allowed)throw new DiscoveryLimitError(429,'SHARED_DISCOVERY_LIMIT','Search requests are temporarily limited. Please try later.',answer.retry);
        return;
      }catch(e){if(e instanceof DiscoveryLimitError)throw e;throw new DiscoveryLimitError(503,'DISCOVERY_PROTECTION_UNAVAILABLE','Search protection is temporarily unavailable. Please try later.');}
    }
    if (!required && !configured) return; // Existing offline/local fixtures remain offline.
    const unavailable = (reason: ProtectionReason) => {
      // Deliberately exclude provider errors, URLs, credentials and client identity.
      console.error(JSON.stringify({event:'discovery_protection_failure',reason,operation:kind}));
      return new DiscoveryLimitError(503,'DISCOVERY_PROTECTION_UNAVAILABLE','Search protection is temporarily unavailable. Please try later.');
    };
    if(!Number.isInteger(budget)||budget<1||budget>200||!Number.isInteger(warning)||warning<50||warning>95)throw unavailable('CONFIG_MISSING');
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (!env.UPSTASH_REDIS_REST_URL || !token) throw unavailable('CONFIG_MISSING');
    let url: URL;
    try { url = new URL(env.UPSTASH_REDIS_REST_URL); } catch { throw unavailable('URL_INVALID'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw unavailable('URL_INVALID');
    if (/\s/.test(token) || /^["']|["']$/.test(token)) throw unavailable('TOKEN_INVALID');
    let phase: 'identity'|'fetch'|'decode' = 'identity';
    let timeout: AbortSignal | undefined;
    try {
      signal?.throwIfAborted();
      // Only Vercel's overwritten header is trusted. Local callers share one bucket.
      const identity = env.VERCEL === '1' ? clientNetwork(client) : 'local';
      const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const digest = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(identity));
      const hash = Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      timeout = AbortSignal.timeout(2500);
      phase = 'fetch';
      const response = await fetcher(url.href, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',admissionScript,'2',`ourground:{geoapify}:client:${hash}`,'ourground:{geoapify}',kind,String(budget),String(warning)]),redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout});
      if (!response.ok) throw unavailable(response.status===401||response.status===403?'REDIS_AUTH_REJECTED':'REDIS_COMMAND_REJECTED');
      phase = 'decode';
      const data = await response.json() as {result?:unknown;error?:unknown};
      if (data?.error) throw unavailable('REDIS_COMMAND_REJECTED');
      if (!Array.isArray(data?.result) || data.result.length !== 2 || ![0,1].includes(data.result[0]) || !Number.isInteger(data.result[1]) || data.result[1]<0 || data.result[1]>86400) throw unavailable('REDIS_RESPONSE_INVALID');
      if (data.result[0] === 0) throw new DiscoveryLimitError(429,'SHARED_DISCOVERY_LIMIT','Search requests are temporarily limited. Please try later.',Math.max(1,data.result[1]));
    } catch (error) {
      if (error instanceof DiscoveryLimitError) throw error;
      throw unavailable(signal?.aborted?'REQUEST_CANCELLED':timeout?.aborted?'REDIS_TIMEOUT':phase==='identity'?'IDENTITY_HASH_FAILED':phase==='decode'?'REDIS_RESPONSE_INVALID':'REDIS_NETWORK_ERROR'); // Never retry or fail open.
    }
  }
  return {search:(client?:string,signal?:AbortSignal)=>admit('search',client,signal),provider:(client?:string,signal?:AbortSignal)=>admit('provider',client,signal)};
}
