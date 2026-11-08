-- Public Census ZCTA representative points, independent of provider credentials.
create table app_private.postal_reference (
 zip text primary key check(zip ~ '^[0-9]{5}$'),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 vintage smallint not null check(vintage=2026)
);
alter table app_private.postal_reference enable row level security;
revoke all on app_private.postal_reference from public,our_ground_api;
create function app_private.postal_reference_find(p_zip text)
returns table(latitude float8,longitude float8)
language sql stable security definer set search_path=pg_catalog,app_private as $$
 select p.latitude,p.longitude from app_private.postal_reference p where p.zip=p_zip and p_zip ~ '^[0-9]{5}$'
$$;
revoke all on function app_private.postal_reference_find(text) from public;
grant execute on function app_private.postal_reference_find(text) to our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on app_private.postal_reference from %I',r);
   execute format('revoke all on function app_private.postal_reference_find(text) from %I',r);
  end if;
 end loop;
end $$;
