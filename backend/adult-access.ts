// A host-bound signed session records a self-declared age threshold only.
const cookieName='__Host-og-audience';
const maxSeconds=8*3600;
const encoder=new TextEncoder();
type Config={ADULT_SESSION_SECRET?:string};
type Decision='19plus'|'under19';
const url64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function signingKey(config:Config){
  if(!config.ADULT_SESSION_SECRET||config.ADULT_SESSION_SECRET.length<43)throw Error('Age check unavailable');
  return crypto.subtle.importKey('raw',encoder.encode(config.ADULT_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const payload=(origin:string,token:string)=>encoder.encode('audience-v1|'+origin+'|'+token);
async function decisionFor(request:Request,config:Config):Promise<Decision|null>{
  const value=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const parts=/^(19plus|under19)\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value??'');
  const now=Math.floor(Date.now()/1000);
  if(!parts||Number(parts[2])<=now||Number(parts[2])>now+maxSeconds)return null;
  const mac=Uint8Array.from(atob(parts[4].replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
  if(!await crypto.subtle.verify('HMAC',await signingKey(config),mac,payload(new URL(request.url).origin,parts.slice(1,4).join('.'))))return null;
  return parts[1] as Decision;
}
export async function eligible(request:Request,config:Config){return await decisionFor(request,config)==='19plus';}
async function mint(origin:string,decision:Decision,config:Config){
  const token=[decision,Math.floor(Date.now()/1000)+maxSeconds,url64(crypto.getRandomValues(new Uint8Array(16)).buffer)].join('.');
  const mac=url64(await crypto.subtle.sign('HMAC',await signingKey(config),payload(origin,token)));
  return `${cookieName}=${token}.${mac}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function safePath(s:string|null){return s&&s.startsWith('/')&&!s.startsWith('//')&&!/[\\\u0000-\u001f]/.test(s)?s:'/';}
const privacy='Our Ground uses a signed browser session cookie to remember your age acknowledgment. We do not collect a birth date, identity document or selfie. EDEN’s voice commands use on-device English recognition where supported. Google receives only approved directory commands and published facts. Google’s unpaid service may use those inputs and outputs for product improvement and human review. Private reports go to the sole directory operator. Leave out identifying or sensitive information.';
const terms='Our Ground is a directory demo for people aged 19 and older. You may search for yourself or for someone else. Published information can change. Confirm hours, availability and eligibility directly with the listed organization. EDEN provides resource navigation and does not provide medical advice.';
function page(title:string,content:string,status=200){
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Our Ground</title><link rel="stylesheet" href="/eligibility.css"></head><body><main><p>Our Ground</p><h1>${title}</h1>${content}<nav aria-label="Site policies"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></nav></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex'}});
}
const gate=(back:string)=>page('For adults 19 and older',`<p>You can search for yourself or on someone else’s behalf. Are you 19 or older?</p><form method="post" action="/eligibility"><input type="hidden" name="return" value="${esc(back)}"><button name="age" value="19plus">Yes, I am 19 or older</button> <button name="age" value="under19">I am under 19</button></form><p>Your choice is remembered for this browser session.</p>`);
const under=()=>page('Our Ground is for adults 19 and older','<p>You cannot enter this demo. An adult can search on your behalf.</p>',403);
const deny=(status:number)=>Response.json({error:{code:status===403?'AGE_ACKNOWLEDGMENT_REQUIRED':'AGE_CHECK_UNAVAILABLE'}},{status,headers:{'Cache-Control':'private, no-store'}});
async function form(request:Request){
  const reader=request.body?.getReader();if(!reader)return null;
  const parts:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2048){await reader.cancel();return null;}parts.push(r.value);}
  return new URLSearchParams(await new Blob(parts as BlobPart[]).text());
}
export async function adultGate(request:Request,config:Config):Promise<Response|null>{
  const url=new URL(request.url);
  try{
    if(url.pathname==='/eligibility.css')return new Response('body{margin:0;background:#f6f4ec;color:#163a30;font:1.125rem/1.55 system-ui}main{max-width:34rem;margin:8vh auto;padding:1.5rem}h1{font:2.5rem Georgia,serif}button{font:inherit;color:white;background:#163a30;border:0;border-radius:.3em;padding:.7em;margin:.3em .3em .3em 0}a{color:inherit}button:focus-visible,a:focus-visible{outline:3px solid #976e16;outline-offset:4px}',{headers:{'Content-Type':'text/css','Cache-Control':'public,max-age=3600'}});
    const current=await decisionFor(request,config);
    if(request.method==='GET' && url.pathname==='/terms')return page('Terms',`<p>${terms}</p><a href="/">Return to Our Ground</a>`);
    if(request.method==='GET' && url.pathname==='/privacy' && current!=='19plus')return page('Privacy',`<p>${privacy}</p><a href="/">Return to Our Ground</a>`);
    if(url.pathname==='/eligibility' && request.method==='POST'){
      if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return deny(403);
      if(current==='under19')return under();
      const fields=await form(request),age=fields?.get('age');
      if(age!=='19plus'&&age!=='under19')return deny(403);
      const response=age==='under19'?under():new Response(null,{status:303,headers:{Location:new URL(safePath(fields?.get('return')??null),url.origin).href,'Cache-Control':'private,no-store'}});
      response.headers.set('Set-Cookie',await mint(url.origin,age,config));return response;
    }
    if(current==='19plus' && /^\/(account|auth|staff)(\/|$)/.test(url.pathname))return page('Directory demo','<p>Organization account access is closed. <a href="/support">Find support</a>.</p>',404);
    if(current==='19plus')return url.pathname==='/eligibility'?new Response(null,{status:303,headers:{Location:'/', 'Cache-Control':'private,no-store'}}):null;
    if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(request.method))return deny(403);
    return current==='under19'?under():gate(safePath(url.pathname+url.search));
  }catch{return url.pathname.startsWith('/api/')?deny(503):page('Age check unavailable','<p>Please try again later.</p>',503);}
}
