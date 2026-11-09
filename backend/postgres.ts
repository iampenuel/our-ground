import { runtimeDatabaseConfiguration } from './database-security.ts';
import { sourcePhone, sourceWebsite } from '../shared/place-evidence.ts';
import { reviewedGivingFor } from './giving-links.ts';
import postgres from 'postgres';
import { UnavailableError } from './errors.ts';
import type { Account, Category, Repository, ServicePatch, Status } from './app.ts';

let client: ReturnType<typeof postgres> | undefined;
function db(): ReturnType<typeof postgres> {
  if (!process.env.DATABASE_URL) throw new UnavailableError('DATABASE_NOT_CONFIGURED', 'Resource information is temporarily unavailable.');
  const config=runtimeDatabaseConfiguration(process.env);
  client ??= postgres(config.connection, {
    max: 1, prepare: false, ssl: config.ssl, connect_timeout: 10, idle_timeout: 20
  });
  return client;
}
let queue: Promise<void> = Promise.resolve();
function query(text: string, args: unknown[] = []) {
  // Every SQL string below is static. Values are bound as $1, $2, ... parameters.
  // Serialize submissions: Postgres.js pipelining is incompatible with Supavisor transaction mode.
  const result = queue.then(async () => {
    const [role]=await db().unsafe('select current_user as runtime_role');
    if(role?.runtime_role!=='our_ground_api')throw new UnavailableError('RUNTIME_ROLE_INVALID','The resource database role is not safely configured.');
    return db().unsafe(text,args as never[]);
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function kind(isDemo: boolean, imported = false) { return isDemo ? 'fictional_demo' : imported ? 'imported_unverified' : 'sourced_unverified'; }
function iso(value: Date | string | null | undefined) { return value ? new Date(value).toISOString() : null; }
const joins = [
  'from app_private.public_services s',
  'join app_private.public_service_locations l on l.id = s.location_id',
  'join app_private.public_organizations o on o.id = s.organization_id'
].join(' ');
export async function closeDatabase() { await client?.end(); client = undefined; }
export class PostgresRepository implements Repository {
  async search(input: { lat: number; lng: number; radiusMiles: number; category: Category | null; keyword?: string; page: number; pageSize: number; allowDemo: boolean; demoOnly?: boolean }) {
    const result = await query('select app_private.public_resource_search($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
      [input.lat,input.lng,input.radiusMiles,input.category,input.keyword??'',input.page,input.pageSize,input.allowDemo,input.demoOnly??false]);
    const data=result[0]?.result as { total:number; items:Array<Record<string,any>> } | undefined;
    if (!data || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.items)) throw new UnavailableError('DIRECTORY_QUERY_UNAVAILABLE','The directory could not confirm these search results.');
    const rows=data.items;
    return {
      total: data.total,
      items: rows.map((r) => ({
        id: r.id, title: r.title, summary: r.summary, category_slugs: r.category_slugs,
        organization: { id: r.organization_id, name: r.organization_name },
        location: {
          city: r.city, state: r.state,
          address_label: r.is_demo ? 'DEMO POINT — NOT A VISITABLE ADDRESS' : (r.street_address ?? 'Address unavailable'),
          latitude: r.latitude, longitude: r.longitude
        },
        contact: {website_url: r.is_demo ? null : sourceWebsite(r.contact_url), phone: r.is_demo ? null : sourcePhone(r.contact_phone)},
        reviewed_giving: r.is_demo ? undefined : reviewedGivingFor({source:'directory', id:r.organization_id, name:r.organization_name,
          street:r.street_address ?? '', city:r.city, state:r.state, postcode:r.postal_code ?? '', website:sourceWebsite(r.contact_url)}),
        detail_level: r.detail_level==='substantive' ? 'substantive' as const : 'basic' as const, distance_miles: r.distance_miles, data_kind: kind(r.is_demo,!!r.provenance), provenance:r.provenance??undefined,
        source_recorded_at: iso(r.source_recorded_at)
      }))
    };
  }
  async detail(id: string, allowDemo: boolean) {
    const rows = await query([
      "select s.*, (select to_jsonb(p)-'service_id' from app_private.public_resource_provenance p where p.service_id=s.id) as provenance, (s.is_demo or l.is_demo or o.is_demo) as aggregate_is_demo, o.id as organization_id, o.name as organization_name, l.city, l.state, l.street_address,",
      'extensions.ST_Y(l.point::extensions.geometry)::float8 as latitude,',
      'extensions.ST_X(l.point::extensions.geometry)::float8 as longitude,',
      'array(select c.slug from app_private.public_service_categories sc join app_private.public_categories c on c.id = sc.category_id',
      'where sc.service_id = s.id order by c.slug) as category_slugs',
      joins, 'where s.id = $1 and s.status = $2 and l.status = $2 and o.status = $2',
      'and ($3::boolean or (not s.is_demo and not l.is_demo and not o.is_demo))'
    ].join(' '), [id, 'published', allowDemo]);
    const r = rows[0];
    if (!r) return null;
    const hours = await query(
      'select weekday, opens_at::text, closes_at::text, notes from app_private.public_opening_hours where service_id = $1 order by weekday, opens_at',
      [id]);
    const directions = r.aggregate_is_demo ? null : 'https://www.google.com/maps/dir/?api=1&destination=' + r.latitude + ',' + r.longitude;
    return {
      id: r.id, title: r.title, summary: r.summary, description: r.description,
      category_slugs: r.category_slugs,
      organization: { id: r.organization_id, name: r.organization_name },
      location: {
        city: r.city, state: r.state,
        address_label: r.aggregate_is_demo ? 'DEMO POINT — NOT A VISITABLE ADDRESS' : (r.street_address ?? 'Address unavailable'),
        latitude: r.latitude, longitude: r.longitude
      },
      hours, eligibility_text: r.eligibility_text, cost_summary: r.cost_summary,
      contact: { phone: r.aggregate_is_demo ? null : sourcePhone(r.contact_phone), website_url: r.aggregate_is_demo ? null : sourceWebsite(r.contact_url), directions_url: directions },
      source: { url: r.aggregate_is_demo ? null : r.source_url, recorded_at: iso(r.source_recorded_at) },
      data_kind: kind(r.aggregate_is_demo,!!r.provenance), provenance:r.provenance??undefined, source_recorded_at: iso(r.source_recorded_at)
    };
  }
  async createReport(input: { serviceId: string; reasonCode: string; description: string | null; allowDemo: boolean }) {
    const rows=await query('select app_private.public_correction_insert($1::uuid,$2::text,$3::text,$4::boolean) as id',[input.serviceId,input.reasonCode,input.description,input.allowDemo]);
    return rows[0]?.id??null;
  }
  // Legacy account access has no verified request/session context. The API now
  // routes these operations through the scoped organization command boundary.
  async account(_userId:string):Promise<Account> { throw new UnavailableError('ACCOUNT_CONTEXT_REQUIRED','Use the authenticated organization workspace.'); }
  async canEditService(_id:string,_account:Account):Promise<boolean> { throw new UnavailableError('ACCOUNT_CONTEXT_REQUIRED','Use the authenticated organization workspace.'); }
  async editableService(_id:string,_account:Account):Promise<unknown|null> { throw new UnavailableError('ACCOUNT_CONTEXT_REQUIRED','Use the authenticated organization workspace.'); }
  async listEditableServices(_account:Account,_page:number,_pageSize:number):Promise<{items:unknown[];total:number}> { throw new UnavailableError('ACCOUNT_CONTEXT_REQUIRED','Use the authenticated organization workspace.'); }
  async updateService(_id:string,_account:Account,_version:number,_patch:ServicePatch):Promise<{id:string;status:Status;version:number}|null> { throw new UnavailableError('REVIEW_REQUIRED','Submit a proposed revision for administrator review.'); }
}
