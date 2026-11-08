import {isResourceState} from '../shared/resource-geography.ts';
import {validPoint} from '../shared/us-location.ts';
import { randomUUID } from 'node:crypto';
import { boundedJsonObject, RequestInputError } from './request-safety.ts';
import { PublicProtectionError } from './anonymous-protection.ts';
import { clientNetwork } from './geoapify-limits.ts';
import { OrganizationStoreError } from './organization-store.ts';
import { createHash, createHmac } from 'node:crypto';
import { sourcePhone, sourceWebsite } from '../shared/place-evidence.ts';
import type { ListingPatch } from '../shared/organization-accounts.ts';
import { UnavailableError } from './errors.ts';

export interface OrganizationPrincipal { id:string; email:string; sessionId:string; expiresAt:number }
export interface OrganizationDependencies {
  configured:boolean;
  emailConfigured?:boolean;
  verify(token:string):Promise<OrganizationPrincipal|null>;
  startEmail(email:string,origin:string):Promise<void>;
  revokeProvider(token:string):Promise<void>;
  allowedOrigins:ReadonlySet<string>;
  rateSalt:string;
  limitAuth?:(request:Request)=>Promise<void>;
  limitLogout?:(request:Request)=>Promise<void>;
  store:{command(actor:string,action:string,input?:Record<string,unknown>,context?:{requestId:string;sessionHash:string}):Promise<unknown>;consumeAccountLimit(keyHash:string,action:'email'|'client'|'verify'):Promise<unknown>;auditSecurityFailure?:(actor:string,action:string,targetId:string|null,context:{requestId:string;sessionHash:string})=>Promise<unknown>};
}
export class OrganizationApiError extends Error {
  status:number; code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(status:number,code:string,message:string):never{throw new OrganizationApiError(status,code,message);}
function text(v:unknown,min:number,max:number,label:string):string{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(422,'VALIDATION_ERROR','Check '+label+'.');return v.trim();}
function fields(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(x=>!allowed.includes(x)))fail(422,'VALIDATION_ERROR','This field cannot be changed.');}
function email(v:unknown){const s=text(v,3,254,'the email address').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail(422,'VALIDATION_ERROR','Enter a valid email address.');return s;}
function website(v:unknown){if(v===null||v==='')return null;const s=sourceWebsite(v);if(!s)fail(422,'VALIDATION_ERROR','Use a complete http or https website address.');return s;}
function phone(v:unknown){if(v===null||v==='')return null;const s=sourcePhone(v);if(!s)fail(422,'VALIDATION_ERROR','Check the phone number.');return s;}
function id(v:unknown){if(typeof v!=='string'||!uuid.test(v))fail(422,'VALIDATION_ERROR','Choose a valid record.');return v;}
function version(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<1||Number(v)>2147483647)fail(422,'VALIDATION_ERROR','Reload the current listing before submitting changes.');return v as number;}
const body=(request:Request)=>boundedJsonObject(request);
export function validateClaim(v:Record<string,unknown>){
  fields(v,['organization_name','website_url','location','applicant_role','contact_email','contact_phone','explanation']);
  return {organization_name:text(v.organization_name,2,160,'the organization name'),website_url:website(v.website_url??null),location:text(v.location,3,300,'the organization location'),applicant_role:text(v.applicant_role,2,100,'your role'),contact_email:email(v.contact_email),contact_phone:phone(v.contact_phone??null),explanation:v.explanation==null||v.explanation===''?null:text(v.explanation,1,1000,'the supporting explanation')};
}
export function validateListingPatch(value:unknown):ListingPatch{
 if(!value||typeof value!=='object'||Array.isArray(value))fail(422,'VALIDATION_ERROR','Supply the proposed changes.');const v=value as Record<string,unknown>,result:Record<string,unknown>={};
 const strings:Record<string,[number,number,boolean]>={title:[2,160,false],summary:[0,500,false],description:[0,4000,false],eligibility_text:[0,1000,true],cost_summary:[0,500,true],appointment_note:[0,1000,true],organization_description:[0,4000,false],site_name:[2,160,false],street_address:[0,300,true],city:[2,100,false],postal_code:[5,10,true]};
 fields(v,[...Object.keys(strings),'contact_phone','contact_url','website_url','public_phone','state','latitude','longitude','category_slugs','hours']);
 if(!Object.keys(v).length)fail(422,'VALIDATION_ERROR','Supply at least one proposed change.');
 for(const [key,[min,max,nullable]] of Object.entries(strings))if(Object.hasOwn(v,key)){result[key]=v[key]===null&&nullable?null:text(v[key],min,max,key.replaceAll('_',' '));}
 if(result.postal_code!=null&&!/^\d{5}(?:-\d{4})?$/.test(String(result.postal_code)))fail(422,'VALIDATION_ERROR','Use a five-digit ZIP or ZIP+4 code.');
 for(const key of ['contact_url','website_url'])if(Object.hasOwn(v,key))result[key]=website(v[key]);
 for(const key of ['contact_phone','public_phone'])if(Object.hasOwn(v,key))result[key]=phone(v[key]);
 if(Object.hasOwn(v,'state')){if(!isResourceState(v.state))fail(422,'VALIDATION_ERROR','Use a supported two-letter state or territory code.');result.state=v.state;}
 if(Object.hasOwn(v,'latitude')||Object.hasOwn(v,'longitude')){const lat=v.latitude,lng=v.longitude;if(!validPoint(lat,lng))fail(422,'VALIDATION_ERROR','Supply both valid latitude and longitude coordinates.');result.latitude=lat;result.longitude=lng;}
 if(Object.hasOwn(v,'category_slugs')){const a=v.category_slugs;if(!Array.isArray(a)||a.length<1||a.length>2||new Set(a).size!==a.length||a.some(x=>!['food','healthcare'].includes(x)))fail(422,'VALIDATION_ERROR','Choose food assistance, healthcare, or both.');result.category_slugs=a;}
 if(Object.hasOwn(v,'hours')){if(!Array.isArray(v.hours)||v.hours.length>28)fail(422,'VALIDATION_ERROR','Check the opening hours.');result.hours=v.hours.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(422,'VALIDATION_ERROR','Check the opening hours.');const h=raw as Record<string,unknown>;fields(h,['weekday','opens_at','closes_at','notes']);const valid=(s:unknown)=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);if(!Number.isInteger(h.weekday)||Number(h.weekday)<0||Number(h.weekday)>6||!valid(h.opens_at)||!valid(h.closes_at)||String(h.opens_at)>=String(h.closes_at))fail(422,'VALIDATION_ERROR','Hours must have a valid day and a closing time after opening.');return{weekday:h.weekday,opens_at:h.opens_at,closes_at:h.closes_at,notes:h.notes==null||h.notes===''?null:text(h.notes,1,300,'the hours note')};});}
 return result as ListingPatch;
}
function response(v:unknown,status=200){return Response.json(v,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
export const sessionHash=(id:string)=>createHash('sha256').update(id).digest('hex');
export async function verifiedOrganizationSession(request:Request,deps:OrganizationDependencies,requestId=randomUUID(),logout=false){
 const token=/^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization')??'')?.[1];if(!token)fail(401,'UNAUTHENTICATED','Sign in to continue.');await (logout?deps.limitLogout?.(request):deps.limitAuth?.(request));const principal=await deps.verify(token);if(!principal)fail(401,'SESSION_EXPIRED','Your session has expired. Sign in again.');
 const context={requestId,sessionHash:sessionHash(principal.sessionId)};try{await deps.store.command(principal.id,'session.check',{session_hash:context.sessionHash},context);}catch(error){try{await deps.store.auditSecurityFailure?.(principal.id,'session.denied',null,context);}catch{console.error(JSON.stringify({event:'security_audit_unavailable',request_id:requestId}));}throw error;}return {principal,token,context};
}
export async function handleOrganization(request:Request,path:string,deps?:OrganizationDependencies):Promise<Response>{
 const requestId=randomUUID();let authorized:{principal:OrganizationPrincipal;context:{requestId:string;sessionHash:string}}|undefined;
 const finish=(value:unknown,status=200,retryAfter?:number)=>{const r=response(value,status);r.headers.set('X-Request-Id',requestId);if(status===429)r.headers.set('Retry-After',String(retryAfter??60));return r;};
 try{
  if(request.method==='GET'&&path==='/org/status')return finish({configured:Boolean(deps?.configured),method:'email_code',email_enabled:Boolean(deps?.configured&&deps.emailConfigured!==false)});
  if(!deps?.configured)fail(503,'ACCOUNT_NOT_CONFIGURED','Organization accounts are not configured yet. You can still find support without signing in.');
  const method=request.method.toUpperCase();
  if(method==='POST'&&path==='/org/auth/email'){
   if(deps.emailConfigured===false)fail(503,'AUTH_EMAIL_NOT_CONFIGURED','Email sign-in is not enabled. Use a configured sign-in method or browse without an account.');
   const origin=request.headers.get('origin')??'';if(!deps.allowedOrigins.has(origin))fail(403,'ORIGIN_DENIED','Sign in from an approved Our Ground address.');
   await deps.limitAuth?.(request);
   const b=await body(request);fields(b,['email']);const address=email(b.email);
   const hash=(s:string)=>createHmac('sha256',deps.rateSalt).update(s).digest('hex');
   const client=process.env.VERCEL==='1'?clientNetwork(request.headers.get('x-vercel-forwarded-for')??undefined):'local';
   if(!await deps.store.consumeAccountLimit(hash('client:'+client),'client') || !await deps.store.consumeAccountLimit(hash('email:'+address),'email')) fail(429,'RATE_LIMITED','Too many sign-in requests. Please wait before trying again.');
   await deps.startEmail(address,origin);return finish({message:'If email sign-in can be delivered to this address, a verification code will arrive shortly.'},202);
  }
  const {principal,token,context}=await verifiedOrganizationSession(request,deps,requestId,method==='POST'&&path==='/org/session/logout'),actor=principal.id;authorized={principal,context};
  const command=(action:string,input:Record<string,unknown>={})=>deps.store.command(actor,action,input,context);
  if(method==='GET'&&path==='/org/account'){const data=await command('account.get') as Record<string,unknown>;return finish({...data,email:principal.email});}
  if(method==='POST'&&path==='/org/session/logout'){
   const b=await body(request);fields(b,[]);await command('session.revoke',{session_hash:sessionHash(principal.sessionId),expires_at:new Date(principal.expiresAt*1000).toISOString()});
   await deps.revokeProvider(token);return finish({signed_out:true});
  }
  if(method==='POST'&&path==='/org/claims')return finish(await command('claims.create',validateClaim(await body(request))),202);
  const listing=/^\/org\/listings\/([0-9a-f-]+)$/i.exec(path)?.[1];
  if(method==='GET'&&listing)return finish(await command('listings.get',{service_id:id(listing)}));
  const revision=/^\/org\/listings\/([0-9a-f-]+)\/revisions$/i.exec(path)?.[1];
  if(method==='POST'&&revision){const b=await body(request);fields(b,['expected_version','expected_organization_version','expected_location_version','patch']);return finish(await command('revisions.create',{service_id:id(revision),expected_version:version(b.expected_version),expected_organization_version:version(b.expected_organization_version),expected_location_version:version(b.expected_location_version),patch:validateListingPatch(b.patch)}),202);}
  if(method==='GET'&&path==='/org/listings')return finish(await command('listings.list'));
  const legacy=/^\/org\/listings\/([0-9a-f-]+)\/legacy-write$/i.exec(path)?.[1];
  if(method==='PATCH'&&legacy){await command('listings.get',{service_id:id(legacy)});fail(409,'REVIEW_REQUIRED','Submit proposed changes for administrator review.');}
  if(method==='GET'&&path==='/org/admin')return finish(await command('admin.queue'));
  const claim=/^\/org\/admin\/claims\/([0-9a-f-]+)\/decision$/i.exec(path)?.[1];
  const review=/^\/org\/admin\/revisions\/([0-9a-f-]+)\/decision$/i.exec(path)?.[1];
  if(method==='POST'&&(claim||review)){
   const b=await body(request);fields(b,claim?['decision','service_id','review_note','source_url']:['decision','review_note']);if(!['approved','rejected'].includes(String(b.decision)))fail(422,'VALIDATION_ERROR','Choose approve or reject.');
   const input:Record<string,unknown>={decision:b.decision,review_note:text(b.review_note,5,1000,'the review note')};
   if(claim){input.claim_id=id(claim);if(b.decision==='approved'){input.service_id=id(b.service_id);input.source_url=website(b.source_url);if(!input.source_url)fail(422,'VALIDATION_ERROR','Record the evidence used to approve access.');}}
   else input.revision_id=id(review);
   return finish(await command(claim?'admin.claim.decide':'admin.revision.decide',input));
  }
  if(method==='POST'&&path==='/org/admin/revoke'){const b=await body(request);fields(b,['user_id','organization_id','review_note']);return finish(await command('admin.access.revoke',{user_id:id(b.user_id),organization_id:id(b.organization_id),review_note:text(b.review_note,5,1000,'the revocation reason')}));}
  if(method==='POST'&&path==='/org/admin/suspend'){const b=await body(request);fields(b,['target_type','target_id','suspended','review_note']);if(!['user','organization'].includes(String(b.target_type))||typeof b.suspended!=='boolean')fail(422,'VALIDATION_ERROR','Choose a valid suspension target and state.');return finish(await command('admin.suspend',{target_type:b.target_type,target_id:id(b.target_id),suspended:b.suspended,review_note:text(b.review_note,5,1000,'the suspension reason')}));}
  fail(404,'NOT_FOUND','Account action not found.');
 }catch(e){
  if(authorized&&deps?.store.auditSecurityFailure&&((e instanceof OrganizationApiError||e instanceof OrganizationStoreError)&&[401,403,404].includes(e.status))){try{const target=/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.exec(path)?.[0]??null;const action=(path.startsWith('/org/admin')?'admin':path.startsWith('/org/listings')?'listing':'account')+'.denied';await deps.store.auditSecurityFailure(authorized.principal.id,action,target,authorized.context);}catch{console.error(JSON.stringify({event:'security_audit_unavailable',request_id:requestId}));}}
  if(e instanceof RequestInputError)return finish({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof PublicProtectionError)return finish({error:{code:e.code,message:e.message}},e.status,e.retryAfter);
  if(e instanceof OrganizationApiError)return finish({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof UnavailableError)return finish({error:{code:e.code,message:e.message}},503);
  if(e instanceof OrganizationStoreError)return finish({error:{code:e.code,message:e.message}},e.status,(e as {retryAfter?:number}).retryAfter);
  return finish({error:{code:'ACCOUNT_UNAVAILABLE',message:'Account information could not be loaded. Please try again.'}},503);
 }
}
