/** A verifier issues a random, expiring code only after a 19+ threshold check.
 * Redis stores its digest; the application never collects evidence of age. */
const cookieName = '__Host-og-adult';
const sessionSeconds = 8 * 3600;
type Config = { ADULT_SESSION_SECRET?: string; UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string };
const encoder = new TextEncoder();
function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function key(config: Config) {
  if (!config.ADULT_SESSION_SECRET || config.ADULT_SESSION_SECRET.length < 43) throw Error('Eligibility unavailable');
  return crypto.subtle.importKey('raw',encoder.encode(config.ADULT_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function eligible(request: Request, config: Config) {
  const cookie = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const match = /^(\d{10})\.([a-zA-Z0-9_-]{22})\.([a-zA-Z0-9_-]{43})$/.exec(cookie ?? '');
  if (!match) return false;
  const now = Math.floor(Date.now()/1000), exp = Number(match[1]);
  if (exp <= now || exp > now+sessionSeconds) return false;
  const signature = Uint8Array.from(atob(match[3].replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
  return crypto.subtle.verify('HMAC',await key(config), signature, encoder.encode([new URL(request.url).origin,'19',match[1],match[2]].join('|')));
}
export async function codeKey(origin: string, code: string) {
  return 'og:adult:v1:'+base64(await crypto.subtle.digest('SHA-256',encoder.encode(origin+'|'+code)));
}
export async function redis(config: Config, command: string[]) {
  const url = new URL(config.UPSTASH_REDIS_REST_URL ?? '');
  if (url.protocol!=='https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password || url.search || url.pathname!=='/' || !config.UPSTASH_REDIS_REST_TOKEN) throw Error('Eligibility unavailable');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+config.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(4000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('Eligibility unavailable');
  const data=await response.json();
  if(data.error)throw Error('Eligibility unavailable');
  return data.result;
}
function redirectPath(value: string|null) {
  if(!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value))return '/';
  return value;
}
function gatePage(back:string, message='', status=200) {
  const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Age verification · Our Ground</title><style>body{margin:0;background:#f6f4ec;color:#163a30;font:1.125rem/1.55 system-ui}main{max-width:34rem;margin:8vh auto;padding:1.5rem}h1{font:2.5rem Georgia,serif}input,button{font:inherit;padding:.65em;max-width:100%;box-sizing:border-box}button{background:#163a30;color:white;border:0;margin-top:.7em}label,input{display:block}input:focus,button:focus{outline:3px solid #976e16;outline-offset:3px}</style><main><p>Our Ground</p><h1>Age verification</h1><p>Our Ground is for adults aged 19 or older. You can search for yourself or on someone else’s behalf.</p><p>For this limited launch, the operator gives you a one-time code after checking that you meet the age requirement. Our Ground does not collect your birth date or identity documents.</p>${message?`<p role="alert">${esc(message)}</p>`:''}<form method="post" action="/eligibility"><input type="hidden" name="return" value="${esc(back)}"><label for="code">Access code</label><input id="code" name="code" required maxlength="32" autocomplete="one-time-code" autocapitalize="none" spellcheck="false"><button type="submit">Continue</button></form><form method="post" action="/eligibility"><button name="under" value="yes">I am under 19</button></form></main></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});
}
function denyAPI(status:number) {
  return Response.json({error:{code:status===403?'AGE_VERIFICATION_REQUIRED':'ELIGIBILITY_UNAVAILABLE'}},{status,headers:{'Cache-Control':'private, no-store'}});
}
export async function adultGate(request:Request, config:Config, consume=redis):Promise<Response|null> {
  const url=new URL(request.url);
  try {
    if(url.pathname!=='/eligibility'){
      if(await eligible(request,config))return null;
      if(url.pathname.startsWith('/api/') || !['GET','HEAD'].includes(request.method))return denyAPI(403);
      return gatePage(redirectPath(url.pathname+url.search));
    }
    if(request.method==='GET'||request.method==='HEAD')return gatePage(redirectPath(url.searchParams.get('return')));
    if(request.method!=='POST'||request.headers.get('origin')!==url.origin)return denyAPI(403);
    if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return denyAPI(403);
    // Bounded stream prevents oversized anonymous form bodies, even without Content-Length.
    const reader=request.body?.getReader();if(!reader)return denyAPI(403);
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return denyAPI(403);}chunks.push(value);}
    const fields=new URLSearchParams(await new Blob(chunks as BlobPart[]).text());
    const back=redirectPath(fields.get('return'));
    if(fields.get('under')==='yes'){
      const response=gatePage('/','You must be at least 19 to use Our Ground.',403);
      response.headers.set('Set-Cookie',cookieName+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
      return response;
    }
    const code=fields.get('code')?.trim()??'';
    if(!/^[A-Za-z0-9_-]{32}$/.test(code))return gatePage(back,'Enter a valid, unused code from the operator.',403);
    const exp=Math.floor(Date.now()/1000)+sessionSeconds;
    const nonce=base64(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const signature=base64(await crypto.subtle.sign('HMAC',await key(config),encoder.encode([url.origin,'19',exp,nonce].join('|'))));
    if(await consume(config,['GETDEL',await codeKey(url.origin,code)])!=='19+')return gatePage(back,'This code is invalid, expired or already used.',403);
    return new Response(null,{status:303,headers:{Location:new URL(back,url.origin).href,'Cache-Control':'private, no-store','Set-Cookie':`${cookieName}=${exp}.${nonce}.${signature}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Strict`}});
  }catch{return url.pathname.startsWith('/api/')?denyAPI(503):gatePage('/','Age verification is temporarily unavailable. Please try again later.',503);}
}
