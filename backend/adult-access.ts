import {gate, page, previewPhotos} from './age-page.ts';
import {agePageStyle} from './age-page-style.ts';
import {publicApiRoute} from './api-route.ts';
// A host-bound signed session records a self-declared age threshold only.
const cookieName='__Host-og-audience';
const maxSeconds=8*3600;
const encoder=new TextEncoder();
type Config={ADULT_SESSION_SECRET?:string; STAGING_RATE_LIMIT_SECRET?:string; VERCEL_ENV?:string; VERCEL_PROJECT_ID?:string; ACCOUNT_RELEASE_MODE?:string; localDirectory?:boolean};
// The previously approved production demo remains sitewide adult-only. Only the
// designated protected preview (or the loopback development adapter) has public discovery.
const publicDiscovery=(c:Config)=>c.localDirectory===true||c.VERCEL_ENV==='preview'&&c.VERCEL_PROJECT_ID==='prj_eU9xRSetSQYTbkAce2cYIR5zx8c2';
type Decision='19plus'|'under19';
const url64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function signingKey(config:Config){
  let material:BufferSource;
  if(config.VERCEL_ENV==='preview'&&publicDiscovery(config)&&/^[a-f0-9]{64}$/.test(config.STAGING_RATE_LIMIT_SECRET??'')){
    // A scope-separated subkey of the existing staging-only secret. No production keys.
    const key=await crypto.subtle.importKey('raw',encoder.encode(config.STAGING_RATE_LIMIT_SECRET),'HKDF',false,['deriveBits']);
    material=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:encoder.encode('ourground-staging'),info:encoder.encode('eden-age-acknowledgment-v1')},key,256);
  }else{
    if(!config.ADULT_SESSION_SECRET||config.ADULT_SESSION_SECRET.length<43)throw Error('Age check unavailable');
    material=encoder.encode(config.ADULT_SESSION_SECRET);
  }
  return crypto.subtle.importKey('raw',material,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const payload=(origin:string,token:string)=>encoder.encode('audience-v1|'+origin+'|'+token);
async function decisionFor(request:Request,config:Config):Promise<{decision:Decision;nonce:string}|null>{
  const value=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const parts=/^(19plus|under19)\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value??'');
  const now=Math.floor(Date.now()/1000);
  if(!parts||Number(parts[2])<=now||Number(parts[2])>now+maxSeconds)return null;
  const mac=Uint8Array.from(atob(parts[4].replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
  if(!await crypto.subtle.verify('HMAC',await signingKey(config),mac,payload(new URL(request.url).origin,parts.slice(1,4).join('.'))))return null;
  return {decision:parts[1] as Decision,nonce:parts[3]};
}
export async function adultSessionNonce(request:Request,config:Config){
  const session=await decisionFor(request,config);
  return session?.decision==='19plus'?session.nonce:null;
}
async function mint(origin:string,decision:Decision,config:Config){
  const token=[decision,Math.floor(Date.now()/1000)+maxSeconds,url64(crypto.getRandomValues(new Uint8Array(16)).buffer)].join('.');
  const mac=url64(await crypto.subtle.sign('HMAC',await signingKey(config),payload(origin,token)));
  return `${cookieName}=${token}.${mac}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
function safePath(s:string|null){return s&&s.startsWith('/')&&!s.startsWith('//')&&!/[\\\u0000-\u001f]/.test(s)?s:'/';}
const privacy='Our Ground uses a signed browser session cookie to remember your age acknowledgment. We do not collect a birth date, identity document or selfie. EDEN’s voice commands use on-device English recognition where supported. Text chat sends approved directory commands and published facts. If you consent to Talk to Eden, microphone audio streams directly to Google for the duration of your call. Google’s unpaid service may use those inputs and outputs for product improvement and human review. Private reports go to the sole directory operator. Leave out identifying or sensitive information.';
const terms='Our Ground is a directory demo for people aged 19 and older. You may search for yourself or for someone else. Published information can change. Confirm hours, availability and eligibility directly with the listed organization. EDEN provides resource navigation and does not provide medical advice.';
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
  const publicSite=publicDiscovery(config);
  const route=publicApiRoute(url);
  const protectedFeature=route==='eden'||route.startsWith('eden/')||route==='correction-reports';
  const policyReply=(value:object,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Accept','Referrer-Policy':'no-referrer'}});
  const json=request.headers.get('accept')?.includes('application/json');
  try{
    if(publicSite&&!protectedFeature&&!['/eligibility','/eligibility.css','/terms'].includes(url.pathname))return null;
    // Only the two static photographs may pass through to Vercel before signing.
    if((request.method==='GET'||request.method==='HEAD') && !url.search &&
       (url.pathname===previewPhotos.desktop||url.pathname===previewPhotos.mobile))return null;
    if(url.pathname==='/eligibility.css')return new Response(agePageStyle,{headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public,max-age=3600'}});
    const current=(await decisionFor(request,config))?.decision;
    if(request.method==='GET' && url.pathname==='/eligibility' && json)return policyReply({eligible:current==='19plus',denied:current==='under19'});
    if(request.method==='GET' && url.pathname==='/terms')return page('Terms',`<p>${publicSite?'The public directory is available without an Eden session. Eden and private correction reports are for people aged 19 and older. Confirm listing details with the provider.':terms}</p><a href="/">Return to Our Ground</a>`);
    if(request.method==='GET' && url.pathname==='/privacy' && current!=='19plus')return page('Privacy',`<p>${privacy}</p><a href="/">Return to Our Ground</a>`);
    if(url.pathname==='/eligibility' && request.method==='POST'){
      if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return deny(403);
      if(current==='under19')return json?policyReply({eligible:false,denied:true},403):under();
      const fields=await form(request),age=fields?.get('age');
      if(age!=='19plus'&&age!=='under19')return deny(403);
      const response=json?policyReply({eligible:age==='19plus',denied:age==='under19'},age==='19plus'?200:403):age==='under19'?under():new Response(null,{status:303,headers:{Location:new URL(safePath(fields?.get('return')??null),url.origin).href,'Cache-Control':'private,no-store'}});
      if(current!==age)response.headers.set('Set-Cookie',await mint(url.origin,age,config));return response;
    }
    const signInRoute=config.VERCEL_ENV==='production'&&config.VERCEL_PROJECT_ID==='prj_4li6QnqulPgPbJpxMW2L9hczDNrS'&&config.ACCOUNT_RELEASE_MODE==='signin_only'
      &&request.method==='GET'&&['/account','/auth/callback'].includes(url.pathname);
    if(current==='19plus' && !signInRoute && /^\/(account|auth|staff)(\/|$)/.test(url.pathname))return page('Directory demo','<p>Organization account access is closed. <a href="/support">Find support</a>.</p>',404);
    if(current==='19plus')return url.pathname==='/eligibility'?new Response(null,{status:303,headers:{Location:'/', 'Cache-Control':'private,no-store'}}):null;
    if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(request.method))return deny(403);
    return current==='under19'?under():gate(safePath(url.pathname+url.search));
  }catch{return url.pathname.startsWith('/api/')?deny(503):page('Age check unavailable','<p>Please try again later.</p>',503);}
}
