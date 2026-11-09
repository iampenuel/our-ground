-- Phase 7C: private operation boundary. No browser Data API access.
-- Apply as the reviewed migration owner. Original 001-005 files are unchanged.
alter table app_private.app_users add column if not exists account_status text not null default 'active' check(account_status in ('active','suspended'));
alter table app_private.organizations add column if not exists suspended_at timestamptz;
alter table app_private.organization_audit add column if not exists request_id uuid not null default gen_random_uuid();
alter table app_private.organization_audit add column if not exists result text not null default 'allowed' check(result in ('allowed','denied'));
alter table app_private.organization_audit add column if not exists organization_id uuid references app_private.organizations(id);

-- These base relations are never a runtime or browser read API. RLS denies
-- ordinary direct access; reviewed operations below are owner-executed and
-- enforce their own scope. This is not auth.uid()-based tenant RLS.
do $$ declare t text; begin
 foreach t in array array['app_users','organizations','organization_memberships','service_locations','services','categories','service_categories','opening_hours','correction_reports','campaigns','organization_claims','organization_listing_access','organization_revisions','organization_audit','organization_revoked_sessions','organization_action_limits'] loop
   execute format('alter table app_private.%I enable row level security',t);
   execute format('revoke all on app_private.%I from public,our_ground_api',t);
 end loop;
end $$;

-- Security-barrier projections contain public, published columns only. The
-- view owner is the migration owner; the runtime role owns no base relations.
create or replace view app_private.public_services with(security_barrier=true) as
select s.id,s.organization_id,s.location_id,s.title,s.summary,s.description,s.eligibility_text,s.cost_summary,s.appointment_note,s.contact_phone,s.contact_url,s.source_url,s.source_recorded_at,s.status,s.is_demo,s.updated_at
from app_private.services s join app_private.service_locations l on l.id=s.location_id and l.organization_id=s.organization_id join app_private.organizations o on o.id=s.organization_id
where s.status='published' and l.status='published' and o.status='published' and o.suspended_at is null;
create or replace view app_private.public_service_locations with(security_barrier=true) as
select l.id,l.organization_id,l.site_name,l.street_address,l.city,l.state,l.postal_code,l.point,l.source_url,l.source_recorded_at,l.status,l.is_demo,l.updated_at
from app_private.service_locations l where l.status='published' and exists(select 1 from app_private.public_services s where s.location_id=l.id);
create or replace view app_private.public_organizations with(security_barrier=true) as
select o.id,o.name,o.description,o.website_url,o.public_phone,o.status,o.is_demo,o.updated_at from app_private.organizations o where o.status='published' and o.suspended_at is null and exists(select 1 from app_private.public_services s where s.organization_id=o.id);
create or replace view app_private.public_categories with(security_barrier=true) as select id,slug,name from app_private.categories;
create or replace view app_private.public_service_categories with(security_barrier=true) as select sc.service_id,sc.category_id from app_private.service_categories sc where exists(select 1 from app_private.public_services s where s.id=sc.service_id);
create or replace view app_private.public_opening_hours with(security_barrier=true) as select h.service_id,h.weekday,h.opens_at,h.closes_at,h.notes,h.sequence from app_private.opening_hours h where exists(select 1 from app_private.public_services s where s.id=h.service_id);
revoke all on app_private.public_services,app_private.public_service_locations,app_private.public_organizations,app_private.public_categories,app_private.public_service_categories,app_private.public_opening_hours from public;
grant select on app_private.public_services,app_private.public_service_locations,app_private.public_organizations,app_private.public_categories,app_private.public_service_categories,app_private.public_opening_hours to our_ground_api;

create or replace function app_private.public_correction_insert(p_service uuid,p_reason text,p_description text,p_allow_demo boolean) returns uuid language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare target uuid;
begin
 if p_reason not in ('wrong_hours','closed','wrong_contact','wrong_eligibility','wrong_location','other') or (p_description is not null and length(p_description)>1000) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 insert into app_private.correction_reports(service_id,reason_code,description)
 select s.id,p_reason,p_description from app_private.public_services s join app_private.public_service_locations l on l.id=s.location_id join app_private.public_organizations o on o.id=s.organization_id
 where s.id=p_service and (p_allow_demo or not(s.is_demo or l.is_demo or o.is_demo)) returning id into target;
 return target;
end $$;
revoke all on function app_private.public_correction_insert(uuid,text,text,boolean) from public;
grant execute on function app_private.public_correction_insert(uuid,text,text,boolean) to our_ground_api;

-- Preserve the reviewed Phase 7B state machine behind a context-checking entry.
do $$ begin
 if to_regprocedure('app_private.organization_command_v7b(uuid,text,jsonb)') is null then
   alter function app_private.organization_command(uuid,text,jsonb) rename to organization_command_v7b;
 end if;
end $$;
revoke all on function app_private.organization_command_v7b(uuid,text,jsonb) from public,our_ground_api;

create or replace function app_private.organization_audit_stamp() returns trigger language plpgsql set search_path=pg_catalog,app_private as $$
begin
 new.request_id=coalesce(nullif(current_setting('ourground.request_id',true),'')::uuid,new.request_id,gen_random_uuid());
 new.details=coalesce(new.details,'{}'::jsonb)-'review_note';
 if new.organization_id is null and new.details ? 'service_id' then select organization_id into new.organization_id from app_private.services where id=(new.details->>'service_id')::uuid; end if;
 return new;
end $$;
drop trigger if exists organization_audit_stamp on app_private.organization_audit;
create trigger organization_audit_stamp before insert on app_private.organization_audit for each row execute function app_private.organization_audit_stamp();

create or replace function app_private.organization_command(p_actor uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare a text; h text; req text; active boolean; administrator boolean; org_id uuid; owner_id uuid; response jsonb; reason text; changed uuid;
begin
 a=current_setting('ourground.actor_id',true); h=current_setting('ourground.session_hash',true); req=current_setting('ourground.request_id',true);
 if a is null or a='' or a<>p_actor::text or h is null or h !~ '^[a-f0-9]{64}$' or req is null or req !~ '^[a-f0-9-]{36}$' then raise exception using errcode='P0001',message='OG_REQUEST_CONTEXT_REQUIRED'; end if;
 -- A share lock makes suspension concurrent with this operation serialize.
 if p_action='session.revoke' then
   select u.account_status='active',u.role='admin' into active,administrator from app_private.app_users u where u.id=p_actor for update;
 else
   select u.account_status='active',u.role='admin' into active,administrator from app_private.app_users u where u.id=p_actor for share;
 end if;
 if not found then raise exception using errcode='P0001',message='OG_SESSION_EXPIRED'; end if;
 if p_action='session.check' then
   return jsonb_build_object('active',active and not exists(select 1 from app_private.organization_revoked_sessions rs where rs.session_hash=h and rs.user_id=p_actor));
 end if;
 if not active then raise exception using errcode='P0001',message='OG_ACCOUNT_SUSPENDED'; end if;
 if exists(select 1 from app_private.organization_revoked_sessions rs where rs.session_hash=h and rs.user_id=p_actor) then raise exception using errcode='P0001',message='OG_SESSION_EXPIRED'; end if;
 if p_action='session.revoke' and p_input->>'session_hash' is distinct from h then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 if p_action like 'admin.%' and not administrator then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
 if p_action='admin.suspend' then
   if not(p_input ?& array['target_type','target_id','suspended','review_note']) or jsonb_typeof(p_input->'review_note') is distinct from 'string' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('target_type','target_id','suspended','review_note')) or p_input->>'target_type' not in ('user','organization') or jsonb_typeof(p_input->'suspended') is distinct from 'boolean' or length(trim(p_input->>'review_note')) not between 5 and 1000 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
   changed=(p_input->>'target_id')::uuid;
   if changed is null then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
   if not app_private.organization_limit('mutation:'||p_actor::text,60,3600) then raise exception using errcode='P0001',message='OG_RATE_LIMITED'; end if;
   if p_input->>'target_type'='user' then
     if changed=p_actor then raise exception using errcode='P0001',message='OG_SELF_REVIEW'; end if;
     update app_private.app_users set account_status=case when (p_input->>'suspended')::boolean then 'suspended' else 'active' end where id=changed;
   else
     update app_private.organizations set suspended_at=case when (p_input->>'suspended')::boolean then clock_timestamp() else null end where id=changed;
   end if;
   if not found then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
   insert into app_private.organization_audit(actor_id,action,target_id,organization_id,details) values(p_actor,(p_input->>'target_type')||case when (p_input->>'suspended')::boolean then '.suspended' else '.resumed' end,changed,case when p_input->>'target_type'='organization' then changed else null end,jsonb_build_object('status',case when (p_input->>'suspended')::boolean then 'suspended' else 'active' end));
   return jsonb_build_object('target_id',changed,'suspended',(p_input->>'suspended')::boolean);
 end if;
 -- Lock the affected organization and live membership before sensitive writes.
 if p_action in ('listings.get','revisions.create') then
   select s.organization_id into org_id from app_private.services s where s.id=(p_input->>'service_id')::uuid;
 elsif p_action='admin.claim.decide' and p_input->>'decision'='approved' then
   select s.organization_id into org_id from app_private.services s where s.id=(p_input->>'service_id')::uuid;
   select c.user_id into owner_id from app_private.organization_claims c where c.id=(p_input->>'claim_id')::uuid;
 elsif p_action='admin.revision.decide' then
   select r.organization_id,r.user_id into org_id,owner_id from app_private.organization_revisions r where r.id=(p_input->>'revision_id')::uuid;
 elsif p_action='admin.access.revoke' then org_id=(p_input->>'organization_id')::uuid;
 end if;
 if org_id is not null then
   perform 1 from app_private.organizations o where o.id=org_id and o.suspended_at is null for share;
   if not found and p_action not in ('admin.access.revoke','admin.revision.decide') then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
   if not found and p_action='admin.revision.decide' and p_input->>'decision'='approved' then raise exception using errcode='P0001',message='OG_ACCESS_REVOKED'; end if;
   if p_action='revisions.create' and not administrator then
     perform 1 from app_private.organization_memberships m where m.organization_id=org_id and m.user_id=p_actor for share;
     if not found then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
   end if;
   if owner_id is not null and p_input->>'decision'='approved' then
     perform 1 from app_private.app_users u where u.id=owner_id and u.account_status='active' for share;
     if not found then raise exception using errcode='P0001',message='OG_ACCESS_REVOKED'; end if;
   end if;
 end if;
 if p_action='admin.claim.decide' and p_input->>'decision'='approved' then
   -- Serialize grants for this exact object, including two distinct pending claims.
   perform 1 from app_private.services where id=(p_input->>'service_id')::uuid for update;
   if exists(select 1 from app_private.organization_listing_access a where a.service_id=(p_input->>'service_id')::uuid and a.user_id=owner_id) then raise exception using errcode='P0001',message='OG_CONFLICT'; end if;
 end if;
 response=app_private.organization_command_v7b(p_actor,p_action,p_input);
 if p_action='revisions.list' then
   -- Authors retain their own proposal/status, not the full organization baseline
   -- captured for privileged review. This also applies after access revocation.
   response=jsonb_build_object('items',coalesce((select jsonb_agg(x-'before_snapshot'-'current') from jsonb_array_elements(response->'items') x),'[]'::jsonb));
 elsif p_action='claims.list' then
   response=jsonb_build_object('items',coalesce((select jsonb_agg(case when exists(select 1 from app_private.services s join app_private.organizations o on o.id=s.organization_id where s.id=(x->>'service_id')::uuid and o.suspended_at is not null) then jsonb_set(x,'{access_active}','false') else x end) from jsonb_array_elements(response->'items') x),'[]'::jsonb));
 elsif p_action='listings.list' and not administrator then
   response=jsonb_build_object('items',coalesce((select jsonb_agg(x) from jsonb_array_elements(response->'items') x where exists(select 1 from app_private.organizations o where o.id=(x->>'organization_id')::uuid and o.suspended_at is null)),'[]'::jsonb));
 elsif p_action='account.get' then
   response=jsonb_set(response,'{organizations}',coalesce((select jsonb_agg(x) from jsonb_array_elements(response->'organizations') x where exists(select 1 from app_private.organizations o where o.id=(x->>'id')::uuid and o.suspended_at is null)),'[]'::jsonb));
 elsif p_action='admin.queue' then
   response=response||jsonb_build_object('suspended_users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'account_status',u.account_status)) from app_private.app_users u where u.account_status='suspended'),'[]'::jsonb),'suspended_organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name)) from app_private.organizations o where o.suspended_at is not null),'[]'::jsonb));
 end if;
 if p_action='admin.claim.decide' and p_input->>'decision'='approved' then
   insert into app_private.organization_audit(actor_id,action,target_id,organization_id,details) values(p_actor,'membership.granted',(response->>'service_id')::uuid,org_id,jsonb_build_object('user_id',response->>'user_id'));
 elsif p_action='admin.revision.decide' and p_input->>'decision'='approved' then
   insert into app_private.organization_audit(actor_id,action,target_id,organization_id,details) values(p_actor,'published_record.updated',(response->>'service_id')::uuid,org_id,'{}');
 end if;
 return response;
exception when invalid_text_representation or not_null_violation or check_violation then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';
end $$;
revoke all on function app_private.organization_command(uuid,text,jsonb),app_private.organization_audit_stamp() from public,our_ground_api;

create or replace function app_private.organization_request(p_actor uuid,p_action text,p_input jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare response jsonb; old_actor text; old_session text; old_request text;
begin
 if p_actor is null or p_request_id is null or coalesce(p_session_hash,'')!~ '^[a-f0-9]{64}$' then raise exception using errcode='P0001',message='OG_REQUEST_CONTEXT_REQUIRED'; end if;
 insert into app_private.app_users(id) values(p_actor) on conflict(id) do nothing;
 old_actor=current_setting('ourground.actor_id',true);old_session=current_setting('ourground.session_hash',true);old_request=current_setting('ourground.request_id',true);
 perform set_config('ourground.actor_id',p_actor::text,true);perform set_config('ourground.session_hash',p_session_hash,true);perform set_config('ourground.request_id',p_request_id::text,true);
 response=app_private.organization_command(p_actor,p_action,p_input);
 perform set_config('ourground.actor_id',coalesce(old_actor,''),true);perform set_config('ourground.session_hash',coalesce(old_session,''),true);perform set_config('ourground.request_id',coalesce(old_request,''),true);
 return response;
exception when others then
 perform set_config('ourground.actor_id',coalesce(old_actor,''),true);perform set_config('ourground.session_hash',coalesce(old_session,''),true);perform set_config('ourground.request_id',coalesce(old_request,''),true);raise;
end $$;
revoke all on function app_private.organization_request(uuid,text,jsonb,uuid,text) from public;
grant execute on function app_private.organization_request(uuid,text,jsonb,uuid,text) to our_ground_api;

-- A denied operation's transaction has rolled back. The trusted API may append
-- this minimal, rate-bounded event in a separate statement, without payload text.
create or replace function app_private.security_audit_failure(p_actor uuid,p_action text,p_target uuid,p_request uuid,p_session_hash text) returns boolean language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
 if p_actor is null or p_request is null or coalesce(p_session_hash,'')!~ '^[a-f0-9]{64}$' or coalesce(p_action,'')!~ '^[a-zA-Z0-9./:_-]{1,100}$' or not exists(select 1 from app_private.app_users where id=p_actor) then return false; end if;
 if not app_private.organization_limit('audit-denied:'||p_actor::text,60,3600) then return false; end if;
 insert into app_private.organization_audit(actor_id,action,target_id,request_id,result,details) values(p_actor,'security.permission_denied',p_target,p_request,'denied',jsonb_build_object('operation',p_action));
 return true;
end $$;
revoke all on function app_private.security_audit_failure(uuid,text,uuid,uuid,text) from public;
grant execute on function app_private.security_audit_failure(uuid,text,uuid,uuid,text) to our_ground_api;

-- Supabase browser roles cannot inherit accidentally created grants.
do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then
  execute format('revoke all on schema app_private from %I',r);
  execute format('revoke all on all tables in schema app_private from %I',r);
  execute format('revoke all on all sequences in schema app_private from %I',r);
  execute format('revoke all on all functions in schema app_private from %I',r);
 end if;
end loop;end $$;
