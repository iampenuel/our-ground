-- Additive reviewed Maryland food source. Migration014 is checksum-preserved.
-- Day/schedule rows are coalesced into exact source-program identities; public
-- attribution retains OpenPGC custom terms and the required site notice.
insert into app_private.resource_data_sources(id,name,source_url,download_url,usage_authority_url,enabled,license_name,license_url,attribution) values
('pgc-food-assistance','Prince George’s County, Maryland — Office of Food Security Food Assistance Directory','https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv','https://data.princegeorgescountymd.gov/api/views/d7ae-zbbv/rows.json?accessType=DOWNLOAD','https://data.princegeorgescountymd.gov/terms-of-use',true,'OpenPGC Terms of Use','https://data.princegeorgescountymd.gov/terms-of-use','Prince George’s County, Community Services Division, Office of Food Security') on conflict(id) do nothing;
alter table app_private.resource_privacy_holds drop constraint resource_privacy_holds_source_record_id_check;
alter table app_private.resource_privacy_holds add constraint resource_privacy_holds_source_record_id_check check(
 (source_id='hrsa-health-centers' and source_record_id~'^BPS-(H80|LAL)-[0-9]{6}$') or
 (source_id='philly-food-sites' and source_record_id~'^[0-9]{1,9}$') or
 (source_id='seattle-food-resources' and source_record_id~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') or
 (source_id='pgc-food-assistance' and source_record_id~'^PGC-[a-f0-9]{32}$'));
create or replace function app_private.food_import_batch(p_run uuid,p_records jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare run app_private.resource_import_runs%rowtype; r jsonb; prior app_private.resource_source_records%rowtype;
 s app_private.services%rowtype; l app_private.service_locations%rowtype; o app_private.organizations%rowtype;
 sid uuid; lid uuid; oid uuid; owned boolean; changed boolean; reviewed boolean; created_count integer=0; updated_count integer=0; review_count integer=0; held boolean; source_url text; hour jsonb;
begin
 select * into run from app_private.resource_import_runs where id=p_run for update;
 if not found or run.completed_at is not null or run.source_id not in ('philly-food-sites','seattle-food-resources','pgc-food-assistance') or not exists(select 1 from app_private.resource_data_sources where id=run.source_id and enabled) or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>500 then raise exception 'Invalid or unavailable import run'; end if;
 select ds.source_url into source_url from app_private.resource_data_sources ds where ds.id=run.source_id;
 for r in select * from jsonb_array_elements(p_records) loop
   if not(r ?& array['record_id','organization_id','location_id','service_id','hash','name','organization_name','street','city','state','postal_code','latitude','longitude','snapshot'])
     or not ((run.source_id='philly-food-sites' and (r->>'record_id')~'^[0-9]{1,9}$') or (run.source_id='seattle-food-resources' and (r->>'record_id')~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') or (run.source_id='pgc-food-assistance' and (r->>'record_id')~'^PGC-[a-f0-9]{32}$')) or (r->>'hash')!~ '^[a-f0-9]{64}$'
     or length(r->>'street') not between 1 and 300 or length(r->>'name') not between 2 and 160 or length(r->>'organization_name') not between 2 and 160
     or coalesce(r->>'postal_code','')!~ '^[0-9]{5}(-[0-9]{4})?$'
     or not((r->>'latitude')::float8 between -90 and 90) or not((r->>'longitude')::float8 between -180 and 180)
   then raise exception 'Invalid normalized source record'; end if;
   perform app_private.organization_validate_patch(jsonb_build_object('title',r->'name','summary',r->'summary','description',r->'description','eligibility_text',r->'eligibility_text','cost_summary',r->'cost_summary','contact_phone',r->'phone','contact_url',r->'website','street_address',r->'street','city',r->'city','state',r->'state','postal_code',r->'postal_code','latitude',r->'latitude','longitude',r->'longitude'));
   if (run.source_id='philly-food-sites' and r->>'state'<>'PA') or (run.source_id='seattle-food-resources' and r->>'state'<>'WA') or (run.source_id='pgc-food-assistance' and r->>'state'<>'MD') or jsonb_typeof(r->'hours') is distinct from 'array' or jsonb_array_length(r->'hours')>14 or pg_column_size(r->'snapshot')>16000 then raise exception 'Invalid normalized food record'; end if;
   held=exists(select 1 from app_private.resource_privacy_holds h where h.source_id=run.source_id and h.source_record_id=r->>'record_id' and h.released_at is null);
   if held then r=jsonb_set(r,'{snapshot}',jsonb_build_object('record_id',r->>'record_id','privacy_withdrawn',true)); end if;
   sid=(r->>'service_id')::uuid; lid=(r->>'location_id')::uuid; oid=(r->>'organization_id')::uuid;
   select * into prior from app_private.resource_source_records where source_id=run.source_id and source_record_id=r->>'record_id' for update;
   owned=found;
   if held and not owned then review_count=review_count+1; continue; end if;
   if owned and (prior.service_id<>sid or prior.organization_id<>oid) then raise exception 'Source identity changed; explicit owner review is required'; end if;
   select * into o from app_private.organizations where id=oid for update;
   if found and (o.is_demo or (not owned and not exists(select 1 from app_private.resource_source_records sr where sr.source_id=run.source_id and sr.organization_id=oid))) then raise exception 'Organization identity collision'; end if;
   if o.id is null then
     insert into app_private.organizations(id,name,description,status,is_demo) values(oid,r->>'organization_name','Listed by a government food-resource dataset. Contact the site to confirm services and availability.','published',false) returning * into o;
   end if;
   select * into s from app_private.services where id=sid for update;
   select * into l from app_private.service_locations where id=lid for update;
   if not owned and (s.id is not null or l.id is not null) then raise exception 'Site identity collision'; end if;
   if owned and (s.id is null or l.id is null or s.location_id<>lid or s.organization_id<>oid or l.organization_id<>oid or s.is_demo or l.is_demo) then raise exception 'Source binding changed; explicit owner review is required'; end if;
   reviewed=owned and (held or exists(select 1 from app_private.organization_memberships m where m.organization_id=oid) or exists(select 1 from app_private.organization_listing_access a where a.service_id=sid) or s.version<>prior.service_version or l.version<>prior.location_version or o.version<>prior.organization_version or s.updated_by is not null or prior.needs_review);
   changed=not owned or prior.snapshot_hash<>r->>'hash';
   if not owned then
     insert into app_private.service_locations(id,organization_id,site_name,street_address,city,state,postal_code,point,source_url,source_recorded_at,status,is_demo)
     values(lid,oid,r->>'name',r->>'street',r->>'city',r->>'state',r->>'postal_code',extensions.ST_SetSRID(extensions.ST_MakePoint((r->>'longitude')::float8,(r->>'latitude')::float8),4326)::extensions.geography,source_url,run.source_updated_at,'published',false) returning * into l;
     insert into app_private.services(id,organization_id,location_id,title,summary,description,eligibility_text,cost_summary,contact_phone,contact_url,source_url,source_recorded_at,status,is_demo)
     values(sid,oid,lid,r->>'name',r->>'summary',r->>'description',r->>'eligibility_text',r->>'cost_summary',r->>'phone',r->>'website',source_url,run.source_updated_at,'published',false) returning * into s;
     insert into app_private.service_categories(service_id,category_id) select sid,id from app_private.categories where slug='food';
     created_count=created_count+1;
   elsif reviewed then
     review_count=review_count+1;
   elsif changed then
     update app_private.service_locations set site_name=r->>'name',street_address=r->>'street',city=r->>'city',state=r->>'state',postal_code=r->>'postal_code',point=extensions.ST_SetSRID(extensions.ST_MakePoint((r->>'longitude')::float8,(r->>'latitude')::float8),4326)::extensions.geography,source_recorded_at=run.source_updated_at,version=version+1,updated_at=now() where id=lid returning * into l;
     update app_private.services set title=r->>'name',summary=r->>'summary',description=r->>'description',eligibility_text=r->>'eligibility_text',cost_summary=r->>'cost_summary',contact_phone=r->>'phone',contact_url=r->>'website',source_recorded_at=run.source_updated_at,version=version+1,updated_at=now() where id=sid returning * into s;
     updated_count=updated_count+1;
   end if;
   if not reviewed and (not owned or changed) then
     delete from app_private.opening_hours where service_id=sid;
     for hour in select * from jsonb_array_elements(r->'hours') loop
       if coalesce(hour->>'weekday','')!~'^[0-6]$' or coalesce(hour->>'opens_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(hour->>'closes_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (hour->>'opens_at')>=(hour->>'closes_at') or coalesce(hour->>'sequence','') not in ('1','2') or length(hour->>'notes')>500 then raise exception 'Invalid source opening hours'; end if;
       insert into app_private.opening_hours(service_id,weekday,opens_at,closes_at,notes,sequence) values(sid,(hour->>'weekday')::smallint,(hour->>'opens_at')::time,(hour->>'closes_at')::time,hour->>'notes',(hour->>'sequence')::smallint);
     end loop;
   end if;
   insert into app_private.resource_source_records(source_id,source_record_id,service_id,organization_id,snapshot,snapshot_hash,service_version,location_version,organization_version,import_run_id,source_updated_at,record_status,needs_review)
   values(run.source_id,r->>'record_id',sid,oid,r->'snapshot',r->>'hash',s.version,l.version,o.version,run.id,(r->>'source_updated_at')::timestamptz,case when reviewed then 'stale_or_needs_review' else 'active' end,reviewed)
   on conflict(source_id,source_record_id) do update set snapshot=excluded.snapshot,snapshot_hash=excluded.snapshot_hash,
     service_version=case when reviewed then resource_source_records.service_version else excluded.service_version end,
     location_version=case when reviewed then resource_source_records.location_version else excluded.location_version end,
     organization_version=case when reviewed then resource_source_records.organization_version else excluded.organization_version end,
     import_run_id=run.id,source_updated_at=excluded.source_updated_at,last_seen_at=now(),record_status=excluded.record_status,needs_review=reviewed;
   insert into app_private.resource_source_versions(source_id,source_record_id,snapshot_hash,import_run_id,source_updated_at,snapshot)
   values(run.source_id,r->>'record_id',r->>'hash',run.id,(r->>'source_updated_at')::timestamptz,r->'snapshot') on conflict do nothing;
 end loop;
 return jsonb_build_object('created',created_count,'updated',updated_count,'needs_review',review_count);
end $$;
revoke all on function app_private.food_import_batch(uuid,jsonb) from public,our_ground_api;

create or replace function app_private.food_privacy_withdraw(p_run uuid,p_records jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare run app_private.resource_import_runs%rowtype; r jsonb; withdrawn integer=0; changed boolean;
begin
 perform pg_advisory_xact_lock(hashtext('our-ground-food-import'));
 select * into run from app_private.resource_import_runs where id=p_run for update;
 if not found or run.source_id not in ('philly-food-sites','seattle-food-resources','pgc-food-assistance')
 or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>50000
 then raise exception 'Invalid privacy withdrawal operation'; end if;
 for r in select * from jsonb_array_elements(p_records) loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['record_id','reason'])
   or exists(select 1 from jsonb_object_keys(r) k where k not in ('record_id','reason'))
   or not ((run.source_id='philly-food-sites' and coalesce(r->>'record_id','')~'^[0-9]{1,9}$') or (run.source_id='seattle-food-resources' and coalesce(r->>'record_id','')~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') or (run.source_id='pgc-food-assistance' and coalesce(r->>'record_id','')~'^PGC-[a-f0-9]{32}$'))
   or coalesce(r->>'reason','') not in ('privacy_withdrawal','missing_public_address')
   then raise exception 'Only stable source identity and a supported privacy reason are accepted'; end if;
   -- An explicit later privacy flag reinstates a previously reviewed release.
   changed=not exists(select 1 from app_private.resource_privacy_holds where source_id=run.source_id and source_record_id=r->>'record_id' and released_at is null);
   insert into app_private.resource_privacy_holds(source_id,source_record_id,reason,import_run_id,source_updated_at)
   values(run.source_id,r->>'record_id',case when r->>'reason'='privacy_withdrawal' then 'suppressed' else 'suppressed_or_missing_address' end,run.id,run.source_updated_at)
   on conflict(source_id,source_record_id) do update set reason=excluded.reason,import_run_id=excluded.import_run_id,source_updated_at=excluded.source_updated_at,
     withdrawn_at=case when resource_privacy_holds.released_at is not null then now() else resource_privacy_holds.withdrawn_at end,
     released_at=null,released_by=null,release_evidence_url=null;
   if changed then
     insert into app_private.resource_privacy_events(source_id,source_record_id,action,import_run_id) values(run.source_id,r->>'record_id','withdrawn',run.id);
     withdrawn=withdrawn+1;
   end if;
   update app_private.resource_source_records set snapshot=jsonb_build_object('record_id',source_record_id,'privacy_withdrawn',true),record_status='suppressed',needs_review=true,import_run_id=run.id,source_updated_at=run.source_updated_at,last_seen_at=now()
   where source_id=run.source_id and source_record_id=r->>'record_id';
   update app_private.resource_source_versions set snapshot=jsonb_build_object('record_id',source_record_id,'privacy_withdrawn',true) where source_id=run.source_id and source_record_id=r->>'record_id';
 end loop;
 return withdrawn;
end $$;


revoke all on function app_private.food_import_batch(uuid,jsonb),app_private.food_privacy_withdraw(uuid,jsonb) from public,our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then
 execute format('revoke all on function app_private.food_import_batch(uuid,jsonb),app_private.food_privacy_withdraw(uuid,jsonb) from %I',r);
 end if; end loop;
end $$;
