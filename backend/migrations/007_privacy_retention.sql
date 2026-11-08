-- Phase 7C: manually invoked, owner-only retention and verified-request redaction.
-- No scheduler is installed. Dry-run counts contain no record text or contacts.
create or replace function app_private.organization_audit_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
declare owner_role oid;
begin
 select relowner into owner_role from pg_class where oid=TG_RELID;
 if TG_OP='DELETE' and current_setting('ourground.owner_retention',true)='on' and pg_has_role(current_user,owner_role,'USAGE') then return old; end if;
 raise exception using errcode='P0001',message='OG_AUDIT_IMMUTABLE';
end $$;

create or replace function app_private.privacy_retention(p_apply boolean default false,p_reviewer uuid default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare role_owner oid; summary jsonb; old_flag text;
begin
 if p_apply is null then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 select relowner into role_owner from pg_class where oid='app_private.app_users'::regclass;
 if not pg_has_role(current_user,role_owner,'USAGE') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
 if p_apply and not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtext('our-ground-privacy-retention'));
 summary=jsonb_build_object('corrections_deleted',(select count(*) from app_private.correction_reports where created_at<now()-interval '90 days'),
  'rejected_revisions_deleted',(select count(*) from app_private.organization_revisions where status='rejected' and reviewed_at<now()-interval '180 days'),
  'rejected_claims_deleted',(select count(*) from app_private.organization_claims c where status='rejected' and reviewed_at<now()-interval '180 days' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id)),
  'approved_claims_redacted',(select count(*) from app_private.organization_claims where status='approved' and reviewed_at<now()-interval '180 days' and (contact_email<>'withheld@redacted.invalid' or contact_phone is not null or explanation is not null or website_url is not null)),
  'audit_deleted',(select count(*) from app_private.organization_audit where created_at<now()-interval '365 days'));
 if not p_apply then return summary||jsonb_build_object('dry_run',true); end if;
 delete from app_private.correction_reports where created_at<now()-interval '90 days';
 delete from app_private.organization_revisions where status='rejected' and reviewed_at<now()-interval '180 days';
 delete from app_private.organization_claims c where status='rejected' and reviewed_at<now()-interval '180 days' and not exists(select 1 from app_private.organization_listing_access a where a.claim_id=c.id);
 update app_private.organization_claims set contact_email='withheld@redacted.invalid',contact_phone=null,explanation=null,website_url=null where status='approved' and reviewed_at<now()-interval '180 days';
 old_flag=current_setting('ourground.owner_retention',true);perform set_config('ourground.owner_retention','on',true);
 delete from app_private.organization_audit where created_at<now()-interval '365 days';
 perform set_config('ourground.owner_retention',coalesce(old_flag,''),true);
 insert into app_private.organization_audit(actor_id,action,details) values(p_reviewer,'privacy.retention_applied',summary);
 return summary||jsonb_build_object('dry_run',false);
exception when others then perform set_config('ourground.owner_retention',coalesce(old_flag,''),true);raise;
end $$;

create or replace function app_private.privacy_redact_subject(p_subject uuid,p_reviewer uuid,p_apply boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog,app_private as $$
declare role_owner oid; summary jsonb; target record;
begin
 if p_apply is null then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 select relowner into role_owner from pg_class where oid='app_private.app_users'::regclass;
 if not pg_has_role(current_user,role_owner,'USAGE') or p_subject is null or p_reviewer is null or p_subject=p_reviewer or not exists(select 1 from app_private.app_users where id=p_reviewer and role='admin' and account_status='active') then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
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
revoke all on function app_private.privacy_retention(boolean,uuid),app_private.privacy_redact_subject(uuid,uuid,boolean) from public,our_ground_api;
do $$ declare r text;begin foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function app_private.privacy_retention(boolean,uuid),app_private.privacy_redact_subject(uuid,uuid,boolean) from %I',r);end if;end loop;end $$;
