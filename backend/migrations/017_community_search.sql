-- Keep the indexed radius query and existing runtime privileges.
insert into app_private.categories(slug,name) values ('community','Community Support') on conflict(slug) do nothing;
create or replace function app_private.public_resource_search(p_lat double precision,p_lng double precision,p_radius double precision,p_category text,p_keyword text,p_page integer,p_size integer,p_allow_demo boolean,p_demo_only boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app_private,extensions as $$
declare response jsonb;
begin
 if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180)
 or p_radius is null or not(p_radius>0 and p_radius<=50) or p_page is null or p_page not between 1 and 1000 or p_size is null or p_size not between 1 and 50
 or (p_category is not null and p_category not in ('food','healthcare','community')) or p_keyword is null or length(p_keyword)>100 or p_allow_demo is null or p_demo_only is null
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
   case when sr.service_id is null then null else jsonb_build_object('source_id',sr.source_id,'source_name',ds.name,'source_record_id',sr.source_record_id,'source_url',ds.source_url,'imported_at',sr.imported_at,'source_updated_at',sr.source_updated_at,'last_seen_at',sr.last_seen_at,'verification_status',case when sr.needs_review or sr.record_status='stale_or_needs_review' then 'stale_or_needs_review' else 'imported_unverified' end,'license_name',ds.license_name,'license_url',ds.license_url,'attribution',ds.attribution) end as provenance,
   case when nullif(s.eligibility_text,'') is not null or exists(select 1 from app_private.opening_hours h where h.service_id=s.id) or (length(s.description)>length(s.summary)+80 and s.description not like 'Listed in the HRSA%') then 'substantive' else 'basic' end as detail_level
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
