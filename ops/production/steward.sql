-- Install once with psql -1 -v ON_ERROR_STOP=1, as the database owner.
-- Membership is intentionally empty. Grant the group only to separately verified human logins.
create role our_ground_steward nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create schema directory_ops;
revoke all on schema directory_ops from public, our_ground_api, anon, authenticated;
grant usage on schema directory_ops to our_ground_steward;

create table directory_ops.location_holds (
 location_id uuid primary key references app_private.service_locations(id),
 created_at timestamptz not null default clock_timestamp(),
 actor name not null,
 ticket text not null check (ticket ~ '^[A-Za-z0-9][-A-Za-z0-9_.]{2,79}$')
);
create table directory_ops.review_events (
 id bigint generated always as identity primary key, created_at timestamptz not null default clock_timestamp(),
 actor name not null, action text not null check (action in ('confirmed','suppressed','hold_released')),
 report_id uuid, location_id uuid not null, ticket text not null
);
alter table directory_ops.location_holds enable row level security;
alter table directory_ops.review_events enable row level security;
revoke all on all tables in schema directory_ops from public,our_ground_api,anon,authenticated,our_ground_steward;
revoke all on all sequences in schema directory_ops from public,our_ground_api,anon,authenticated,our_ground_steward;

create function directory_ops.block_held_publication() returns trigger language plpgsql security definer
set search_path = pg_catalog as $$
begin
 if new.status='published' and exists(select 1 from directory_ops.location_holds h where h.location_id=new.id)
 then new.status='hidden'; end if;
 return new;
end $$;
create trigger directory_operation_hold before insert or update on app_private.service_locations
 for each row execute function directory_ops.block_held_publication();

create function directory_ops.next_reports() returns table(report_id uuid, service_id uuid, opened timestamptz, reason text)
language sql stable security definer set search_path=pg_catalog as $$
 select r.id,r.service_id,r.created_at,r.reason_code from app_private.correction_reports r
 where r.status='open' order by r.created_at,r.id limit 50
$$;
create function directory_ops.read_report(target uuid) returns table(service_id uuid, reason text, description text, status text)
language sql stable security definer set search_path=pg_catalog as $$
 select r.service_id,r.reason_code,r.description,r.status from app_private.correction_reports r where r.id=target
$$;
create function directory_ops.resolve_report(target uuid, decision text, ticket text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare loc uuid;
begin
 if decision is null or decision not in ('confirmed','suppressed') or ticket is null or ticket !~ '^[A-Za-z0-9][-A-Za-z0-9_.]{2,79}$'
 then raise exception 'Choose a review decision and a non-personal case reference'; end if;
 select s.location_id into strict loc from app_private.correction_reports r join app_private.services s on s.id=r.service_id
 where r.id=target and r.status='open' for update of r,s;
 perform 1 from app_private.service_locations l where l.id=loc for update;
 if decision='suppressed' then
  insert into directory_ops.location_holds(location_id,actor,ticket) values(loc,session_user,ticket)
  on conflict(location_id) do nothing;
  -- The search, detail and map must all lose the point, including colocated services.
  update app_private.service_locations set status='hidden' where id=loc;
 end if;
 insert into directory_ops.review_events(actor,action,report_id,location_id,ticket) values(session_user,decision,target,loc,ticket);
 update app_private.correction_reports set status='resolved',resolved_at=clock_timestamp() where id=target;
end $$;

-- Owner-only. Removing this operational hold does not republish or clear publisher privacy holds.
create function directory_ops.release_hold(loc uuid, ticket text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if ticket is null or ticket !~ '^[A-Za-z0-9][-A-Za-z0-9_.]{2,79}$' then raise exception 'Review evidence required'; end if;
 perform 1 from app_private.service_locations where id=loc for update;
 delete from directory_ops.location_holds where location_id=loc;
 if not found then raise exception 'No current operational hold'; end if;
 insert into directory_ops.review_events(actor,action,location_id,ticket) values(session_user,'hold_released',loc,ticket);
end $$;
revoke all on all functions in schema directory_ops from public,our_ground_api,anon,authenticated,our_ground_steward;
grant execute on function directory_ops.next_reports(),directory_ops.read_report(uuid),directory_ops.resolve_report(uuid,text,text)
 to our_ground_steward;
do $$ begin
 if exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
  revoke all on schema directory_ops from service_role;
  revoke all on all tables in schema directory_ops from service_role;
  revoke all on all sequences in schema directory_ops from service_role;
  revoke all on all functions in schema directory_ops from service_role;
 end if;
end $$;
