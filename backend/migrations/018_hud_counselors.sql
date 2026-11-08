-- Use the existing source binding, versioning and reviewed-edit protections for HUD.
insert into app_private.resource_data_sources(id,name,source_url,download_url,usage_authority_url,enabled,license_name,license_url,attribution) values
('hud-housing-counselors','HUD Housing Counselor API','https://data.hud.gov/housing_counseling.html','https://data.hud.gov/Housing_Counselor/search?AgencyName=&City=&State=','https://www.hud.gov/sites/documents/webpubstandards.pdf',true,'HUD public website materials','https://www.hud.gov/sites/documents/webpubstandards.pdf','U.S. Department of Housing and Urban Development. Snapshot date reflects retrieval. Agency locations may be approximate.') on conflict(id) do nothing;
create or replace function app_private.resource_import_batch(p_run uuid,p_records jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare run app_private.resource_import_runs%rowtype; r jsonb; prior app_private.resource_source_records%rowtype;
 s app_private.services%rowtype; l app_private.service_locations%rowtype; o app_private.organizations%rowtype;
 sid uuid; lid uuid; oid uuid; owned boolean; changed boolean; reviewed boolean; created_count integer=0; updated_count integer=0; review_count integer=0;
begin
 select * into run from app_private.resource_import_runs where id=p_run for update;
 if not found or run.completed_at is not null or run.source_id not in ('hrsa-health-centers','hud-housing-counselors') or not exists(select 1 from app_private.resource_data_sources where id=run.source_id and enabled) or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>500 then raise exception 'Invalid or unavailable import run'; end if;
 for r in select * from jsonb_array_elements(p_records) loop
   if not(r ?& array['record_id','organization_id','location_id','service_id','hash','name','organization_name','street','city','state','postal_code','latitude','longitude','snapshot'])
     or (run.source_id='hrsa-health-centers' and (r->>'record_id')!~ '^BPS-(H80|LAL)-[0-9]{6}$') or (run.source_id='hud-housing-counselors' and (r->>'record_id')!~ '^[0-9]{3,9}$') or (r->>'hash')!~ '^[a-f0-9]{64}$'
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
     insert into app_private.organizations(id,name,description,status,is_demo) values(oid,r->>'organization_name','Source-listed organization. Contact the site to confirm services and availability.','published',false) returning * into o;
   end if;
   select * into s from app_private.services where id=sid for update;
   select * into l from app_private.service_locations where id=lid for update;
   if not owned and (s.id is not null or l.id is not null) then raise exception 'Site identity collision'; end if;
   if owned and (s.id is null or l.id is null or s.location_id<>lid or s.organization_id<>oid or l.organization_id<>oid or s.is_demo or l.is_demo) then raise exception 'Source binding changed; explicit owner review is required'; end if;
   reviewed=owned and (s.version<>prior.service_version or l.version<>prior.location_version or o.version<>prior.organization_version or s.updated_by is not null or prior.needs_review);
   changed=not owned or prior.snapshot_hash<>r->>'hash';
   if not owned then
     insert into app_private.service_locations(id,organization_id,site_name,street_address,city,state,postal_code,point,source_url,source_recorded_at,status,is_demo)
     values(lid,oid,r->>'name',r->>'street',r->>'city',r->>'state',r->>'postal_code',extensions.ST_SetSRID(extensions.ST_MakePoint((r->>'longitude')::float8,(r->>'latitude')::float8),4326)::extensions.geography,(select ds.source_url from app_private.resource_data_sources ds where ds.id=run.source_id),run.source_updated_at,'published',false) returning * into l;
     insert into app_private.services(id,organization_id,location_id,title,summary,description,contact_phone,contact_url,source_url,source_recorded_at,status,is_demo)
     values(sid,oid,lid,r->>'name',r->>'summary',r->>'description',r->>'phone',r->>'website',(select ds.source_url from app_private.resource_data_sources ds where ds.id=run.source_id),run.source_updated_at,'published',false) returning * into s;
     insert into app_private.service_categories(service_id,category_id) select sid,id from app_private.categories where slug=case run.source_id when 'hud-housing-counselors' then 'community' else 'healthcare' end;
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

