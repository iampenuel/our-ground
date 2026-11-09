-- Phase 7D additive privacy withdrawal boundary. Migration008 is unchanged.
-- Stable source IDs only: no suppressed street, coordinates, raw row or snapshot.
create table if not exists app_private.resource_privacy_holds (
 source_id text not null references app_private.resource_data_sources(id),
 source_record_id text not null check(source_record_id ~ '^BPS-(H80|LAL)-[0-9]{6}$'),
 reason text not null check(reason in ('suppressed','suppressed_or_missing_address')),
 import_run_id uuid not null references app_private.resource_import_runs(id),
 source_updated_at timestamptz not null, withdrawn_at timestamptz not null default now(),
 released_at timestamptz, released_by uuid references app_private.app_users(id),
 release_evidence_url text,
 primary key(source_id,source_record_id),
 check((released_at is null and released_by is null and release_evidence_url is null) or (released_at is not null and released_by is not null and release_evidence_url is not null))
);
create table if not exists app_private.resource_privacy_events (
 id bigint generated always as identity primary key,
 source_id text not null, source_record_id text not null,
 action text not null check(action in ('withdrawn','reviewed_release')),
 import_run_id uuid not null references app_private.resource_import_runs(id),
 actor_id uuid references app_private.app_users(id), evidence_url text,
 created_at timestamptz not null default now(),
 foreign key(source_id,source_record_id) references app_private.resource_privacy_holds(source_id,source_record_id)
);
do $$ declare t text; r text; begin
 foreach t in array array['resource_privacy_holds','resource_privacy_events'] loop
   execute format('alter table app_private.%I enable row level security',t);
   execute format('revoke all on app_private.%I from public,our_ground_api',t);
   foreach r in array array['anon','authenticated'] loop
     if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on app_private.%I from %I',t,r); end if;
   end loop;
 end loop;
end $$;
drop trigger if exists resource_privacy_events_immutable on app_private.resource_privacy_events;
create trigger resource_privacy_events_immutable before update or delete on app_private.resource_privacy_events for each row execute function app_private.organization_audit_immutable();

create or replace function app_private.resource_privacy_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
 if exists(select 1 from app_private.resource_privacy_holds h where h.source_id=new.source_id and h.source_record_id=new.source_record_id and h.released_at is null) then
   new.record_status='suppressed'; new.needs_review=true;
 end if;
 return new;
end $$;
drop trigger if exists resource_privacy_guard on app_private.resource_source_records;
create trigger resource_privacy_guard before insert or update on app_private.resource_source_records for each row execute function app_private.resource_privacy_guard();

create or replace function app_private.resource_privacy_withdraw(p_run uuid,p_records jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare run app_private.resource_import_runs%rowtype; r jsonb; withdrawn integer=0; changed boolean;
begin
 perform pg_advisory_xact_lock(hashtext('our-ground-hrsa-import'));
 select * into run from app_private.resource_import_runs where id=p_run for update;
 if not found or run.source_id<>'hrsa-health-centers'
 or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>50000
 then raise exception 'Invalid privacy withdrawal operation'; end if;
 for r in select * from jsonb_array_elements(p_records) loop
   if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['record_id','reason'])
   or exists(select 1 from jsonb_object_keys(r) k where k not in ('record_id','reason'))
   or coalesce(r->>'record_id','')!~ '^BPS-(H80|LAL)-[0-9]{6}$'
   or coalesce(r->>'reason','') not in ('suppressed','suppressed_or_missing_address')
   then raise exception 'Only stable source identity and a supported privacy reason are accepted'; end if;
   -- An explicit later privacy flag reinstates a previously reviewed release.
   changed=not exists(select 1 from app_private.resource_privacy_holds where source_id=run.source_id and source_record_id=r->>'record_id' and released_at is null);
   insert into app_private.resource_privacy_holds(source_id,source_record_id,reason,import_run_id,source_updated_at)
   values(run.source_id,r->>'record_id',r->>'reason',run.id,run.source_updated_at)
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

-- No HTTP or automated release route. The owner must independently review the
-- exact source/site identity, active administrator and current public evidence.
-- A fresh complete public row AND an already matching application location are
-- required, so release cannot expose an old address following a source move.
create or replace function app_private.resource_privacy_review_release(p_source text,p_record text,p_reviewer uuid,p_evidence text) returns void
language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare h app_private.resource_privacy_holds%rowtype; sr app_private.resource_source_records%rowtype; loc app_private.service_locations%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('our-ground-hrsa-import'));
 if not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active')
 or p_evidence is null or not app_private.organization_safe_url(p_evidence)
 then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
 select * into h from app_private.resource_privacy_holds where source_id=p_source and source_record_id=p_record for update;
 if not found or h.released_at is not null then raise exception 'No active privacy hold for the exact source identity'; end if;
 select * into sr from app_private.resource_source_records where source_id=p_source and source_record_id=p_record for update;
 if not found or sr.import_run_id=h.import_run_id or sr.source_updated_at<h.source_updated_at
 or not exists(select 1 from app_private.resource_import_runs where id=sr.import_run_id and completed_at is not null)
 or sr.snapshot->>'status' is distinct from 'Active'
 or coalesce(sr.snapshot->>'setting','')~*'domestic violence'
 or coalesce(sr.snapshot->>'street','')='' or coalesce(sr.snapshot->>'postal_code','')!~'^[0-9]{5}(-[0-9]{4})?$'
 then raise exception 'A subsequent public source snapshot must be reviewed before release'; end if;
 select l.* into loc from app_private.service_locations l join app_private.services s on s.location_id=l.id where s.id=sr.service_id for update of l;
 if not found or loc.street_address is distinct from sr.snapshot->>'street' or loc.city is distinct from sr.snapshot->>'city'
 or loc.state is distinct from sr.snapshot->>'state' or loc.postal_code is distinct from sr.snapshot->>'postal_code'
 or abs(extensions.ST_Y(loc.point::extensions.geometry)-(sr.snapshot->>'latitude')::float8)>0.000001
 or abs(extensions.ST_X(loc.point::extensions.geometry)-(sr.snapshot->>'longitude')::float8)>0.000001
 then raise exception 'Review and reconcile the exact public location while the hold remains active'; end if;
 update app_private.resource_privacy_holds set released_at=now(),released_by=p_reviewer,release_evidence_url=p_evidence where source_id=p_source and source_record_id=p_record;
 update app_private.resource_source_records set record_status='stale_or_needs_review',needs_review=true where source_id=p_source and source_record_id=p_record;
 insert into app_private.resource_privacy_events(source_id,source_record_id,action,import_run_id,actor_id,evidence_url) values(p_source,p_record,'reviewed_release',sr.import_run_id,p_reviewer,p_evidence);
end $$;

-- Defense in depth for all public detail/category/hour/location projections.
-- The source-record guard independently keeps the fixed indexed search function
-- from returning a held site on every future import or ordinary row update.
create or replace view app_private.public_services with(security_barrier=true) as
select s.id,s.organization_id,s.location_id,s.title,s.summary,s.description,s.eligibility_text,s.cost_summary,s.appointment_note,s.contact_phone,s.contact_url,s.source_url,s.source_recorded_at,s.status,s.is_demo,s.updated_at
from app_private.services s join app_private.service_locations l on l.id=s.location_id and l.organization_id=s.organization_id join app_private.organizations o on o.id=s.organization_id
where s.status='published' and l.status='published' and o.status='published' and o.suspended_at is null
and not exists(select 1 from app_private.resource_source_records sr left join app_private.resource_privacy_holds h on h.source_id=sr.source_id and h.source_record_id=sr.source_record_id
 where sr.service_id=s.id and (sr.record_status in ('inactive','suppressed') or (h.source_id is not null and h.released_at is null)));

revoke all on sequence app_private.resource_privacy_events_id_seq from public,our_ground_api;
revoke all on function app_private.resource_privacy_guard(),app_private.resource_privacy_withdraw(uuid,jsonb),app_private.resource_privacy_review_release(text,text,uuid,text) from public,our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on sequence app_private.resource_privacy_events_id_seq from %I',r); execute format('revoke all on function app_private.resource_privacy_guard(),app_private.resource_privacy_withdraw(uuid,jsonb),app_private.resource_privacy_review_release(text,text,uuid,text) from %I',r); end if;
 end loop;
end $$;
