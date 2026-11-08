-- Phase7E additive bounded owner maintenance. Historical007 is unchanged.
-- Policy remains90/180/365 days pending owner confirmation; no schedule/activation.
create index if not exists correction_reports_retention_idx on app_private.correction_reports(created_at,id);
create index if not exists organization_revisions_retention_idx on app_private.organization_revisions(reviewed_at,id) where status='rejected';
create index if not exists organization_claims_rejected_retention_idx on app_private.organization_claims(reviewed_at,id) where status='rejected';
create index if not exists organization_claims_approved_retention_idx on app_private.organization_claims(reviewed_at,id) where status='approved' and (contact_email<>'withheld@redacted.invalid' or contact_phone is not null or explanation is not null or website_url is not null);
create index if not exists organization_listing_access_claim_idx on app_private.organization_listing_access(claim_id);
create index if not exists organization_audit_retention_idx on app_private.organization_audit(created_at,id);

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
 foreach category in array array['corrections_deleted','rejected_revisions_deleted','rejected_claims_deleted','approved_claims_redacted','audit_deleted'] loop
  capacity=least(p_batch_size,remaining_budget);
  case category
   when 'corrections_deleted' then
    statement='select id::text from app_private.correction_reports where created_at<now()-interval ''90 days'' order by created_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.correction_reports where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.correction_reports where created_at<now()-interval ''90 days'')';
   when 'rejected_revisions_deleted' then
    statement='select id::text from app_private.organization_revisions where status=''rejected'' and reviewed_at<now()-interval ''180 days'' order by reviewed_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.organization_revisions where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_revisions where status=''rejected'' and reviewed_at<now()-interval ''180 days'')';
   when 'rejected_claims_deleted' then
    statement='select c.id::text from app_private.organization_claims c where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id) order by reviewed_at,c.id limit $1 for update of c skip locked';
    change_statement='delete from app_private.organization_claims where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_claims c where status=''rejected'' and reviewed_at<now()-interval ''180 days'' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id))';
   when 'approved_claims_redacted' then
    statement='select id::text from app_private.organization_claims where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (contact_email<>''withheld@redacted.invalid'' or contact_phone is not null or explanation is not null or website_url is not null) order by reviewed_at,id limit $1 for update skip locked';
    change_statement='update app_private.organization_claims set contact_email=''withheld@redacted.invalid'',contact_phone=null,explanation=null,website_url=null where id=any($1::uuid[])';
    remaining_statement='select exists(select 1 from app_private.organization_claims where status=''approved'' and reviewed_at<now()-interval ''180 days'' and (contact_email<>''withheld@redacted.invalid'' or contact_phone is not null or explanation is not null or website_url is not null))';
   when 'audit_deleted' then
    statement='select id::text from app_private.organization_audit where created_at<now()-interval ''365 days'' order by created_at,id limit $1 for update skip locked';
    change_statement='delete from app_private.organization_audit where id=any($1::bigint[])';
    remaining_statement='select exists(select 1 from app_private.organization_audit where created_at<now()-interval ''365 days'')';
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
 summary=selected_counts||jsonb_build_object('dry_run',not p_apply,'batch_size',p_batch_size,'total_limit',p_total_limit,'total_planned',total_planned,'total_affected',total_affected,'affected_counts',affected_counts,'remaining',remaining_counts,'has_remaining',any_more,'policy_days',jsonb_build_object('corrections',90,'resolved',180,'audit',365),'audit_appended',case when p_apply then 1 else 0 end);
 if p_apply then insert into app_private.organization_audit(actor_id,action,details) values(p_reviewer,'privacy.retention_applied',summary);end if;
 return summary;
exception when others then perform set_config('ourground.owner_retention',coalesce(old_flag,''),true);raise;
end $$;

-- Compatibility cannot call the historical unbounded implementation.
create or replace function app_private.privacy_retention(p_apply boolean default false,p_reviewer uuid default null) returns jsonb
language sql security invoker set search_path=pg_catalog,app_private as $$select app_private.privacy_retention_bounded(p_apply,p_reviewer,100,500)$$;
revoke all on function app_private.privacy_retention_bounded(boolean,uuid,integer,integer),app_private.privacy_retention(boolean,uuid) from public,our_ground_api;
do $$declare r text;begin foreach r in array array['anon','authenticated']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on function app_private.privacy_retention_bounded(boolean,uuid,integer,integer),app_private.privacy_retention(boolean,uuid) from %I',r);end if;end loop;end $$;
