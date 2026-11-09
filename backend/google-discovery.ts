import { discoveryTerms } from '../shared/discovery.ts';
import { parseLocationQuery, placeText, supportedState, validPoint } from '../shared/us-location.ts';
import type { LocationQuery } from '../shared/us-location.ts';
import type { DiscoveryCategory, DiscoveryDetail, DiscoveryInput, DiscoveryLocation, DiscoverySearch, DiscoveryStatus, DiscoveredPlace, ProviderAttribution } from '../shared/discovery.ts';

export class DiscoveryError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export interface DiscoveryProvider {
  status(): DiscoveryStatus;
  search(input: DiscoveryInput, signal?: AbortSignal): Promise<DiscoverySearch>;
  detail(id: string, category: DiscoveryCategory, signal?: AbortSignal): Promise<DiscoveryDetail>;
}
const unavailable = () => new DiscoveryError(503, 'DISCOVERY_NOT_CONFIGURED', 'Google place discovery is not available yet. You can still use the resource directory.');
const invalidLocation = () => new DiscoveryError(422, 'LOCATION_NOT_FOUND', 'Enter a city and state or five-digit ZIP in the 50 U.S. states or Washington, DC. Add a county for an ambiguous city. Territories and overseas military addresses are not supported by this legacy search.');
const notFound = () => new DiscoveryError(404, 'PLACE_NOT_ELIGIBLE', 'This place no longer meets this search’s location and category checks. Search again or check directly with the provider.');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown, max = 500): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function validPlaceId(value: string): boolean { return /^[A-Za-z0-9_-]{5,256}$/.test(value) && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value); }
export function validLocationQuery(value: string): boolean {
  return parseLocationQuery(value) !== null;
}
export function safePublicUrl(value: unknown): string | null {
  try {
    const url = new URL(str(value, 2048));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/\.[a-z]{2,}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function componentList(components: unknown, type: string) {
  return array(components).map(object).filter(component => array(component.types).includes(type));
}
function stateEvidence(components: unknown, legacy = false) {
  const short = legacy ? 'short_name' : 'shortText', long = legacy ? 'long_name' : 'longText';
  const countries = componentList(components, 'country'), states = componentList(components, 'administrative_area_level_1');
  if (!countries.length || !states.length) return undefined;
  const evidence = countries.flatMap(country => states.map(state => supportedState(country[short], state[short], state[long], country[long])));
  return evidence.every(state => state && state === evidence[0]) ? evidence[0] : undefined;
}
function matchesInput(components: unknown, query: LocationQuery, state: NonNullable<ReturnType<typeof stateEvidence>>) {
  const matches = (type: string, expected: string) => {
    const found = componentList(components, type);
    return found.length > 0 && found.every(component => [component.short_name, component.long_name].some(value => placeText(value) === placeText(expected)));
  };
  if (query.kind === 'postcode') return matches('postal_code', query.zip);
  if (query.state && state !== query.state) return false;
  const cityType = ['locality', 'postal_town', 'administrative_area_level_3'].find(type => componentList(components, type).length);
  if (!cityType || !matches(cityType, query.city)) return false;
  return !query.county || matches('administrative_area_level_2', query.county);
}
function nearbyRectangle(location: DiscoveryLocation, miles: number) {
  const latDelta = miles / 69;
  const lngDelta = Math.min(180, latDelta / Math.max(0.00000001, Math.abs(Math.cos(location.latitude * Math.PI / 180))));
  const wrap = (longitude: number) => ((longitude + 540) % 360) - 180;
  return {
    low: { latitude: Math.max(-90, location.latitude - latDelta), longitude: lngDelta === 180 ? -180 : wrap(location.longitude - lngDelta) },
    high: { latitude: Math.min(90, location.latitude + latDelta), longitude: lngDelta === 180 ? 180 : wrap(location.longitude + lngDelta) }
  };
}
function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (v: number) => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude-a.latitude)/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 3958.76 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function relevant(place: Record<string, unknown>, category: DiscoveryCategory): boolean {
  const name = str(object(place.displayName).text).toLowerCase();
  const primary = str(place.primaryType);
  const types = array(place.types);
  if (category === 'food') {
    // Food assistance has no dependable dedicated Places type. Be conservative:
    // a broad nonprofit/store type or the submitted query is not evidence.
    if (['grocery_store','supermarket','convenience_store','restaurant','meal_takeaway','wholesaler','department_store'].includes(primary)) return false;
    return /\bfood\s+(?:pantr(?:y|ies)|banks?|assistance|cupboard|distribution)\b|\bsoup\s+kitchen\b/.test(name);
  }
  if (['dentist','dental_clinic','veterinary_care','pharmacy','drugstore','spa','beauty_salon','store'].includes(primary)) return false;
  return types.includes('medical_clinic') || types.includes('medical_center') || /\b(?:community\s+health\s+cent(?:er|re)|medical\s+clinic|free\s+clinic)\b/.test(name);
}
function attributions(value: unknown): ProviderAttribution[] {
  return array(value).map(object).map(a => ({ name: str(a.provider, 200), url: safePublicUrl(a.providerUri) })).filter(a => a.name);
}
function normalize(value: unknown, category: DiscoveryCategory, center?: DiscoveryLocation, radius?: number): DiscoveredPlace | null {
  const p = object(value), loc = object(p.location);
  const id = str(p.id, 257), name = str(object(p.displayName).text, 200), address = str(p.formattedAddress);
  if (!validPlaceId(id) || !name || !address || !stateEvidence(p.addressComponents) || !validPoint(loc.latitude, loc.longitude) || !relevant(p, category)) return null;
  // Do not infer availability from OPERATIONAL; omit known closed/moved records.
  if (p.businessStatus !== 'OPERATIONAL' || p.movedPlaceId) return null;
  const point = { latitude: Number(loc.latitude), longitude: Number(loc.longitude) };
  const miles = center ? distance(center, point) : null;
  if (miles !== null && radius !== undefined && miles > radius) return null;
  const mapsUrl = safePublicUrl(p.googleMapsUri);
  const approvedMapsUrl = mapsUrl && /(^|\.)google\.com$/.test(new URL(mapsUrl).hostname) ? mapsUrl : null;
  const directions = new URL('https://www.google.com/maps/dir/');
  directions.search = new URLSearchParams({ api: '1', destination: name + ', ' + address, destination_place_id: id }).toString();
  return { place_id: id, data_kind: 'google_discovered', name, address, ...point, category, distance_miles: miles === null ? null : Math.round(miles * 10)/10, maps_url: approvedMapsUrl, directions_url: directions.href, attributions: attributions(p.attributions) };
}

// Pro search fields; contact fields only on an explicit detail request (Enterprise).
export const SEARCH_FIELDS = ['id','displayName','formattedAddress','addressComponents','location','primaryType','types','businessStatus','googleMapsUri','attributions'].map(f => 'places.'+f).join(',');
export const DETAIL_FIELDS = SEARCH_FIELDS.replaceAll('places.', '') + ',websiteUri,nationalPhoneNumber,movedPlaceId';

export function createGoogleDiscoveryProvider(options: {
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): DiscoveryProvider {
  const { env } = options;
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  const terms = safePublicUrl(env.GOOGLE_DISCOVERY_TERMS_URL), privacy = safePublicUrl(env.GOOGLE_DISCOVERY_PRIVACY_URL);
  const enabled = env.GOOGLE_DISCOVERY_ENABLED === 'true' && env.GOOGLE_DISCOVERY_LIVE_APPROVED === 'true' && Boolean(env.GOOGLE_DISCOVERY_PROJECT_ID && env.GOOGLE_GEOCODING_API_KEY && env.GOOGLE_PLACES_API_KEY && terms && privacy);
  // Defense in depth per warm process, NOT a global serverless spending cap.
  let minute = 0, day = 0, minuteCount = 0, dayCount = 0, active = 0;
  async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!enabled) throw unavailable();
    const m = Math.floor(now()/60000), d = Math.floor(now()/86400000);
    if (m !== minute) { minute = m; minuteCount = 0; }
    if (d !== day) { day = d; dayCount = 0; }
    if (active >= 2 || minuteCount >= 6 || dayCount >= 60) throw new DiscoveryError(429, 'DISCOVERY_LIMIT', 'Discovery has reached its request limit. Please try again later or use the directory.');
    minuteCount++; dayCount++; active++;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 6500);
    try {
      const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (response.status === 429) throw new DiscoveryError(429, 'PROVIDER_QUOTA', 'Google discovery has reached its usage limit. Please try again later.');
      if (response.status === 401 || response.status === 403) throw new DiscoveryError(503, 'PROVIDER_PERMISSION', 'Google discovery is temporarily unavailable. The directory is still available.');
      if (response.status === 404) throw notFound();
      if (!response.ok) throw new DiscoveryError(503, 'PROVIDER_UNAVAILABLE', 'Google discovery could not complete this request. Please try again later.');
      return object(await response.json());
    } catch (error) {
      if (error instanceof DiscoveryError) throw error;
      if (timeout.aborted || signal?.aborted) throw new DiscoveryError(504, 'PROVIDER_TIMEOUT', 'Google discovery took too long. Please try again.');
      throw new DiscoveryError(503, 'PROVIDER_UNAVAILABLE', 'Google discovery could not complete this request. Please try again later.');
    } finally { active--; }
  }
  async function resolve(query: string, signal?: AbortSignal): Promise<DiscoveryLocation[]> {
    const parsed = parseLocationQuery(query);
    if (!parsed) throw invalidLocation();
    const params = new URLSearchParams({ address: query, components: 'country:US', language: 'en', key: env.GOOGLE_GEOCODING_API_KEY ?? '' });
    const data = await request('https://maps.googleapis.com/maps/api/geocode/json?' + params, {}, signal);
    if (data.status === 'ZERO_RESULTS') return [];
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') throw new DiscoveryError(429, 'PROVIDER_QUOTA', 'Google location search has reached its usage limit. Please try again later.');
    if (data.status === 'REQUEST_DENIED') throw new DiscoveryError(503, 'PROVIDER_PERMISSION', 'Google location search is temporarily unavailable. The directory is still available.');
    if (data.status !== 'OK') throw new DiscoveryError(503, 'PROVIDER_UNAVAILABLE', 'Google location search could not complete this request.');
    const choices: DiscoveryLocation[] = [];
    for (const raw of array(data.results)) {
      const r = object(raw), location = object(object(r.geometry).location), id = str(r.place_id, 257), label = str(r.formatted_address, 240);
      const state = stateEvidence(r.address_components, true);
      if (r.partial_match || !validPlaceId(id) || !label || !state || !validPoint(location.lat, location.lng)) continue;
      if (!array(r.types).some(t => ['locality','postal_code','administrative_area_level_3'].includes(String(t)))) continue;
      if (!matchesInput(r.address_components, parsed, state)) continue;
      const county = componentList(r.address_components, 'administrative_area_level_2').map(component => str(component.long_name || component.short_name, 100)).find(Boolean);
      const choiceLabel = county && !placeText(label).includes(placeText(county)) ? `${label} · ${county}` : label;
      if (!choices.some(c => c.place_id === id)) choices.push({ place_id: id, label: choiceLabel, latitude: Number(location.lat), longitude: Number(location.lng), state });
    }
    return choices.slice(0, 5);
  }
  return {
    status: () => ({ enabled, terms_url: terms, privacy_url: privacy }),
    async search(input, signal) {
      if (!enabled) throw unavailable();
      if (!Object.hasOwn(discoveryTerms, input.term) || ![5,10,25].includes(input.radiusMiles) || (input.locationId !== undefined && !validPlaceId(input.locationId))) throw new DiscoveryError(422, 'VALIDATION_ERROR', 'Choose a supported search term and distance.');
      const choices = await resolve(input.query, signal);
      if (!choices.length) throw invalidLocation();
      const location = input.locationId ? choices.find(c => c.place_id === input.locationId) : choices.length === 1 ? choices[0] : undefined;
      if (!location) {
        if (input.locationId) throw invalidLocation();
        return { status: 'choose_location', choices };
      }
      const term = discoveryTerms[input.term];
      const data = await request('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!, 'X-Goog-FieldMask': SEARCH_FIELDS },
        body: JSON.stringify({ textQuery: term.label, languageCode: 'en', regionCode: 'US', pageSize: 10,
          locationRestriction: { rectangle: nearbyRectangle(location, input.radiusMiles) } })
      }, signal);
      if (data.places !== undefined && !Array.isArray(data.places)) throw new DiscoveryError(503, 'PROVIDER_UNAVAILABLE', 'Google returned an unreadable result. Please try again later.');
      const items: DiscoveredPlace[] = [];
      for (const raw of array(data.places).slice(0, 10)) {
        const p = normalize(raw, term.category, location, input.radiusMiles);
        if (p && !items.some(item => item.place_id === p.place_id)) items.push(p);
      }
      return { status: 'results', location, term: input.term, radius_miles: input.radiusMiles, items };
    },
    async detail(id, category, signal) {
      if (!enabled) throw unavailable();
      if (!validPlaceId(id) || !['food','healthcare'].includes(category)) throw notFound();
      const raw = await request('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?languageCode=en', { headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!, 'X-Goog-FieldMask': DETAIL_FIELDS } }, signal);
      const place = normalize(raw, category);
      if (!place || place.place_id !== id) throw notFound();
      const phone = str(raw.nationalPhoneNumber, 40);
      return { ...place, website_url: safePublicUrl(raw.websiteUri), phone: /^[+()\d .-]{7,40}$/.test(phone) ? phone : null };
    }
  };
}
