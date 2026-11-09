import {requiresStagingAdmission,stagingAdmission} from './staging-limiter.ts';
import { createHmac } from 'node:crypto';
import { clientNetwork } from './geoapify-limits.ts';
export type PublicAction='report'|'resolve'|'read'|'auth'|'logout'|'location'|'location_reference'|'location_submit';
export interface PublicProtection{admit(action:PublicAction,request:Request):Promise<void>}
export class PublicProtectionError extends Error{
 status:number;code:string;retryAfter:number;
 constructor(status:number,code:string,message:string,retryAfter=60){super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}
}
export const publicAdmissionScript=`
local t=tonumber(redis.call('TIME')[1])
local limits={}
local period=tonumber(ARGV[2]); local max=tonumber(ARGV[3]);
limits[1]={KEYS[1]..':'..math.floor(t/period),max,period-t%period}
if tonumber(ARGV[4])>0 then limits[2]={KEYS[2]..':'..math.floor(t/86400),tonumber(ARGV[4]),86400-t%86400} end
for _,s in ipairs(limits) do if tonumber(redis.call('GET',s[1]) or '0')>=s[2] then return {0,s[3]} end end
for _,s in ipairs(limits) do redis.call('INCR',s[1]);redis.call('EXPIRE',s[1],s[3]+1) end
return {1,0}
`;
const limits:Record<PublicAction,[number,number,number]>={report:[3600,3,100],resolve:[60,6,100],read:[60,120,0],auth:[60,30,0],logout:[60,60,0],location:[60,30,100],location_reference:[60,30,0],location_submit:[60,6,0]};
/** Existing Redis is reused with distinct keys; no Geoapify counters are changed. */
export function createPublicProtection(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):PublicProtection{
 const required=env.VERCEL==='1'||Boolean(env.VERCEL_ENV)||env.NODE_ENV==='production';
 return {async admit(action,request){
  const token=env.UPSTASH_REDIS_REST_TOKEN,raw=env.UPSTASH_REDIS_REST_URL;
  if(requiresStagingAdmission(env)){
   try{
    const budget=Number(action==='location'?(env.GEOAPIFY_LOCATION_DAILY_BUDGET??100):100);
    const answer=await stagingAdmission(env).take(action,clientNetwork(request.headers.get('x-vercel-forwarded-for')??undefined),budget,80,request.signal);
    if(!answer.allowed)throw new PublicProtectionError(429,'RATE_LIMITED','Too many requests. Please wait before trying again.',answer.retry);
    return;
   }catch(e){if(e instanceof PublicProtectionError)throw e;throw new PublicProtectionError(503,'ABUSE_PROTECTION_UNAVAILABLE','Request protection is temporarily unavailable. Please try again later.');}
  }
  if(!required&&!token&&!raw)return; // Deterministic offline fixtures; never a production fallback.
  const unavailable=()=>new PublicProtectionError(503,'ABUSE_PROTECTION_UNAVAILABLE','Request protection is temporarily unavailable. Please try again later.');
  if(!token||!raw||token!==token.trim()||/[\s"']/.test(token))throw unavailable();let url:URL;
  try{url=new URL(raw);}catch{throw unavailable();}
  if(url.protocol!=='https:'||!url.hostname.endsWith('.upstash.io')||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw unavailable();
  const identity=env.VERCEL==='1'?clientNetwork(request.headers.get('x-vercel-forwarded-for')??undefined):'local';
  const hash=createHmac('sha256',token).update('public-protection:'+identity).digest('hex');
  const [period,max,global]=limits[action];
  const configuredBudget=Number(env.GEOAPIFY_LOCATION_DAILY_BUDGET??100);if(action==='location'&&(!Number.isInteger(configuredBudget)||configuredBudget<1||configuredBudget>200))throw unavailable();
  const keys=[`ourground:{public-protection}:${action}:client:${hash}`,`ourground:{public-protection}:${action}:day`];
  try{
   const r=await fetcher(url.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',publicAdmissionScript,String(keys.length),...keys,action,String(period),String(max),String(action==='location'?configuredBudget:global)]),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2500)});
   if(!r.ok)throw unavailable();const data=await r.json() as {error?:unknown;result?:unknown};
   if(data.error||!Array.isArray(data.result)||data.result.length!==2||![0,1].includes(data.result[0])||!Number.isInteger(data.result[1])||data.result[1]<0||data.result[1]>2678400)throw unavailable();
   if(data.result[0]===0)throw new PublicProtectionError(429,'RATE_LIMITED','Too many requests. Please wait before trying again.',Math.max(1,data.result[1]));
  }catch(error){if(error instanceof PublicProtectionError)throw error;throw unavailable();}
 }};
}
