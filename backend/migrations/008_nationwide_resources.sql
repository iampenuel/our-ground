-- Phase 7D: resource geography and source provenance. Historical migrations are unchanged.
alter table app_private.service_locations drop constraint if exists service_locations_state_check;
alter table app_private.service_locations add constraint service_locations_state_check check(state=any(array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP']));
alter table app_private.service_locations drop constraint if exists service_locations_postal_code_check;
alter table app_private.service_locations add constraint service_locations_postal_code_check check(postal_code is null or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$');

create table if not exists app_private.resource_data_sources (
 id text primary key, name text not null, source_url text not null,
 download_url text not null, usage_authority_url text not null,
 enabled boolean not null default false
);
insert into app_private.resource_data_sources values ('hrsa-health-centers','HRSA Health Center Program Service Delivery and Look-Alike Sites','https://data.hrsa.gov/topics/healthcenters','https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv','https://data.hrsa.gov/data/download',true) on conflict(id) do nothing;
create table if not exists app_private.resource_import_runs (
 id uuid primary key, source_id text not null references app_private.resource_data_sources(id),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'), source_updated_at timestamptz not null,
 imported_at timestamptz not null default now(), completed_at timestamptz,
 summary jsonb not null default '{}'::jsonb,
 unique(source_id,checksum)
);
create table if not exists app_private.resource_source_records (
 source_id text not null references app_private.resource_data_sources(id), source_record_id text not null,
 service_id uuid not null unique references app_private.services(id),
 organization_id uuid not null references app_private.organizations(id),
 snapshot jsonb not null check(pg_column_size(snapshot)<=16000), snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 service_version integer not null, location_version integer not null, organization_version integer not null,
 import_run_id uuid not null references app_private.resource_import_runs(id),
 imported_at timestamptz not null default now(), source_updated_at timestamptz not null, last_seen_at timestamptz not null default now(),
 record_status text not null default 'active' check(record_status in ('active','stale_or_needs_review','inactive','suppressed')),
 needs_review boolean not null default false,
 primary key(source_id,source_record_id)
);
create table if not exists app_private.resource_source_versions (
 source_id text not null, source_record_id text not null, snapshot_hash text not null,
 import_run_id uuid not null references app_private.resource_import_runs(id), source_updated_at timestamptz not null,
 snapshot jsonb not null check(pg_column_size(snapshot)<=16000), created_at timestamptz not null default now(),
 primary key(source_id,source_record_id,snapshot_hash),
 foreign key(source_id,source_record_id) references app_private.resource_source_records(source_id,source_record_id)
);
create index if not exists resource_source_records_run_idx on app_private.resource_source_records(import_run_id);
do $$ declare t text; r text; begin
 foreach t in array array['resource_data_sources','resource_import_runs','resource_source_records','resource_source_versions'] loop
   execute format('alter table app_private.%I enable row level security',t);
   execute format('revoke all on app_private.%I from public,our_ground_api',t);
   foreach r in array array['anon','authenticated'] loop
     if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on app_private.%I from %I',t,r); end if;
   end loop;
 end loop;
end $$;

-- A feed becoming confidential/inactive hides its public projection without
-- overwriting the separately retained human-reviewed organization data.
create or replace view app_private.public_services with(security_barrier=true) as
select s.id,s.organization_id,s.location_id,s.title,s.summary,s.description,s.eligibility_text,s.cost_summary,s.appointment_note,s.contact_phone,s.contact_url,s.source_url,s.source_recorded_at,s.status,s.is_demo,s.updated_at
from app_private.services s join app_private.service_locations l on l.id=s.location_id and l.organization_id=s.organization_id join app_private.organizations o on o.id=s.organization_id
where s.status='published' and l.status='published' and o.status='published' and o.suspended_at is null
and not exists(select 1 from app_private.resource_source_records sr where sr.service_id=s.id and sr.record_status in ('inactive','suppressed'));
create or replace view app_private.public_resource_provenance with(security_barrier=true) as
select sr.service_id,sr.source_id,ds.name as source_name,sr.source_record_id,ds.source_url,
sr.imported_at,sr.source_updated_at,sr.last_seen_at,
case when sr.needs_review or sr.record_status='stale_or_needs_review' then 'stale_or_needs_review' else 'imported_unverified' end as verification_status
from app_private.resource_source_records sr join app_private.resource_data_sources ds on ds.id=sr.source_id
join app_private.public_services s on s.id=sr.service_id where not s.is_demo;
revoke all on app_private.public_resource_provenance from public;
grant select on app_private.public_resource_provenance to our_ground_api;

-- One fixed public operation puts the spatial predicate on the base geography
-- index before projecting public fields. Runtime cannot select the base tables.
create or replace function app_private.public_resource_search(p_lat double precision,p_lng double precision,p_radius double precision,p_category text,p_keyword text,p_page integer,p_size integer,p_allow_demo boolean,p_demo_only boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app_private,extensions as $$
declare response jsonb;
begin
 if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180)
 or p_radius is null or not(p_radius>0 and p_radius<=50) or p_page is null or p_page not between 1 and 1000 or p_size is null or p_size not between 1 and 50
 or (p_category is not null and p_category not in ('food','healthcare')) or p_keyword is null or length(p_keyword)>100 or p_allow_demo is null or p_demo_only is null
 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 with nearby as materialized (
   select l.*,extensions.ST_Distance(l.point,extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng,p_lat),4326)::extensions.geography) as distance_meters
   from app_private.service_locations l where l.status='published' and (p_allow_demo or not l.is_demo)
   and extensions.ST_DWithin(l.point,extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng,p_lat),4326)::extensions.geography,p_radius*1609.344)
 ), matches as materialized (
   select s.id,s.title,s.summary,(s.is_demo or l.is_demo or o.is_demo) as is_demo,s.source_recorded_at,
   o.id as organization_id,o.name as organization_name,l.city,l.state,l.street_address,l.postal_code,s.contact_phone,s.contact_url,
   extensions.ST_Y(l.point::extensions.geometry)::float8 as latitude,extensions.ST_X(l.point::extensions.geometry)::float8 as longitude,
   l.distance_meters,round((l.distance_meters/1609.344)::numeric,1)::float8 as distance_miles,
   array(select c.slug from app_private.service_categories sc join app_private.categories c on c.id=sc.category_id where sc.service_id=s.id order by c.slug) as category_slugs,
   case when sr.service_id is null then null else jsonb_build_object('source_id',sr.source_id,'source_name',ds.name,'source_record_id',sr.source_record_id,'source_url',ds.source_url,'imported_at',sr.imported_at,'source_updated_at',sr.source_updated_at,'last_seen_at',sr.last_seen_at,'verification_status',case when sr.needs_review or sr.record_status='stale_or_needs_review' then 'stale_or_needs_review' else 'imported_unverified' end) end as provenance
   from nearby l join app_private.services s on s.location_id=l.id and s.organization_id=l.organization_id join app_private.organizations o on o.id=s.organization_id
   left join app_private.resource_source_records sr on sr.service_id=s.id left join app_private.resource_data_sources ds on ds.id=sr.source_id
   where s.status='published' and o.status='published' and o.suspended_at is null
   and (p_allow_demo or not(s.is_demo or l.is_demo or o.is_demo)) and (not p_demo_only or s.is_demo or l.is_demo or o.is_demo)
   and (sr.record_status is null or sr.record_status not in ('inactive','suppressed'))
   and (p_category is null or exists(select 1 from app_private.service_categories sc join app_private.categories c on c.id=sc.category_id where sc.service_id=s.id and c.slug=p_category))
   and (p_keyword='' or position(lower(p_keyword) in lower(s.title||' '||s.summary||' '||s.description))>0)
 ), selected as (select * from matches order by distance_meters,id limit p_size offset (p_page-1)*p_size)
 select jsonb_build_object('total',(select count(*) from matches),'items',coalesce((select jsonb_agg(to_jsonb(selected)-'distance_meters' order by distance_meters,id) from selected),'[]'::jsonb)) into response;
 return response;
end $$;
revoke all on function app_private.public_resource_search(double precision,double precision,double precision,text,text,integer,integer,boolean,boolean) from public;
grant execute on function app_private.public_resource_search(double precision,double precision,double precision,text,text,integer,integer,boolean,boolean) to our_ground_api;

create or replace function app_private.organization_validate_patch(p jsonb) returns void language plpgsql set search_path=pg_catalog,app_private as $$
declare k text; v jsonb; hour jsonb; maxlen integer;
begin
  if jsonb_typeof(p)<>'object' or p='{}'::jsonb or pg_column_size(p)>16000 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  if (p ? 'latitude') is distinct from (p ? 'longitude') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  for k,v in select * from jsonb_each(p) loop
    if k not in ('title','summary','description','eligibility_text','cost_summary','appointment_note','contact_phone','contact_url','organization_description','website_url','public_phone','site_name','street_address','city','state','postal_code','latitude','longitude','category_slugs','hours') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    if k in ('latitude','longitude') then
      if jsonb_typeof(v)<>'number' or not ((v::text)::numeric between case k when 'latitude' then -90 else -180 end and case k when 'latitude' then 90 else 180 end) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    elsif k='category_slugs' then
      if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<1 or jsonb_array_length(v)>2 or exists(select 1 from jsonb_array_elements(v) x where x not in ('"food"'::jsonb,'"healthcare"'::jsonb)) or (select count(distinct x) from jsonb_array_elements(v) x)<>jsonb_array_length(v) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    elsif k='hours' then
      if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>28 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      for hour in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(hour)<>'object' or not (hour ?& array['weekday','opens_at','closes_at']) or exists(select 1 from jsonb_object_keys(hour) z where z not in ('weekday','opens_at','closes_at','notes'))
          or jsonb_typeof(hour->'weekday')<>'number' or (hour->>'weekday')!~ '^[0-6]$'
          or coalesce(hour->>'opens_at','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(hour->>'closes_at','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (hour->>'opens_at')>=(hour->>'closes_at') or (hour ? 'notes' and hour->'notes'<>'null'::jsonb and (jsonb_typeof(hour->'notes')<>'string' or length(hour->>'notes')>300))
        then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      end loop;
    else
      if v='null'::jsonb then
        if k in ('title','summary','description','organization_description','site_name','city','state') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      elsif jsonb_typeof(v)<>'string' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';
      end if;
      maxlen=case when k in ('contact_url','website_url') then 2048 when k in ('description','organization_description') then 4000 when k in ('contact_phone','public_phone') then 40 when k='street_address' then 300 when k in ('title','site_name') then 160 when k='city' then 100 when k in ('eligibility_text','appointment_note') then 1000 else 500 end;
      if length(p->>k)>maxlen or (k in ('title','site_name','city') and length(trim(p->>k))<2)
        or (k='state' and not ((p->>k)=any(array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP']))) or (k='postal_code' and v<>'null'::jsonb and (p->>k)!~ '^[0-9]{5}(-[0-9]{4})?$')
        or (k in ('contact_url','website_url') and not app_private.organization_safe_url(p->>k))
        or (k in ('contact_phone','public_phone') and v<>'null'::jsonb and (p->>k)!~ '^\+?[0-9() .-]{7,40}$')
      then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    end if;
  end loop;
end;
$$;
-- Owner-only importer. No runtime/browser grant, arbitrary URL or remote-fetch path.
create or replace function app_private.resource_import_batch(p_run uuid,p_records jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare run app_private.resource_import_runs%rowtype; r jsonb; prior app_private.resource_source_records%rowtype;
 s app_private.services%rowtype; l app_private.service_locations%rowtype; o app_private.organizations%rowtype;
 sid uuid; lid uuid; oid uuid; owned boolean; changed boolean; reviewed boolean; created_count integer=0; updated_count integer=0; review_count integer=0;
begin
 select * into run from app_private.resource_import_runs where id=p_run for update;
 if not found or run.completed_at is not null or run.source_id<>'hrsa-health-centers' or not exists(select 1 from app_private.resource_data_sources where id=run.source_id and enabled) or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>500 then raise exception 'Invalid or unavailable import run'; end if;
 for r in select * from jsonb_array_elements(p_records) loop
   if not(r ?& array['record_id','organization_id','location_id','service_id','hash','name','organization_name','street','city','state','postal_code','latitude','longitude','snapshot'])
     or (r->>'record_id')!~ '^BPS-(H80|LAL)-[0-9]{6}$' or (r->>'hash')!~ '^[a-f0-9]{64}$'
     or length(r->>'street') not between 1 and 300 or length(r->>'name') not between 2 and 160 or length(r->>'organization_name') not between 2 and 160
     or coalesce(r->>'postal_code','')!~ '^[0-9]{5}(-[0-9]{4})?$'
     or not((r->>'latitude')::float8 between -90 and 90) or not((r->>'longitude')::float8 between -180 and 180)
   then raise exception 'Invalid normalized source record'; end if;
   sid=(r->>'service_id')::uuid; lid=(r->>'location_id')::uuid; oid=(r->>'organization_id')::uuid;
   select * into prior from app_private.resource_source_records where source_id=run.source_id and source_record_id=r->>'record_id' for update;
   owned=found;
   if owned and (prior.service_id<>sid or prior.organization_id<>oid) then raise exception 'Source identity changed; explicit owner review is required'; end if;
   select * into o from app_private.organizations where id=oid for update;
   if found and (o.is_demo or (not owned and not exists(select 1 from app_private.resource_source_records sr where sr.source_id=run.source_id and sr.organization_id=oid))) then raise exception 'Organization identity collision'; end if;
   if o.id is null then
     insert into app_private.organizations(id,name,description,status,is_demo) values(oid,r->>'organization_name','Listed in the HRSA Health Center Program dataset. Contact the site to confirm services and availability.','published',false) returning * into o;
   end if;
   select * into s from app_private.services where id=sid for update;
   select * into l from app_private.service_locations where id=lid for update;
   if not owned and (s.id is not null or l.id is not null) then raise exception 'Site identity collision'; end if;
   if owned and (s.id is null or l.id is null or s.location_id<>lid or s.organization_id<>oid or l.organization_id<>oid or s.is_demo or l.is_demo) then raise exception 'Source binding changed; explicit owner review is required'; end if;
   reviewed=owned and (s.version<>prior.service_version or l.version<>prior.location_version or o.version<>prior.organization_version or s.updated_by is not null or prior.needs_review);
   changed=not owned or prior.snapshot_hash<>r->>'hash';
   if not owned then
     insert into app_private.service_locations(id,organization_id,site_name,street_address,city,state,postal_code,point,source_url,source_recorded_at,status,is_demo)
     values(lid,oid,r->>'name',r->>'street',r->>'city',r->>'state',r->>'postal_code',extensions.ST_SetSRID(extensions.ST_MakePoint((r->>'longitude')::float8,(r->>'latitude')::float8),4326)::extensions.geography,'https://data.hrsa.gov/topics/healthcenters',run.source_updated_at,'published',false) returning * into l;
     insert into app_private.services(id,organization_id,location_id,title,summary,description,contact_phone,contact_url,source_url,source_recorded_at,status,is_demo)
     values(sid,oid,lid,r->>'name',r->>'summary',r->>'description',r->>'phone',r->>'website','https://data.hrsa.gov/topics/healthcenters',run.source_updated_at,'published',false) returning * into s;
     insert into app_private.service_categories(service_id,category_id) select sid,id from app_private.categories where slug='healthcare';
     created_count=created_count+1;
   elsif reviewed then
     review_count=review_count+1;
   elsif changed then
     update app_private.service_locations set site_name=r->>'name',street_address=r->>'street',city=r->>'city',state=r->>'state',postal_code=r->>'postal_code',point=extensions.ST_SetSRID(extensions.ST_MakePoint((r->>'longitude')::float8,(r->>'latitude')::float8),4326)::extensions.geography,source_recorded_at=run.source_updated_at,version=version+1,updated_at=now() where id=lid returning * into l;
     update app_private.services set title=r->>'name',summary=r->>'summary',description=r->>'description',contact_phone=r->>'phone',contact_url=r->>'website',source_recorded_at=run.source_updated_at,version=version+1,updated_at=now() where id=sid returning * into s;
     updated_count=updated_count+1;
   end if;
   insert into app_private.resource_source_records(source_id,source_record_id,service_id,organization_id,snapshot,snapshot_hash,service_version,location_version,organization_version,import_run_id,source_updated_at,record_status,needs_review)
   values(run.source_id,r->>'record_id',sid,oid,r->'snapshot',r->>'hash',s.version,l.version,o.version,run.id,run.source_updated_at,case when reviewed then 'stale_or_needs_review' else 'active' end,reviewed)
   on conflict(source_id,source_record_id) do update set snapshot=excluded.snapshot,snapshot_hash=excluded.snapshot_hash,
     service_version=case when reviewed then resource_source_records.service_version else excluded.service_version end,
     location_version=case when reviewed then resource_source_records.location_version else excluded.location_version end,
     organization_version=case when reviewed then resource_source_records.organization_version else excluded.organization_version end,
     import_run_id=run.id,source_updated_at=run.source_updated_at,last_seen_at=now(),record_status=excluded.record_status,needs_review=reviewed;
   insert into app_private.resource_source_versions(source_id,source_record_id,snapshot_hash,import_run_id,source_updated_at,snapshot)
   values(run.source_id,r->>'record_id',r->>'hash',run.id,run.source_updated_at,r->'snapshot') on conflict do nothing;
 end loop;
 return jsonb_build_object('created',created_count,'updated',updated_count,'needs_review',review_count);
end $$;
revoke all on function app_private.resource_import_batch(uuid,jsonb) from public,our_ground_api;

-- Supabase projects may have explicit default grants in addition to PUBLIC.
-- Remove those as well; schema exposure cannot activate these operations.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then
     execute format('revoke all on app_private.public_resource_provenance from %I',r);
     execute format('revoke all on function app_private.public_resource_search(double precision,double precision,double precision,text,text,integer,integer,boolean,boolean),app_private.resource_import_batch(uuid,jsonb),app_private.organization_validate_patch(jsonb) from %I',r);
   end if;
 end loop;
end $$;
