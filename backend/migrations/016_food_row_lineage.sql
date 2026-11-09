-- Exact upstream identity lineage for the newly reviewed Maryland source.
-- No addresses, coordinates, source contact fields or private raw rows are stored.
create table app_private.food_source_row_lineage (
 source_id text not null references app_private.resource_data_sources(id) check(source_id='pgc-food-assistance'),
 source_row_id text not null check(source_row_id~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
 source_record_id text not null check(source_record_id~'^PGC-[a-f0-9]{32}$'),
 import_run_id uuid not null references app_private.resource_import_runs(id),
 privacy_withdrawn boolean not null default false,needs_review boolean not null default false,
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 primary key(source_id,source_row_id,source_record_id)
);
create index food_source_row_lineage_program_idx on app_private.food_source_row_lineage(source_id,source_record_id);
alter table app_private.food_source_row_lineage enable row level security;
revoke all on app_private.food_source_row_lineage from public,our_ground_api;
insert into app_private.food_source_row_lineage(source_id,source_row_id,source_record_id,import_run_id)
select r.source_id,original_id,r.source_record_id,r.import_run_id
from app_private.resource_source_records r cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.snapshot->'source_record_ids')='array' then r.snapshot->'source_record_ids' else '[]'::jsonb end) original_id
where r.source_id='pgc-food-assistance' on conflict do nothing;
create function app_private.food_lineage_preserve() returns trigger language plpgsql set search_path=pg_catalog,app_private as $$
begin
 if new.source_id<>old.source_id or new.source_row_id<>old.source_row_id or new.source_record_id<>old.source_record_id then raise exception 'Source row lineage identity is immutable'; end if;
 new.privacy_withdrawn=old.privacy_withdrawn or new.privacy_withdrawn;
 new.needs_review=old.needs_review or new.needs_review;
 return new;
end $$;
create trigger food_lineage_preserve before update on app_private.food_source_row_lineage for each row execute function app_private.food_lineage_preserve();
revoke all on function app_private.food_lineage_preserve() from public,our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then
 execute format('revoke all on app_private.food_source_row_lineage from %I',r);
 execute format('revoke all on function app_private.food_lineage_preserve() from %I',r);
 end if; end loop;
end $$;
