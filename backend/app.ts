import {publicApiRoute} from './api-route.ts';
import { EDEN_CITIES } from '../shared/eden-assistant.ts';
import type { DirectoryCityLookup } from './directory-city.ts';
import type {createEdenService} from './eden-api.ts';
import {EDEN_NOTICE_VERSION} from '../shared/eden-assistant.ts';
import {DiscoveryLimitError} from './geoapify-limits.ts';
import {validatedSelectedLocation} from './location-validation.ts';
import {createLocationSearch,LocationSearchError} from './location-search.ts';
import type {LocationSearchProvider} from './location-search.ts';
import {handleLocationSearch} from './location-api.ts';
import { randomUUID } from 'node:crypto';
import { applySecurityHeaders } from './security-headers.ts';
import { boundedJsonObject, RequestInputError } from './request-safety.ts';
import { PublicProtectionError } from './anonymous-protection.ts';
import type { PublicProtection } from './anonymous-protection.ts';
import { handleOrganization } from './organization-api.ts';
import type { OrganizationDependencies } from './organization-api.ts';
import { parseLocationQuery, validPoint } from '../shared/us-location.ts';
import type { Place } from '../shared/contracts.ts';
import { handleDiscovery } from './discovery-api.ts';
import type { DiscoveryProvider } from './discovery-api.ts';
import { handleGeoapify } from './geoapify-api.ts';
import type { GeoProvider } from './geoapify-discovery.ts';
export type Category = 'food' | 'healthcare' | 'community';
export type Status = 'draft' | 'published' | 'hidden';
export type Account = { id: string; role: 'user' | 'admin'; organizations: Array<{ id: string; name: string; role: 'editor' }> };
export type ServicePatch = Partial<{ title: string; summary: string; eligibility_text: string | null; cost_summary: string | null; status: Status }>;
export interface Repository {
  search(input: { lat: number; lng: number; radiusMiles: number; category: Category | null; keyword?: string; page: number; pageSize: number; allowDemo: boolean; demoOnly?: boolean }): Promise<{ items: unknown[]; total: number }>;
  detail(id: string, allowDemo: boolean): Promise<unknown | null>;
  createReport(input: { serviceId: string; reasonCode: string; description: string | null; allowDemo: boolean }): Promise<string | null>;
  account(userId: string): Promise<Account>;
  canEditService(id: string, account: Account): Promise<boolean>;
  editableService(id: string, account: Account): Promise<unknown | null>;
  listEditableServices(account: Account, page: number, pageSize: number): Promise<{ items: unknown[]; total: number }>;
  updateService(id: string, account: Account, version: number, patch: ServicePatch): Promise<{ id: string; status: Status; version: number } | null>;
}
export interface Dependencies {
  eden?: ReturnType<typeof createEdenService>;
  allowedOrigins?:ReadonlySet<string>;
  publicProtection?:PublicProtection;
  locations?:LocationSearchProvider;
  organizations?: OrganizationDependencies;
  discovery?: DiscoveryProvider;
  geoapify?: GeoProvider;
  repo: Repository;
  verifyToken: (token: string) => Promise<string | null>;
  directoryCity?: DirectoryCityLookup;
  realDirectoryConfigured?:boolean;
  resolvePlace: (query: string) => Promise<Place | null>;
  allowDemo: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(['wrong_hours','closed','wrong_contact','wrong_eligibility','wrong_location','other']);
class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string,string>;
  constructor(status: number, code: string, message: string, fields?: Record<string,string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
function fail(status: number, code: string, message: string, fields?: Record<string,string>): never { throw new ApiError(status, code, message, fields); }
function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
function numeric(value: string | null, key: string, min: number, max: number, fallback?: number): number {
  if (value === null && fallback !== undefined) return fallback;
  const n = Number(value);
  if (value === null || !value.trim() || !Number.isFinite(n) || n < min || n > max) fail(422, 'VALIDATION_ERROR', 'Invalid search field.', { [key]: 'Out of range.' });
  return n;
}
const body=(request:Request)=>boundedJsonObject(request);
function allowedFields(value: Record<string,unknown>, fields: string[]): void {
  const extra = Object.keys(value).find((key) => !fields.includes(key));
  if (extra) fail(422, 'VALIDATION_ERROR', 'Unexpected field.');
}
async function account(request: Request, deps: Dependencies): Promise<Account> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const userId = await deps.verifyToken(match[1]);
  if (!userId) fail(401, 'UNAUTHENTICATED', 'Invalid or expired session.');
  return deps.repo.account(userId);
}
export async function handleApi(request: Request,deps: Dependencies):Promise<Response>{
  const requestId=randomUUID();const response=await handleApiInternal(request,deps,requestId);if(!response.headers.has('X-Request-Id'))response.headers.set('X-Request-Id',requestId);return applySecurityHeaders(response,request);
}
async function handleApiInternal(request: Request, deps: Dependencies,requestId:string): Promise<Response> {
  try {
    const url = new URL(request.url);
    if(url.href.length>4096)fail(414,'URI_TOO_LONG','The request address is too long.');
    const path='/'+publicApiRoute(url);
    // EDEN applies its own stricter, exact loopback Origin gate. It never uses
    // account credentials or the broader application account Origin allowlist.
    if(path.startsWith('/eden/')){
      if(deps.eden)return deps.eden.handle(request,path);
      const status=path==='/eden/status'&&request.method==='GET';
      return new Response(JSON.stringify(status?{mode:'disabled',engine:'local',publicGeminiEnabled:false,configured:false,eligible:false,speechAvailable:false,noticeVersion:EDEN_NOTICE_VERSION,reason:'local-fallback'}:{error:{code:'EDEN_DISABLED',message:'Gemini is unavailable. Continue with the local guide.'}}),{status:status?200:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(!['GET','HEAD','OPTIONS'].includes(request.method.toUpperCase())){
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin&&!deps.allowedOrigins?.has(origin)&&!deps.organizations?.allowedOrigins.has(origin))fail(403,'ORIGIN_DENIED','Use this action from Our Ground.');
    }
    const method = request.method.toUpperCase();
    if(path.startsWith('/locations/'))return await handleLocationSearch(request,path,deps.locations??createLocationSearch({env:{}}),deps.publicProtection);
    if (path.startsWith('/org/')) return handleOrganization(request,path,deps.organizations);
    if (path.startsWith('/discovery/')) {
      if(method==='GET'&&path.startsWith('/discovery/places'))await deps.publicProtection?.admit('resolve',request);
      return handleDiscovery(request,path,deps.discovery);
    }
    if (path.startsWith('/geoapify/')) return handleGeoapify(request, path, deps.geoapify);
    if (method === 'GET' && path === '/health') return json({ status: 'ok' });
    if (method === 'GET' && path === '/categories') return json({ items: [{ slug: 'food', name: 'Food assistance' }, { slug: 'healthcare', name: 'Healthcare' }, { slug: 'community', name: 'Community Support' }] });
    if (method === 'GET' && path === '/places/directory-city') {
      const city = EDEN_CITIES.find(c => c.id === url.searchParams.get('city'));
      if (!city) fail(422, 'VALIDATION_ERROR', 'Choose a supported directory city.');
      await deps.publicProtection?.admit('location_reference', request);
      if (!deps.directoryCity) throw new UnavailableError('DIRECTORY_CITY_UNAVAILABLE', 'The directory city reference is not configured.');
      return json({location: await deps.directoryCity(city!.id)});
    }
    if (method === 'GET' && path === '/places/resolve') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length < 2 || q.length > 80) fail(422, 'VALIDATION_ERROR', 'Enter a ZIP code or city.');
      const query = parseLocationQuery(q);
      if (!query) fail(422,'LOCATION_NOT_FOUND','Enter a city and state or ZIP code, or select an address suggestion.');
      await deps.publicProtection?.admit('resolve',request);
      const place = await deps.resolvePlace(q);
      if (!place) fail(422, 'LOCATION_NOT_FOUND', 'The directory could not identify one location. Select a suggestion, or enter a city and state or an exact ZIP code.');
      return json({ query: q, place, choices: [] });
    }
    if (method === 'GET' && path === '/resources') {
      const lat = numeric(url.searchParams.get('lat'), 'lat', -90, 90);
      const lng = numeric(url.searchParams.get('lng'), 'lng', -180, 180);

      const radiusMiles = numeric(url.searchParams.get('radius_miles'), 'radius_miles', 1, 50, 25);
      const page = numeric(url.searchParams.get('page'), 'page', 1, 100, 1);
      const pageSize = numeric(url.searchParams.get('page_size'), 'page_size', 1, 50, 20);
      if (!Number.isInteger(page) || !Number.isInteger(pageSize)) fail(422, 'VALIDATION_ERROR', 'Page values must be integers.');
      const rawCategory = url.searchParams.get('category');
      const keyword = (url.searchParams.get('q') ?? '').trim();
      if (keyword.length > 100) fail(422, 'VALIDATION_ERROR', 'Search text is too long.');
      if (rawCategory !== null && rawCategory !== 'food' && rawCategory !== 'healthcare' && rawCategory !== 'community') fail(422, 'VALIDATION_ERROR', 'Unknown category.');
      const kind = url.searchParams.get('data_kind');
      if (kind !== null && kind !== 'sourced_unverified' && kind !== 'fictional_demo' && kind !== 'real') fail(422, 'VALIDATION_ERROR', 'Unknown record source.');
      await deps.publicProtection?.admit('read',request);
      if(deps.realDirectoryConfigured===false && (kind==='real'||kind==='sourced_unverified'))throw new UnavailableError('DIRECTORY_NOT_CONFIGURED','The real directory is not connected.');
      const result = await deps.repo.search({ lat, lng, radiusMiles, category: rawCategory as Category | null, keyword, page, pageSize, allowDemo: deps.allowDemo && kind !== 'sourced_unverified' && kind !== 'real', demoOnly: kind === 'fictional_demo' });
      return json({ search_center: { latitude: lat, longitude: lng }, items: result.items, page, page_size: pageSize, total: result.total, has_next: page * pageSize < result.total });
    }
    if(method==='POST'&&path==='/resources/search'){
      const input=await body(request);allowedFields(input,['location','category','radius_miles','page','page_size','q','data_kind']);
      const location=validatedSelectedLocation(input.location);
      const number=(value:unknown,key:string,min:number,max:number,fallback:number)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(422,'VALIDATION_ERROR','Invalid search field.');return value;};
      const radiusMiles=number(input.radius_miles,'radius_miles',1,50,25),page=number(input.page,'page',1,100,1),pageSize=number(input.page_size,'page_size',1,50,20);
      if(!Number.isInteger(page)||!Number.isInteger(pageSize))fail(422,'VALIDATION_ERROR','Page values must be integers.');
      if(input.category!==undefined&&input.category!==null&&input.category!=='all'&&input.category!=='food'&&input.category!=='healthcare'&&input.category!=='community')fail(422,'VALIDATION_ERROR','Unknown category.');
      if(input.q!==undefined&&(typeof input.q!=='string'||input.q.length>100))fail(422,'VALIDATION_ERROR','Search text is too long.');
      if(input.data_kind!==undefined&&!['real','sourced_unverified','fictional_demo'].includes(String(input.data_kind)))fail(422,'VALIDATION_ERROR','Unknown record source.');
      await deps.publicProtection?.admit('read',request);
      if(deps.realDirectoryConfigured===false && input.data_kind!=='fictional_demo')throw new UnavailableError('DIRECTORY_NOT_CONFIGURED','The real directory is not connected.');
      const result=await deps.repo.search({lat:location.latitude as number,lng:location.longitude as number,radiusMiles,category:input.category==='all'||!input.category?null:input.category as Category,keyword:typeof input.q==='string'?input.q.trim():'',page,pageSize,allowDemo:deps.allowDemo&&input.data_kind==='fictional_demo',demoOnly:input.data_kind==='fictional_demo'});
      return json({search_center:{latitude:location.latitude,longitude:location.longitude},items:result.items,page,page_size:pageSize,total:result.total,has_next:page*pageSize<result.total});
    }
    const resourceId = /^\/resources\/([0-9a-f-]+)$/i.exec(path)?.[1];
    if (method === 'GET' && resourceId) {
      if (!uuid.test(resourceId)) fail(404, 'NOT_FOUND', 'Resource not found.');
      await deps.publicProtection?.admit('read',request);
      const found = await deps.repo.detail(resourceId, deps.allowDemo);
      if (!found) fail(404, 'NOT_FOUND', 'Resource not found.');
      return json(found);
    }
    if (method === 'POST' && path === '/correction-reports') {
      const input = await body(request);
      allowedFields(input, ['service_id','reason_code','description']);
      if (typeof input.service_id !== 'string' || !uuid.test(input.service_id) || typeof input.reason_code !== 'string' || !reasons.has(input.reason_code)) fail(422, 'VALIDATION_ERROR', 'Invalid report target or reason.');
      if (input.description != null && (typeof input.description !== 'string' || input.description.length > 1000)) fail(422, 'VALIDATION_ERROR', 'Description is too long.');
      await deps.publicProtection?.admit('report',request);
      const id = await deps.repo.createReport({ serviceId: input.service_id, reasonCode: input.reason_code, description: (input.description as string | null) ?? null, allowDemo: deps.allowDemo });
      if (!id) fail(404, 'NOT_FOUND', 'Resource not found.');
      return json({ id, status: 'open', message: 'Thank you. The report was received.' }, 202);
    }
    if (method === 'GET' && path === '/me') return deps.organizations?.configured?handleOrganization(request,'/org/account',deps.organizations):json(await account(request, deps));
    if (method === 'GET' && path === '/services') {
      if(deps.organizations?.configured) return handleOrganization(request,'/org/listings',deps.organizations);
      const user = await account(request, deps);
      const page = numeric(url.searchParams.get('page'), 'page', 1, 100, 1);
      const pageSize = numeric(url.searchParams.get('page_size'), 'page_size', 1, 50, 20);
      if (!Number.isInteger(page) || !Number.isInteger(pageSize)) fail(422, 'VALIDATION_ERROR', 'Page values must be integers.');
      const result = await deps.repo.listEditableServices(user, page, pageSize);
      return json({ items: result.items, total: result.total, page, page_size: pageSize, has_next: page * pageSize < result.total });
    }
    const serviceId = /^\/services\/([0-9a-f-]+)$/i.exec(path)?.[1];
    if (method === 'GET' && serviceId) {
      if (!uuid.test(serviceId)) fail(404, 'NOT_FOUND', 'Service not found.');
      if(deps.organizations?.configured) return handleOrganization(request,'/org/listings/'+serviceId,deps.organizations);
      const user = await account(request, deps);
      if (!await deps.repo.canEditService(serviceId, user)) fail(404, 'NOT_FOUND', 'Service not found.');
      const service = await deps.repo.editableService(serviceId, user);
      if (!service) fail(404, 'NOT_FOUND', 'Service not found.');
      return json(service);
    }
    if (method === 'PATCH' && serviceId) {
      if (!uuid.test(serviceId)) fail(404, 'NOT_FOUND', 'Service not found.');
      if(deps.organizations?.configured)return handleOrganization(request,'/org/listings/'+serviceId+'/legacy-write',deps.organizations);
      const user = await account(request, deps);
      if (!await deps.repo.canEditService(serviceId, user)) fail(404, 'NOT_FOUND', 'Service not found.');
      fail(409, 'REVIEW_REQUIRED', 'Submit proposed changes from your organization workspace for administrator review.');
    }
    fail(404, 'NOT_FOUND', 'Endpoint not found.');
  } catch (error) {
    if(error instanceof DiscoveryLimitError){const res=json({error:{code:error.code,message:error.message}},error.status);if(error.status===429)res.headers.set('Retry-After',String(error.retryAfter));return res;}
    if(error instanceof LocationSearchError){const res=json({error:{code:error.code,message:error.message}},error.status);if(error.status===429)res.headers.set('Retry-After','60');return res;}
    if(error instanceof RequestInputError)return json({error:{code:error.code,message:error.message}},error.status);
    if(error instanceof PublicProtectionError){const res=json({error:{code:error.code,message:error.message}},error.status);if(error.status===429)res.headers.set('Retry-After',String(error.retryAfter));return res;}
    if (error instanceof UnavailableError) return json({ error: { code: error.code, message: error.message } }, 503);
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, error.status);
    console.error(JSON.stringify({event:'api_unexpected_failure',request_id:requestId}));
    return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }, 500);
  }
}
import { UnavailableError } from './errors.ts';
