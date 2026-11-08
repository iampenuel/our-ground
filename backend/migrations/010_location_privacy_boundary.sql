-- Additive whole-location privacy boundary;009 remains checksum-preserved.
-- A second service at a held site must not reveal its formerly public point.
create or replace function app_private.resource_privacy_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
 if exists(select 1 from app_private.resource_privacy_holds h where h.source_id=new.source_id and h.source_record_id=new.source_record_id and h.released_at is null) then
   new.record_status='suppressed'; new.needs_review=true;
   update app_private.service_locations set status='hidden'
   where id=(select location_id from app_private.services where id=new.service_id);
 end if;
 return new;
end $$;

create or replace function app_private.resource_location_privacy_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
 if exists(select 1 from app_private.services s
   join app_private.resource_source_records sr on sr.service_id=s.id
   join app_private.resource_privacy_holds h on h.source_id=sr.source_id and h.source_record_id=sr.source_record_id
   where s.location_id=new.id and h.released_at is null)
 then new.status='hidden'; end if;
 return new;
end $$;
drop trigger if exists resource_location_privacy_guard on app_private.service_locations;
create trigger resource_location_privacy_guard before insert or update on app_private.service_locations for each row execute function app_private.resource_location_privacy_guard();

-- Catch any already-existing held binding without touching unrelated locations.
update app_private.service_locations l set status='hidden'
where exists(select 1 from app_private.services s join app_private.resource_source_records sr on sr.service_id=s.id
join app_private.resource_privacy_holds h on h.source_id=sr.source_id and h.source_record_id=sr.source_record_id
where s.location_id=l.id and h.released_at is null);

revoke all on function app_private.resource_privacy_guard(),app_private.resource_location_privacy_guard() from public,our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function app_private.resource_location_privacy_guard() from %I',r); end if;
 end loop;
end $$;
