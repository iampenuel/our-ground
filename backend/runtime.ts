import {createDirectoryCityLookup} from './directory-city.ts';
import {createEdenService} from './eden-api.ts';
import {createPostgresGeographicReference} from './geographic-reference.ts';
import type {LocationSearchProvider} from './location-search.ts';
import {createLocationSearch} from './location-search.ts';
import { productionRuntime } from '../shared/auth-security.ts';
import { createPublicProtection } from './anonymous-protection.ts';
import { createOrganizationAuth, accountAllowedOrigins } from './organization-auth.ts';
import { PostgresOrganizationStore } from './organization-store.ts';
import { sessionHash } from './organization-api.ts';
import type { OrganizationDependencies } from './organization-api.ts';
import type { Dependencies } from './app.ts';
import { PostgresRepository } from './postgres.ts';
import { DemoRepository } from './demo.ts';
import { UnavailableError } from './errors.ts';
import { createGoogleDiscoveryProvider } from './google-discovery.ts';
import { createGeoapifyProvider } from './geoapify-discovery.ts';

import { parseLocationQuery, placeText, validPoint, supportedState } from '../shared/us-location.ts';
import type { LocationQuery } from '../shared/us-location.ts';

type LegacyPlaceFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    feature_type?: string;
    context?: { postcode?: {name?: string}; district?: {name?: string}; region?: { region_code?: string }; place?: { name?: string }; country?: { country_code?: string } };
  };
};
const demoPlaces = new Map([
  ['harrisburg', { label: 'Harrisburg, PA', city: 'Harrisburg', state: 'PA' as const, latitude: 40.2732, longitude: -76.8867 }],
  ['17101', { label: 'Harrisburg, PA 17101', city: 'Harrisburg', state: 'PA' as const, latitude: 40.2732, longitude: -76.8867 }],
  ['philadelphia', { label: 'Philadelphia, PA', city: 'Philadelphia', state: 'PA' as const, latitude: 39.9526, longitude: -75.1636 }],
  ['19102', { label: 'Philadelphia, PA 19102', city: 'Philadelphia', state: 'PA' as const, latitude: 39.9526, longitude: -75.1636 }]
]);
export function directoryPlace(features: LegacyPlaceFeature[], input: LocationQuery) {
  const candidates = features.filter(({properties, geometry}) => {
    const context = properties?.context;
    if (context?.country?.country_code?.toUpperCase() !== 'US' || !geometry?.coordinates) return false;
    if (!validPoint(geometry.coordinates[1], geometry.coordinates[0])) return false;
    if (input.kind === 'postcode') {
      return properties?.feature_type === 'postcode' && properties.name === input.zip;
    }
    return properties?.feature_type === 'place' && placeText(properties.name) === placeText(input.city)
      && (!input.state || context.region?.region_code === input.state)
      && (!input.county || placeText(context.district?.name) === placeText(input.county));
  });
  if (candidates.length !== 1) return null;
  const feature = candidates[0];
  const state=supportedState(feature.properties?.context?.country?.country_code,feature.properties?.context?.region?.region_code,undefined);
  if(!state)return null;
  const [longitude, latitude] = feature.geometry!.coordinates!;
  const city = feature.properties?.context?.place?.name ?? feature.properties?.name ?? '';
  return {label: city + ', '+state, city, state, latitude, longitude};
}

export async function resolvePlace(query: string, selectedProvider?:LocationSearchProvider) {
  const input = parseLocationQuery(query);
  if (!input) return null;
  const normalized = input.kind === 'postcode' ? input.zip : placeText(input.city);
  const demoPlace = input.kind === 'city' && input.county ? null : demoPlaces.get(normalized) ?? null;
  if (process.env.BACKEND_DATA_MODE === 'demo') return demoPlace;
  const provider=selectedProvider??createLocationSearch({env:process.env});
  const response=await provider.forward(query);
  const point=response.location;if(!point.state)return null;
  return{...point,city:point.publicQuery?.split(',')[0]??point.label,state:point.state};
}
export function productionDependencies(): Dependencies {
  const mode = process.env.BACKEND_DATA_MODE ?? 'postgres';
  const live=productionRuntime(process.env);
  if(live&&(mode==='demo'||process.env.ALLOW_DEMO_DATA==='true'||process.env.DEMO_EDITOR_USER_ID||process.env.ACCOUNT_LOCAL_FIXTURE==='true'))throw new Error('Local demo or fixture configuration is forbidden in production.');
  const reference=mode==='postgres'&&process.env.GEOGRAPHIC_REFERENCE_ENABLED==='true'?createPostgresGeographicReference(process.env):undefined;
  const publicProtection=createPublicProtection(process.env),locations=createLocationSearch({env:process.env,reference}),allowedOrigins=new Set(accountAllowedOrigins(process.env.ACCOUNT_ALLOWED_ORIGINS));
  if (!['postgres','demo','disabled'].includes(mode)) throw new Error('BACKEND_DATA_MODE must be postgres, demo or disabled');
  const disabled = async (): Promise<never> => { throw new UnavailableError('DIRECTORY_NOT_CONFIGURED', 'The Our Ground directory is unavailable. Real-place discovery remains available.'); };
  const disabledRepo = { search: disabled, detail: disabled, createReport: disabled, account: disabled, canEditService: disabled, editableService: disabled, listEditableServices: disabled, updateService: disabled };
  if (mode === 'disabled') return { eden:createEdenService(process.env), publicProtection, locations, allowedOrigins, repo: disabledRepo, verifyToken: async () => { throw new UnavailableError('AUTH_NOT_CONFIGURED','Account actions are not enabled. You can still search for support.'); }, resolvePlace: disabled, allowDemo: false, geoapify: createGeoapifyProvider({env:process.env}) };
  if (mode === 'demo' && process.env.ALLOW_DEMO_DATA !== 'true') throw new Error('Demo mode requires ALLOW_DEMO_DATA=true');
  const repo=mode==='demo'?new DemoRepository(process.env.DEMO_EDITOR_USER_ID):new PostgresRepository();
  const directoryCity=reference?createDirectoryCityLookup(reference,Date.now,locations):undefined;
  const eden=createEdenService(process.env,{agentRepository:repo,directoryCity});
  const auth = createOrganizationAuth(process.env), store = new PostgresOrganizationStore();
  const organizations: OrganizationDependencies = {
    configured: mode === 'postgres' && Boolean(process.env.DATABASE_URL) && auth.configured,
    emailConfigured:auth.emailConfigured, verify: auth.verify, startEmail: auth.startEmail, revokeProvider: auth.revokeProvider,
    allowedOrigins: new Set(accountAllowedOrigins(process.env.ACCOUNT_ALLOWED_ORIGINS)),
    rateSalt: process.env.DATABASE_URL ?? '', store,limitAuth:request=>publicProtection.admit('auth',request),limitLogout:request=>publicProtection.admit('logout',request)
  };
  const verified = async (token:string) => {
    if (!organizations.configured) throw new UnavailableError('AUTH_NOT_CONFIGURED','Organization accounts are not configured. You can still find support.');
    const principal = await auth.verify(token);
    if (!principal) return null;
    try { await store.command(principal.id,'session.check',{session_hash:sessionHash(principal.sessionId)}); }
    catch(error) { if((error as {status?:number}).status===401)return null; throw error; }
    return principal.id;
  };
  return { eden, directoryCity, realDirectoryConfigured:mode==='postgres'&&Boolean(process.env.DATABASE_URL), publicProtection, locations, allowedOrigins, organizations, repo, verifyToken:verified, resolvePlace:query=>resolvePlace(query,locations), allowDemo: process.env.ALLOW_DEMO_DATA === 'true', discovery: createGoogleDiscoveryProvider({ env: process.env }), geoapify: createGeoapifyProvider({ env: process.env }) };
}
