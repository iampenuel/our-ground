-- Run via psql -X -v ON_ERROR_STOP=1 against the verified production owner session pooler.
-- Every inserted fixture and audit event is rolled back in the same connection.
begin;
select gen_random_uuid() as org, gen_random_uuid() as loc, gen_random_uuid() as service1, gen_random_uuid() as service2 \gset
insert into app_private.organizations(id,name,status,is_demo) values(:'org','Isolated release transaction','published',false);
insert into app_private.service_locations(id,organization_id,site_name,city,state,point,status,is_demo)
values(:'loc',:'org','Isolated release transaction','Harrisburg','PA',extensions.st_setsrid(extensions.st_makepoint(-76.88,40.27),4326)::extensions.geography,'published',false);
insert into app_private.services(id,organization_id,location_id,title,source_url,status,is_demo)
values(:'service1',:'org',:'loc','Isolated release transaction','https://example.invalid/release-fixture','published',false),
      (:'service2',:'org',:'loc','Isolated release transaction','https://example.invalid/release-fixture','published',false);
set local role our_ground_api;
select app_private.public_correction_insert(:'service1','wrong_location','Isolated transaction, always rolled back.',false) as report \gset
reset role;
select directory_ops.resolve_report(:'report','suppressed','PROD-TXN-001');
update app_private.service_locations set status='published' where id=:'loc';
select (not exists(select 1 from app_private.public_service_locations where id=:'loc')
and (select count(*) from app_private.services where location_id=:'loc')=2
and exists(select 1 from directory_ops.review_events where report_id=:'report' and actor=session_user and action='suppressed')
and exists(select 1 from directory_ops.location_holds where location_id=:'loc')
and exists(select 1 from app_private.correction_reports where id=:'report' and status='resolved')) as suppression_pass;
rollback;
select (not exists(select 1 from app_private.organizations where id=:'org')
and not exists(select 1 from app_private.services where id=:'service1')
and not exists(select 1 from app_private.correction_reports where id=:'report')
and not exists(select 1 from directory_ops.review_events where report_id=:'report')
and not exists(select 1 from directory_ops.location_holds where location_id=:'loc')) as rollback_pass;
