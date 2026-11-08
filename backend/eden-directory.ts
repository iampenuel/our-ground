import type { Repository } from './app.ts';
import type { DirectoryCityLookup } from './directory-city.ts';
import type { EdenCategory, EdenCityId, EdenRadius } from '../shared/eden-assistant.ts';
import { isImportedResourceId } from '../shared/eden-agent.ts';
import type { ResourceCard, ResourceDetail } from '../shared/contracts.ts';
import { validPoint } from '../shared/us-location.ts';
import { EdenProviderError } from './eden-provider.ts';

const sources = new Map([
  ['hud-housing-counselors','HUD Housing Counselor API'],
  ['hrsa-health-centers','HRSA Health Center Program'],
  ['philly-food-sites','City of Philadelphia food site directory'],
  ['seattle-food-resources','Seattle and King County food directory'],
  ['pgc-food-assistance',"Prince George’s County Food Assistance Directory"],
]);
const reject = (): never => { throw new EdenProviderError('EDEN_SOURCE_NOT_APPROVED',503); };
type Query = {cityId:EdenCityId;category:EdenCategory;radius:EdenRadius};
type Fact = {id:string;text:string};
function imported(row: unknown): ResourceCard {
  const r = row as ResourceCard | null, p = r?.provenance;
  if (!r || !isImportedResourceId(r.id) || r.data_kind !== 'imported_unverified' || !p ||
    !sources.has(p.source_id) || !p.source_record_id || !['imported_unverified','stale_or_needs_review'].includes(p.verification_status) ||
    ![p.imported_at,p.source_updated_at,p.last_seen_at].every(d => typeof d === 'string' && Number.isFinite(Date.parse(d))) ||
    !validPoint(r.location?.latitude,r.location?.longitude) || typeof r.title !== 'string' || !r.title.trim() || /[<>\u0000-\u001f\u007f]/u.test(r.title)) return reject();
  return r;
}
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function listedHours(raw: unknown, position: number): Fact {
  const times = Array.isArray(raw) ? raw.filter((row): row is ResourceDetail['hours'][number] =>
    row && Number.isInteger(row.weekday) && weekdays[row.weekday] &&
    [row.opens_at, row.closes_at].every(time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))) : [];
  const entries = times.slice().sort((a,b) => a.weekday-b.weekday || a.opens_at.localeCompare(b.opens_at))
    .map(row => weekdays[row.weekday]+' '+row.opens_at.slice(0,5)+'–'+row.closes_at.slice(0,5));
  return {id: `resource-${position}-hours`, text: entries.length
    ? `Listing ${position} publishes these hours: ${entries.join(', ')}. Confirm current hours directly.`
    : `The directory has no structured hours for listing ${position}. Contact the provider to confirm hours.`};
}
/** Same restricted public repository and point as the list. No arbitrary
 * client ID is looked up; only an ordinal confirmed in a fresh page of results. */
export function createEdenDirectory(repo: Pick<Repository,'search'|'detail'>, locate: DirectoryCityLookup) {
  return {
    async search(q: Query) {
      const center = await locate(q.cityId);
      const result = await repo.search({lat:center.latitude,lng:center.longitude,radiusMiles:q.radius,category:q.category,page:1,pageSize:20,allowDemo:false});
      if (!Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items) || result.items.length !== Math.min(result.total,20)) return reject();
      const rows = result.items.map(imported);
      if (rows.some(r => !r.category_slugs.includes(q.category) || !Number.isFinite(r.distance_miles) || r.distance_miles < 0 || r.distance_miles > q.radius) || new Set(rows.map(r=>r.id)).size !== rows.length) return reject();
      // Find Support displays the rounded public distance and breaks ties by source-qualified ID.
      rows.sort((a,b) => a.distance_miles-b.distance_miles || a.id.localeCompare(b.id));
      return {ids:rows.map(r=>r.id),total:result.total};
    },
    async facts(id: string, position: number): Promise<Fact[]> {
      const detail = await repo.detail(id,false);
      const r = imported(detail);
      if (r.id !== id) return reject();
      const p = r.provenance!, date = new Date(p.source_updated_at).toISOString().slice(0,10);
      return [listedHours((detail as ResourceDetail).hours, position), {id:`resource-${position}-title`,text:r.title.slice(0,160)},
        {id:`resource-${position}-summary`,text:`Listed by ${sources.get(p.source_id)}. Source updated ${date}. ${p.verification_status==='stale_or_needs_review'?'This record needs review.':'Current operation is not independently verified.'}`}];
    },
  };
}
// Source text (including a real listing name) is presented only by the website.
// The model receives a stable ordinal, reviewed source label and date.
export function directoryModelFacts(facts: Fact[]): Fact[] {
  return facts.map(f => { const n=/^resource-(\d+)-title$/.exec(f.id); return n ? {...f,text:`Directory listing ${n[1]}. Its published name is shown in the results list.`} : f; });
}
