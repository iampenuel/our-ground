-- Phase7E owner-confirmed resolution-age policy and explicit preservation holds.
-- Additive to frozen007/012. No scheduler/activation; owner dry-run only until
-- a separately approved destructive operation. Existing public records remain.
create table app_private.privacy_retention_holds (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('global','subject','organization','service','correction','claim','revision','audit')),
 target_id text not null,
 reason_code text not null check(reason_code in ('legal','investigation')),
 reference text not null check(length(reference) between 1 and 160 and reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/ -]*$'),
 created_by uuid not null references app_private.app_users(id), created_at timestamptz not null default now(),
 released_by uuid references app_private.app_users(id), released_at timestamptz,
 check((released_by is null)=(released_at is null)),
 check((scope='global' and target_id='all') or (scope='audit' and target_id ~ '^[1-9][0-9]{0,18}$') or (scope not in ('global','audit') and target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create unique index privacy_retention_holds_active_idx on app_private.privacy_retention_holds(scope,target_id) where released_at is null;
alter table app_private.privacy_retention_holds enable row level security;
revoke all on app_private.privacy_retention_holds from public,our_ground_api;
create index organization_revisions_approved_retention_idx on app_private.organization_revisions(reviewed_at,id) where status='approved';
create index correction_reports_resolution_retention_idx on app_private.correction_reports(resolved_at,id) where status='resolved' and resolved_at is not null;

-- Internal owner-only predicate; related UUID protects audit targets even when
-- historical action-specific target type was not recorded separately.
create function app_private.privacy_record_held(p_kind text,p_id text,p_subject uuid,p_organization uuid,p_service uuid,p_related uuid default null)
returns boolean language sql stable security invoker set search_path=pg_catalog,app_private as $$
 select exists(select 1 from app_private.privacy_retention_holds h where h.released_at is null and (
  h.scope='global' or (h.scope=p_kind and h.target_id=p_id)
  or (h.scope='subject' and h.target_id=p_subject::text)
  or (h.scope='organization' and h.target_id=p_organization::text)
  or (h.scope='service' and h.target_id=p_service::text)
  or (p_kind='audit' and p_related is not null and (h.target_id=p_related::text or h.id=p_related))
 ))
$$;

-- Audit actions historically store a claim/revision UUID as target_id. Resolve
-- its subject/site with typed joins so a hold protects associated audit evidence.
create function app_private.privacy_audit_held(p_audit bigint) returns boolean
language sql stable security invoker set search_path=pg_catalog,app_private as $$
 select exists(select 1 from app_private.organization_audit a
 left join app_private.organization_claims c on c.id=a.target_id
 left join app_private.organization_revisions r on r.id=a.target_id
 left join app_private.services s on s.id=coalesce(c.service_id,r.service_id,case when coalesce(a.details->>'service_id','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (a.details->>'service_id')::uuid end,a.target_id)
 where a.id=p_audit and (
 app_private.privacy_record_held('audit',a.id::text,coalesce(c.user_id,r.user_id,a.actor_id),coalesce(a.organization_id,r.organization_id,s.organization_id),s.id,a.target_id)
 or app_private.privacy_record_held('audit',a.id::text,a.actor_id,coalesce(a.organization_id,r.organization_id,s.organization_id),s.id,a.target_id)))
$$;

-- Hold writes and maintenance share one transaction lock. Only the owner role
-- with a current active administrator may create/release a preservation hold.
create function app_private.privacy_hold_set(p_reviewer uuid,p_scope text,p_target text,p_reason text,p_reference text,p_release boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare role_owner oid; hold_id uuid; target_exists boolean:=false;
begin
 select relowner into role_owner from pg_class where oid='app_private.app_users'::regclass;
 if not pg_has_role(current_user,role_owner,'USAGE') or not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED';end if;
 if p_release is null or p_scope is null or p_target is null or p_reason is null or p_reference is null
  or p_scope not in ('global','subject','organization','service','correction','claim','revision','audit') or p_reason not in ('legal','investigation')
  or length(p_reference) not between 1 and 160 or p_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/ -]*$'
  or not ((p_scope='global' and p_target='all') or (p_scope='audit' and p_target ~ '^[1-9][0-9]{0,18}$') or (p_scope not in ('global','audit') and p_target ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';end if;
 if not pg_try_advisory_xact_lock(hashtext('our-ground-privacy-retention')) then raise exception using errcode='P0001',message='OG_MAINTENANCE_BUSY';end if;
 if p_release then
  update app_private.privacy_retention_holds set released_at=now(),released_by=p_reviewer where scope=p_scope and target_id=p_target and reason_code=p_reason and reference=p_reference and released_at is null returning id into hold_id;
  if hold_id is null then raise exception using errcode='P0001',message='OG_NOT_FOUND';end if;
 else
  case p_scope
   when 'global' then target_exists=true;
   when 'subject' then select exists(select 1 from app_private.app_users where id=p_target::uuid) into target_exists;
   when 'organization' then select exists(select 1 from app_private.organizations where id=p_target::uuid) into target_exists;
   when 'service' then select exists(select 1 from app_private.services where id=p_target::uuid) into target_exists;
   when 'correction' then select exists(select 1 from app_private.correction_reports where id=p_target::uuid) into target_exists;
   when 'claim' then select exists(select 1 from app_private.organization_claims where id=p_target::uuid) into target_exists;
   when 'revision' then select exists(select 1 from app_private.organization_revisions where id=p_target::uuid) into target_exists;
   when 'audit' then select exists(select 1 from app_private.organization_audit where id=p_target::bigint) into target_exists;
  end case;
  if not target_exists then raise exception using errcode='P0001',message='OG_NOT_FOUND';end if;
  if exists(select 1 from app_private.privacy_retention_holds where scope=p_scope and target_id=p_target and released_at is null) then raise exception using errcode='P0001',message='OG_CONFLICT';end if;
  insert into app_private.privacy_retention_holds(scope,target_id,reason_code,reference,created_by) values(p_scope,p_target,p_reason,p_reference,p_reviewer) returning id into hold_id;
 end if;
 insert into app_private.organization_audit(actor_id,action,target_id,details) values(p_reviewer,case when p_release then 'privacy.hold_released' else 'privacy.hold_created' end,hold_id,jsonb_build_object('scope',p_scope,'reason_code',p_reason));
 return jsonb_build_object('hold_id',hold_id,'scope',p_scope,'active',not p_release);
end $$;

create or replace function app_private.privacy_retention_bounded(p_apply boolean default false,p_reviewer uuid default null,p_batch_size integer default 100,p_total_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare
 role_owner oid; old_flag text:=current_setting('ourground.owner_retention',true);
 category text; statement text; change_statement text; remaining_statement text;
 ids text[]; planned_ids text[]; capacity integer; planned integer; affected integer;
 remaining_budget integer:=p_total_limit; total_planned integer:=0;total_affected integer:=0;more boolean;any_more boolean:=false;
 selected_counts jsonb:='{}'; affected_counts jsonb:='{}'; remaining_counts jsonb:='{}'; summary jsonb;
begin
 if p_apply is null or p_batch_size is null or p_total_limit is null or p_batch_size<1 or p_batch_size>1000 or p_total_limit<1 or p_total_limit>5000 then
  raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';
 end if;
 select relowner into role_owner from pg_class where oid='app_private.app_users'::regclass;
 if not pg_has_role(current_user,role_owner,'USAGE') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED';end if;
 if p_apply and not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED';end if;
 if not pg_try_advisory_xact_lock(hashtext('our-ground-privacy-retention')) then raise exception using errcode='P0001',message='OG_MAINTENANCE_BUSY';end if;
 foreach category in array array['corrections_deleted','rejected_revisions_deleted','rejected_claims_deleted','approved_claims_redacted','approved_revisions_redacted','audit_deleted'] loop
  capacity=least(p_batch_size,remaining_budget);
  case category
   when 'corrections_deleted' then
    statement='select id::text from app_private.correction_reports where status=''resolved'' and resolved_at is not null and resolved_at<now()-interval ''90 days'' and not app_private.privacy_record_held(''correction'',id::text,null,(select organization_id from app_private.services where id=service_id),service_id) order by resolved_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.correction_reports where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.correction_reports where status=''resolved'' and resolved_at is not null and resolved_at<now()-interval ''90 days'' and not app_private.privacy_record_held(''correction'',id::text,null,(select organization_id from app_private.services where id=service_id),service_id))';
   when 'rejected_revisions_deleted' then
    statement='select id::text from app_private.organization_revisions where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not app_private.privacy_record_held(''revision'',id::text,user_id,organization_id,service_id) order by reviewed_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.organization_revisions where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_revisions where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not app_private.privacy_record_held(''revision'',id::text,user_id,organization_id,service_id))';
   when 'rejected_claims_deleted' then
    statement='select c.id::text from app_private.organization_claims c where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id) and not app_private.privacy_record_held(''claim'',c.id::text,c.user_id,(select organization_id from app_private.services where id=c.service_id),c.service_id) order by reviewed_at,c.id limit $1 for update of c skip locked';
    change_statement='delete from app_private.organization_claims where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_claims c where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id) and not app_private.privacy_record_held(''claim'',c.id::text,c.user_id,(select organization_id from app_private.services where id=c.service_id),c.service_id))';
   when 'approved_claims_redacted' then
    statement='select id::text from app_private.organization_claims where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (contact_email<>''withheld@redacted.invalid'' or contact_phone is not null or explanation is not null or website_url is not null or evidence_url is not null or review_note is distinct from ''Private claim content minimized after retention period.'' or organization_name<>''Withheld private claim'' or location<>''Withheld private location'' or applicant_role<>''Withheld'') and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=organization_claims.id) and not exists(select 1 from app_private.organization_memberships m join app_private.services s on s.organization_id=m.organization_id where s.id=organization_claims.service_id and m.user_id=organization_claims.user_id) and not app_private.privacy_record_held(''claim'',id::text,user_id,(select organization_id from app_private.services where id=service_id),service_id) order by reviewed_at,id limit $1 for update skip locked';
    change_statement='update app_private.organization_claims set contact_email=''withheld@redacted.invalid'',contact_phone=null,explanation=null,website_url=null,evidence_url=null,review_note=''Private claim content minimized after retention period.'',organization_name=''Withheld private claim'',location=''Withheld private location'',applicant_role=''Withheld'' where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_claims where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (contact_email<>''withheld@redacted.invalid'' or contact_phone is not null or explanation is not null or website_url is not null or evidence_url is not null or review_note is distinct from ''Private claim content minimized after retention period.'' or organization_name<>''Withheld private claim'' or location<>''Withheld private location'' or applicant_role<>''Withheld'') and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=organization_claims.id) and not exists(select 1 from app_private.organization_memberships m join app_private.services s on s.organization_id=m.organization_id where s.id=organization_claims.service_id and m.user_id=organization_claims.user_id) and not app_private.privacy_record_held(''claim'',id::text,user_id,(select organization_id from app_private.services where id=service_id),service_id))';
   when 'approved_revisions_redacted' then
    statement='select id::text from app_private.organization_revisions where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (patch<>''{"retained_metadata_only":true}''::jsonb or before_snapshot<>''{}''::jsonb or review_note is distinct from ''Private proposal content minimized after retention period.'') and not exists(select 1 from app_private.services s where s.id=organization_revisions.service_id and s.version=organization_revisions.expected_version+1) and not exists(select 1 from app_private.organization_memberships m where m.organization_id=organization_revisions.organization_id and m.user_id=organization_revisions.user_id) and not exists(select 1 from app_private.organization_listing_access a where a.service_id=organization_revisions.service_id and a.user_id=organization_revisions.user_id) and not app_private.privacy_record_held(''revision'',id::text,user_id,organization_id,service_id) order by reviewed_at,id limit $1 for update skip locked';
    change_statement='update app_private.organization_revisions set patch=''{"retained_metadata_only":true}''::jsonb,before_snapshot=''{}''::jsonb,review_note=''Private proposal content minimized after retention period.'' where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_revisions where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (patch<>''{"retained_metadata_only":true}''::jsonb or before_snapshot<>''{}''::jsonb or review_note is distinct from ''Private proposal content minimized after retention period.'') and not exists(select 1 from app_private.services s where s.id=organization_revisions.service_id and s.version=organization_revisions.expected_version+1) and not exists(select 1 from app_private.organization_memberships m where m.organization_id=organization_revisions.organization_id and m.user_id=organization_revisions.user_id) and not exists(select 1 from app_private.organization_listing_access a where a.service_id=organization_revisions.service_id and a.user_id=organization_revisions.user_id) and not app_private.privacy_record_held(''revision'',id::text,user_id,organization_id,service_id))';
   when 'audit_deleted' then
    statement='select id::text from app_private.organization_audit where created_at<now()-interval ''365 days'' and not app_private.privacy_audit_held(id) order by created_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.organization_audit where id=any($1::bigint[])';
    remaining_statement='select exists(select 1 from app_private.organization_audit where created_at<now()-interval ''365 days'' and not app_private.privacy_audit_held(id))';
  end case;
  execute 'select array('||statement||')' into ids using capacity+1;
  planned=least(capacity,coalesce(cardinality(ids),0));planned_ids=ids[1:planned];
  selected_counts=selected_counts||jsonb_build_object(category,planned);total_planned=total_planned+planned;remaining_budget=remaining_budget-planned;
  affected=0;
  if p_apply and planned>0 then
   if category='audit_deleted' then perform set_config('ourground.owner_retention','on',true);end if;
   execute change_statement using planned_ids;get diagnostics affected=ROW_COUNT;
   if category='audit_deleted' then perform set_config('ourground.owner_retention',coalesce(old_flag,''),true);end if;
  end if;
  affected_counts=affected_counts||jsonb_build_object(category,affected);total_affected=total_affected+affected;
  execute remaining_statement into more;remaining_counts=remaining_counts||jsonb_build_object(category,more);any_more=any_more or more;
 end loop;
 summary=selected_counts||jsonb_build_object('dry_run',not p_apply,'batch_size',p_batch_size,'total_limit',p_total_limit,'total_planned',total_planned,'total_affected',total_affected,'affected_counts',affected_counts,'remaining',remaining_counts,'has_remaining',any_more,'policy_days',jsonb_build_object('corrections_after_resolution',90,'claims_revisions_after_resolution',180,'audit',365),'hold_policy','active_legal_and_investigation_holds_preserved','audit_appended',case when p_apply then 1 else 0 end);
 if p_apply then insert into app_private.organization_audit(actor_id,action,details) values(p_reviewer,'privacy.retention_applied',summary);end if;
 return summary;
exception when others then perform set_config('ourground.owner_retention',coalesce(old_flag,''),true);raise;
end $$;

-- Compatibility cannot call the historical unbounded implementation.
create or replace function app_private.privacy_retention(p_apply boolean default false,p_reviewer uuid default null) returns jsonb
language sql security invoker set search_path=pg_catalog,app_private as $$select app_private.privacy_retention_bounded(p_apply,p_reviewer,100,500)$$;
revoke all on function app_private.privacy_retention_bounded(boolean,uuid,integer,integer),app_private.privacy_retention(boolean,uuid) from public,our_ground_api;
do $$declare r text;begin foreach r in array array['anon','authenticated']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on function app_private.privacy_retention_bounded(boolean,uuid,integer,integer),app_private.privacy_retention(boolean,uuid) from %I',r);end if;end loop;end $$;
create or replace function app_private.privacy_redact_subject(p_subject uuid,p_reviewer uuid,p_apply boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare role_owner oid; summary jsonb; target record;
begin
 if p_apply is null then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 select relowner into role_owner from pg_class where oid='app_private.app_users'::regclass;
 if not pg_has_role(current_user,role_owner,'USAGE') or p_subject is null or p_reviewer is null or p_subject=p_reviewer or not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
 if not pg_try_advisory_xact_lock(hashtext('our-ground-privacy-retention')) then raise exception using errcode='P0001',message='OG_MAINTENANCE_BUSY';end if;
 if app_private.privacy_record_held('subject',p_subject::text,p_subject,null,null)
   or exists(select 1 from app_private.organization_claims c where c.user_id=p_subject and app_private.privacy_record_held('claim',c.id::text,p_subject,(select organization_id from app_private.services where id=c.service_id),c.service_id))
   or exists(select 1 from app_private.organization_revisions r where r.user_id=p_subject and app_private.privacy_record_held('revision',r.id::text,p_subject,r.organization_id,r.service_id))
   or exists(select 1 from app_private.organization_memberships m where m.user_id=p_subject and app_private.privacy_record_held('subject',p_subject::text,p_subject,m.organization_id,null))
   or exists(select 1 from app_private.organization_audit a where (a.actor_id=p_subject or a.target_id=p_subject) and app_private.privacy_audit_held(a.id))
 then raise exception using errcode='P0001',message='OG_RETENTION_HOLD';end if;
 perform 1 from app_private.app_users where id=p_subject for update;
 if not found then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
 summary=jsonb_build_object('claims_redacted',(select count(*) from app_private.organization_claims where user_id=p_subject),
   'revision_history_minimized',(select count(*) from app_private.organization_revisions where user_id=p_subject),
   'memberships_revoked',(select count(*) from app_private.organization_memberships where user_id=p_subject));
 if not p_apply then return summary||jsonb_build_object('dry_run',true); end if;
 for target in select organization_id from app_private.organization_memberships where user_id=p_subject loop
   insert into app_private.organization_audit(actor_id,action,target_id,organization_id,details) values(p_reviewer,'membership.revoked',p_subject,target.organization_id,jsonb_build_object('method','verified-owner-privacy-request'));
 end loop;
 delete from app_private.organization_memberships where user_id=p_subject;
 update app_private.app_users set account_status='suspended' where id=p_subject;
 -- Resolve pending requests as rejected so redacted text cannot later publish.
 update app_private.organization_claims set contact_email='withheld@redacted.invalid',contact_phone=null,explanation=null,website_url=null,
   status=case when status='pending' then 'rejected' else status end,
   reviewer_id=case when status='pending' then p_reviewer else reviewer_id end,
   reviewed_at=case when status='pending' then now() else reviewed_at end,
   review_note='Personal information withheld following a verified privacy request.' where user_id=p_subject;
 update app_private.organization_revisions set patch='{"retained_metadata_only":true}'::jsonb,before_snapshot='{}'::jsonb,
   status=case when status='pending' then 'rejected' else status end,
   reviewer_id=case when status='pending' then p_reviewer else reviewer_id end,
   reviewed_at=case when status='pending' then now() else reviewed_at end,
   review_note='Proposal content withheld following a verified privacy request.' where user_id=p_subject;
 insert into app_private.organization_audit(actor_id,action,target_id,details) values(p_reviewer,'privacy.subject_redacted',p_subject,summary);
 return summary||jsonb_build_object('dry_run',false);
end $$;

-- Ordinary audit erasure is still denied. Even owner maintenance cannot erase
-- an explicitly held audit through the maintenance flag.
create or replace function app_private.organization_audit_immutable() returns trigger language plpgsql set search_path=pg_catalog,app_private as $$
declare owner_role oid;
begin
 if TG_RELID<>'app_private.organization_audit'::regclass then raise exception using errcode='P0001',message='OG_AUDIT_IMMUTABLE';end if;
 select relowner into owner_role from pg_class where oid=TG_RELID;
 if TG_OP='DELETE' and current_setting('ourground.owner_retention',true)='on' and pg_has_role(current_user,owner_role,'USAGE') then
  if app_private.privacy_audit_held(old.id) then raise exception using errcode='P0001',message='OG_RETENTION_HOLD';end if;
  return old;
 end if;
 raise exception using errcode='P0001',message='OG_AUDIT_IMMUTABLE';
end $$;

revoke all on function app_private.privacy_record_held(text,text,uuid,uuid,uuid,uuid),app_private.privacy_audit_held(bigint),app_private.privacy_hold_set(uuid,text,text,text,text,boolean),app_private.privacy_redact_subject(uuid,uuid,boolean) from public,our_ground_api;
do $$declare r text;begin foreach r in array array['anon','authenticated']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on app_private.privacy_retention_holds from %I',r);execute format('revoke all on function app_private.privacy_record_held(text,text,uuid,uuid,uuid,uuid),app_private.privacy_audit_held(bigint),app_private.privacy_hold_set(uuid,text,text,text,text,boolean),app_private.privacy_redact_subject(uuid,uuid,boolean) from %I',r);end if;end loop;end $$;
