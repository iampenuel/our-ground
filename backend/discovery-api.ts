import { DiscoveryError, createGoogleDiscoveryProvider } from './google-discovery.ts';
import type { DiscoveryProvider } from './google-discovery.ts';
import { discoveryTerms } from '../shared/discovery.ts';
import type { DiscoveryCategory, DiscoveryTerm } from '../shared/discovery.ts';

const disabledProvider = createGoogleDiscoveryProvider({ env: {} });
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function handleDiscovery(request: Request, path: string, provider = disabledProvider): Promise<Response> {
  try {
    if (request.method !== 'GET') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Discovery is read-only.' } }, 405);
    const params = new URL(request.url).searchParams;
    if (path === '/discovery/status') return json(provider.status());
    if (path === '/discovery/places') {
      const term = params.get('term') ?? 'food_pantry';
      const radiusMiles = Number(params.get('radius_miles') ?? '10');
      if (!Object.hasOwn(discoveryTerms, term) || ![5,10,25].includes(radiusMiles)) throw new DiscoveryError(422, 'VALIDATION_ERROR', 'Choose a supported search term and distance.');
      return json(await provider.search({ query: (params.get('q') ?? '').trim(), term: term as DiscoveryTerm, radiusMiles, locationId: params.get('location_id') ?? undefined }, request.signal));
    }
    const id = /^\/discovery\/places\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
    const category = params.get('category');
    if (id && (category === 'food' || category === 'healthcare')) return json(await provider.detail(id, category as DiscoveryCategory, request.signal));
    return json({ error: { code: 'NOT_FOUND', message: 'Discovery route not found.' } }, 404);
  } catch (error) {
    if (error instanceof DiscoveryError) return json({ error: { code: error.code, message: error.message } }, error.status);
    return json({ error: { code: 'DISCOVERY_UNAVAILABLE', message: 'Place discovery is temporarily unavailable.' } }, 503);
  }
}
export type { DiscoveryProvider };
