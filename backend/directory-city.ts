import { EDEN_CITIES } from '../shared/eden-assistant.ts';
import type { EdenCityId } from '../shared/eden-assistant.ts';
import { parseLocationQuery } from '../shared/us-location.ts';
import type { SelectedLocation } from '../shared/location-search.ts';
import type { GeographicReference } from './geographic-reference.ts';
import { referenceLocation } from './location-search.ts';
import { UnavailableError } from './errors.ts';

export type DirectoryCityLookup = (city: EdenCityId) => Promise<SelectedLocation>;
/** Only finite public city identities can enter this cache. Never cache a user's
 * query, address, provider result, resource records or a negative answer. */
export function createDirectoryCityLookup(reference: GeographicReference, now = Date.now): DirectoryCityLookup {
  const cache = new Map<EdenCityId, {point: SelectedLocation; until: number}>();
  const pending = new Map<EdenCityId, Promise<SelectedLocation>>();
  const unavailable = () => new UnavailableError('DIRECTORY_CITY_UNAVAILABLE', 'The directory could not confirm this city. Use the location field to choose a search area.');
  return async city => {
    const definition = EDEN_CITIES.find(item => item.id === city);
    const query = definition && parseLocationQuery(definition.query);
    if (!query || query.kind !== 'city' || !query.state) throw unavailable();
    const cached = cache.get(city);
    if (cached && cached.until > now()) return structuredClone(cached.point);
    let lookup = pending.get(city);
    if (!lookup) {
      lookup = (async () => {
        const rows = await reference.findCandidates(query.city, query.state, 5);
        const exact = rows.filter(r => r.kind === 'place' && r.state === query.state && r.match.exact_match);
        const match = exact.length===1 ? exact[0] : undefined;
        const point = match?.match.ambiguous_matches===1 && match.coordinate_precision==='representative' &&
          match.source.provider==='census' && match.source.id==='census-gazetteer-2026' && match.source.vintage===2026 &&
          referenceLocation(match, 'canonical_exact');
        if (!point) throw unavailable();
        // Preserve the finite public city label even when the census display name has a legal suffix.
        point.label = definition!.query; point.publicQuery = definition!.query;
        cache.set(city, { point, until: now() + 120_000 });
        return point;
      })().catch(() => { throw unavailable(); }).finally(() => pending.delete(city));
      pending.set(city, lookup);
    }
    return structuredClone(await lookup);
  };
}
