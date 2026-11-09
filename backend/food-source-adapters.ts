import {FOOD_SOURCES,downloadFoodSnapshot,normalizeFoodSnapshot} from './food-import.mjs';
import type { ServiceCategory } from '../shared/contracts.ts';

/** A source manifest is not a data-use license, nor a working provider client. */
export type FoodSourceManifest = Readonly<{
  id: 'feeding-america' | '211-ndp' | 'findhelp' | 'usda-snap-retailers' | 'regional-hsds' | 'philly-food-sites' | 'seattle-food-resources' | 'foodfinder' | 'openstreetmap-odbl' | 'pgc-food-assistance';
  name: string;
  status: 'requires_permission' | 'unsuitable' | 'planned' | 'available' | 'license_review';
  documentation_url: string;
  terms_url: string | null;
  permitted_use: string;
  license_evidence: string | null;
  categories: readonly ServiceCategory[];
  unavailable_reason: string;
  checked_at: string;
}>;

/** Future authorized adapters must preserve missing/suppressed values and stable
 * source identity. They must map to reviewed import tooling, never direct public
 * publication. These types do not promise HSDS conformance or authorize a feed.
 */
export interface FoodSourceRecord {
  source_record_id: string;
  source_url: string;
  source_updated_at: string | null;
  organization: { source_id: string; name: string };
  service: { name: string; description: string | null; categories: ServiceCategory[]; eligibility: string | null };
  location: { address: string | null; city: string | null; state: string | null; postal_code: string | null; latitude: number | null; longitude: number | null; address_suppressed: boolean } | null;
  contact: { phone: string | null; website_url: string | null };
  publication_status: 'unpublished';
  review_status: 'needs_review';
}
export interface AuthorizedFoodSourceAdapter {
  readonly manifest: FoodSourceManifest;
  readonly permission: { evidence_url: string; permitted_uses: readonly ('retrieve' | 'store' | 'redisplay')[]; reviewed_at: string; reviewed_by: string; expires_at: string | null };
  read(signal: AbortSignal): AsyncIterable<readonly FoodSourceRecord[]>;
}

export const foodSourceManifests: readonly FoodSourceManifest[] = Object.freeze(([
  ...Object.values(FOOD_SOURCES).map(source => ({
    id:source.id as 'philly-food-sites'|'seattle-food-resources'|'pgc-food-assistance',name:source.name,status:'available' as const,
    documentation_url:source.url,terms_url:source.authority,license_evidence:source.authority,
    permitted_use:'Reviewed government dataset: bounded retrieval, storage and redisplay with source credit, license evidence, dates and unverified status. Owner-run local import only.',categories:['food'] as ServiceCategory[],
    unavailable_reason:'',checked_at:'2026-11-06'
  })),
  {
    id:'foodfinder',name:'FoodFinder',status:'requires_permission',documentation_url:'https://foodfinder.us/',terms_url:'https://foodfinder.us/',license_evidence:null,categories:['food'],
    permitted_use:'Public locator referral only. No written feed/API retrieval, persistence or redisplay permission is established; no scraping.',
    unavailable_reason:'Written source permission and an authorized delivery interface have not been supplied.',checked_at:'2026-11-06'
  },
  {
    id:'openstreetmap-odbl',name:'OpenStreetMap food assistance extract',status:'license_review',documentation_url:'https://wiki.openstreetmap.org/wiki/Tag:social_facility%3Dfood_bank',terms_url:'https://www.openstreetmap.org/copyright',license_evidence:'https://opendatacommons.org/licenses/odbl/1-0/',categories:['food'],
    permitted_use:'Bounded owner-supplied exact-tag parser only: social_facility=food_bank/soup_kitchen with amenity=social_facility, or amenity=food_sharing. Output remains unpublished in a separate osm_odbl partition pending attribution, derivative-database and share-alike review. No Overpass requests or mixed database publication.',
    unavailable_reason:'Combined database/publication obligations have not been resolved. The isolated parser does not register a publication adapter.',checked_at:'2026-11-06'
  },
  {
    id: 'feeding-america', name: 'Feeding America network directory', status: 'requires_permission',
    documentation_url: 'https://www.feedingamerica.org/find-your-local-foodbank', terms_url: 'https://www.feedingamerica.org/privacy-policy',
    permitted_use: 'Public locator referral only in this implementation; no directory copying or import permission established.', license_evidence: null, categories: ['food'],
    unavailable_reason: 'A licensed feed, data-use scope and owner-approved access have not been supplied.', checked_at: '2026-11-05'
  },
  {
    id: '211-ndp', name: '211 National Data Platform', status: 'requires_permission',
    documentation_url: 'https://apiportal.211.org/', terms_url: 'https://register.211.org/Home/FAQs',
    permitted_use: 'API access and data sharing depend on the authorized product, contributors and geography; public documentation is not a reuse grant.', license_evidence: null, categories: ['food', 'healthcare'],
    unavailable_reason: 'No approved Search/Export product, contributor agreement or credentials are configured.', checked_at: '2026-11-05'
  },
  {
    id: 'findhelp', name: 'Findhelp', status: 'requires_permission',
    documentation_url: 'https://company.findhelp.com/products/customer-integrations/', terms_url: 'https://company.findhelp.com/cbo-terms/',
    permitted_use: 'Contract-specific APIs; reviewed public terms restrict persistence and caching. No permission to import its directory is established.', license_evidence: null, categories: ['food', 'healthcare'],
    unavailable_reason: 'No negotiated scope, approved integration or credentials are supplied. A durable importer must not be enabled from a token alone.', checked_at: '2026-11-05'
  },
  {
    id: 'usda-snap-retailers', name: 'USDA SNAP authorized retailers', status: 'unsuitable',
    documentation_url: 'https://www.fns.usda.gov/snap/retailer-locator', terms_url: null,
    permitted_use: 'Public retailer information may support a separate benefits-shopping use case after source review; it does not establish free food assistance.', license_evidence: null, categories: [],
    unavailable_reason: 'Retail stores accepting SNAP are not food pantries or free meal programs. Importing them as food assistance would misrepresent coverage.', checked_at: '2026-11-05'
  },
  {
    id: 'regional-hsds', name: 'Authorized regional HSDS feed', status: 'planned',
    documentation_url: 'https://openreferral.readthedocs.io/en/latest/', terms_url: null,
    permitted_use: 'HSDS describes data structure, not a license for a particular dataset. Select an owned or explicitly licensed regional feed first.', license_evidence: null, categories: ['food', 'healthcare'],
    unavailable_reason: 'No regional feed, permitted-use evidence or adapter implementation has been supplied.', checked_at: '2026-11-05'
  }
] satisfies FoodSourceManifest[]).map(manifest => Object.freeze({...manifest, categories: Object.freeze(manifest.categories)})));

/** Only the explicitly reviewed government sources are registered. Reading
 * remains unpublished; publication requires the separate guarded owner CLI. */
const authorizedFoodAdapters:ReadonlyMap<string,AuthorizedFoodSourceAdapter>=new Map(Object.values(FOOD_SOURCES).map(source=>[source.id,{
 manifest:foodSourceManifests.find(manifest=>manifest.id===source.id)!,
 permission:{evidence_url:source.authority,permitted_uses:['retrieve','store','redisplay'] as const,reviewed_at:'2026-11-06',reviewed_by:'Our Ground government source review',expires_at:null},
 async *read(signal:AbortSignal){
  const data=normalizeFoodSnapshot(source.id,await downloadFoodSnapshot(source.id,{signal}));
  for(let offset=0;offset<data.records.length;offset+=100){if(signal.aborted)throw signal.reason;
   yield data.records.slice(offset,offset+100).map(row=>({source_record_id:row.record_id,source_url:source.url,source_updated_at:row.source_updated_at,
    organization:{source_id:row.organization_id,name:row.organization_name},service:{name:row.name,description:row.description,categories:['food'] as ServiceCategory[],eligibility:row.eligibility_text},
    location:{address:row.street,city:row.city,state:row.state,postal_code:row.postal_code,latitude:row.latitude,longitude:row.longitude,address_suppressed:false},contact:{phone:row.phone,website_url:row.website},publication_status:'unpublished' as const,review_status:'needs_review' as const}));
  }
 }
}]));

export function foodSourceAvailability(id: string): {available: false; reason: string} | {available: true; adapter: AuthorizedFoodSourceAdapter} {
  const adapter = authorizedFoodAdapters.get(id);
  if (adapter) return {available: true, adapter};
  return {available: false, reason: foodSourceManifests.find(source => source.id === id)?.unavailable_reason ?? 'Unknown source. No food data adapter is registered.'};
}

export function requireFoodSourceAdapter(id: string): AuthorizedFoodSourceAdapter {
  const source = foodSourceAvailability(id);
  if (!source.available) throw new Error(`Food source unavailable: ${source.reason}`);
  return source.adapter;
}
