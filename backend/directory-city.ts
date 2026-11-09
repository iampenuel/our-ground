import { EDEN_CITIES, normalizeEdenCityId, edenCityQuery } from '../shared/eden-assistant.ts';
import type { EdenCityId } from '../shared/eden-assistant.ts';
import { parseLocationQuery } from '../shared/us-location.ts';
import type { SelectedLocation, LocationResolveResponse } from '../shared/location-search.ts';
import {locationSearchScope} from '../shared/location-search.ts';
import type { GeographicReference, GeographicCandidate } from './geographic-reference.ts';
import { referenceLocation, LocationSearchError } from './location-search.ts';
import type {LocationSearchProvider} from './location-search.ts';
import { UnavailableError } from './errors.ts';
import {randomUUID} from 'node:crypto';

export type DirectoryCityLookup = (city: EdenCityId) => Promise<SelectedLocation>;
export class DirectoryLocationError extends LocationSearchError {
  resolution:LocationResolveResponse;
  constructor(resolution:LocationResolveResponse){
    const ambiguous=resolution.status==='choose_location'||resolution.status==='narrow_location';
    super(422,ambiguous?'DIRECTORY_LOCATION_AMBIGUOUS':'DIRECTORY_LOCATION_UNRESOLVED',ambiguous?'Which U.S. city and state or ZIP code should I search?':'I could not resolve that location. Check the place name or try a city and state or ZIP code.');
    this.resolution=resolution;
  }
}
/** Cache only bounded, validated public locality/ZIP requests. This is separate
 * from provider admission and never stores street addresses or device positions. */
export function createDirectoryCityLookup(reference: GeographicReference, now = Date.now, locations?:Pick<LocationSearchProvider,'resolve'>): DirectoryCityLookup {
  const cache = new Map<EdenCityId, {point: SelectedLocation; until: number}>();
  const pending = new Map<EdenCityId, Promise<SelectedLocation>>();
  const unavailable = () => new UnavailableError('DIRECTORY_CITY_UNAVAILABLE', 'The location could not be confirmed. Use the location field to choose a search area.');
  return async value => {
    const city=normalizeEdenCityId(value);
    if(!city)throw unavailable();
    const definition = EDEN_CITIES.find(item => item.id === city);
    const query = definition && parseLocationQuery(definition.query);
    const cached = cache.get(city);
    if (cached && cached.until > now()) return structuredClone(cached.point);
    let lookup = pending.get(city);
    if (!lookup) {
      if(pending.size>=32)throw unavailable();
      lookup = (async () => {
        let point:SelectedLocation|undefined;
        if(!locations&&query?.kind==='city'&&query.state){
          let rows:GeographicCandidate[];
          try{rows=await reference.findCandidates(query.city,query.state,5);}
          catch{if(!locations)throw unavailable();rows=[];}
          const exact=rows.filter(r=>r.kind==='place'&&r.state===query.state&&r.match.exact_match);
          const match=exact.length===1?exact[0]:undefined;
          const resolved=match?.match.ambiguous_matches===1&&match.coordinate_precision==='representative'&&
            match.source.provider==='census'&&match.source.id==='census-gazetteer-2026'&&match.source.vintage===2026&&referenceLocation(match,'canonical_exact');
          if(resolved){point=resolved;point.label=definition!.query;point.publicQuery=definition!.query;}
        }
        if(!point&&locations){
          const resolution=await locations.resolve(edenCityQuery(city),randomUUID());
          if(resolution.status!=='resolved')throw new DirectoryLocationError(resolution);
          if(resolution.location.country!=='US'||!['city','point'].includes(locationSearchScope(resolution.location)))throw unavailable();
          point=resolution.location;
        }
        if(!point){if(!definition)throw new DirectoryLocationError({status:'not_found',choices:[],attribution:'U.S. Census Bureau',notice:'No location matched this request.'});throw unavailable();}
        if(cache.size>=64&&!cache.has(city))cache.delete(cache.keys().next().value!);
        cache.set(city,{point,until:now()+120_000});
        return point;
      })().finally(() => pending.delete(city));
      pending.set(city, lookup);
    }
    return structuredClone(await lookup);
  };
}
