-- Common search names for specific Census places. Preserve publisher names and points.
alter table app_private.geographic_reference_names drop constraint geographic_reference_names_name_kind_check;
alter table app_private.geographic_reference_names add check(name_kind in ('canonical','lsad_short','state_code','common_name'));
insert into app_private.geographic_reference_names(record_id,state,kind,name,normalized_name,name_kind)
select g.id,g.state,g.kind,a.name,app_private.geographic_reference_normalize(a.name),'common_name'
from (values ('1571550','Urban Honolulu CDP','Honolulu'),('1608830','Boise City city','Boise'),
 ('1836003','Indianapolis city (balance)','Indianapolis'),('4752006','Nashville-Davidson metropolitan government (balance)','Nashville')) a(geoid,canonical,name)
join app_private.geographic_reference_records g on g.kind='place' and g.vintage=2026 and g.geographic_id=a.geoid and g.canonical_name=a.canonical
on conflict do nothing;
