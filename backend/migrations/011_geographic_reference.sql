-- Authoritative public geographic reference, independent from resource records.
-- Apply only as migration owner; no raw runtime/browser table access.
do $$ declare ext text; ns text; begin
 foreach ext in array array['pg_trgm','unaccent','fuzzystrmatch'] loop
   select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname=ext;
   if ns is not null and ns<>'extensions' then raise exception 'Review the existing extension schema before applying geographic reference migration'; end if;
   execute format('create extension if not exists %I with schema extensions',ext);
 end loop;
end $$;

create table if not exists app_private.geographic_reference_imports (
 id uuid primary key, source_id text not null check(source_id='census-gazetteer-2026'),
 kind text not null check(kind in ('place','state')),vintage integer not null check(vintage=2026),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),source_url text not null,
 imported_at timestamptz not null default now(),completed_at timestamptz,summary jsonb not null default '{}'::jsonb,
 unique(source_id,kind,checksum)
);
create table if not exists app_private.geographic_reference_records (
 id text primary key,source_id text not null check(source_id='census-gazetteer-2026'),vintage integer not null check(vintage=2026),
 kind text not null check(kind in ('place','state')),geographic_id text not null,geoid_fq text not null,ansi_code text,
 canonical_name text not null check(length(canonical_name) between 2 and 160),display_name text not null check(length(display_name) between 2 and 160),
 state text not null check(state ~ '^[A-Z]{2}$'),lsad text,functional_status text,
 latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),
 import_id uuid not null references app_private.geographic_reference_imports(id),active boolean not null default true,
 unique(source_id,kind,geographic_id),unique(id,state,kind)
);
create or replace function app_private.geographic_reference_normalize(p_text text) returns text
language sql stable set search_path=pg_catalog,extensions as $$
 select trim(regexp_replace(regexp_replace(lower(extensions.unaccent(normalize(p_text,NFKD))),'[''’]','','g'),'[^[:alnum:]]+',' ','g'));
$$;
create table if not exists app_private.geographic_reference_names (
 record_id text not null,state text not null,kind text not null,
 name text not null check(length(name) between 2 and 160),normalized_name text not null check(length(normalized_name) between 2 and 160),
 name_kind text not null check(name_kind in ('canonical','lsad_short','state_code')),
 primary key(record_id,normalized_name),
 foreign key(record_id,state,kind) references app_private.geographic_reference_records(id,state,kind)
);
create index if not exists geographic_reference_names_exact_idx on app_private.geographic_reference_names(normalized_name,record_id);
create index if not exists geographic_reference_names_state_idx on app_private.geographic_reference_names(state,kind,normalized_name);
create index if not exists geographic_reference_names_trgm_idx on app_private.geographic_reference_names using gist(normalized_name extensions.gist_trgm_ops(siglen=32));
create index if not exists geographic_reference_records_import_idx on app_private.geographic_reference_records(import_id);

do $$ declare t text; r text; begin
 foreach t in array array['geographic_reference_imports','geographic_reference_records','geographic_reference_names'] loop
   execute format('alter table app_private.%I enable row level security',t);
   execute format('revoke all on app_private.%I from public,our_ground_api',t);
   foreach r in array array['anon','authenticated'] loop
     if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on app_private.%I from %I',t,r); end if;
   end loop;
 end loop;
end $$;

-- Exact btree lookup first; only otherwise inspect the128 nearest indexed names.
-- No popularity ranking, addresses, ZIPs or resident query history are stored.
create or replace function app_private.geographic_reference_find(p_query text,p_state text default null,p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app_private,extensions as $$
declare q text; max_edits integer; response jsonb;
begin
 if p_query is null or length(p_query) not between 2 and 80 or p_query~'[[:cntrl:]]'
 or p_limit is null or p_limit not between 1 and 5 or (p_state is not null and p_state!~'^[A-Z]{2}$')
 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
 q=app_private.geographic_reference_normalize(p_query);
 if length(q)<2 or q~'[0-9]' then return '[]'::jsonb; end if;
 max_edits=case when length(q)<4 then 0 when length(q)<8 then 1 when length(q)<13 then 2 else 3 end;
 with exact_pool as materialized (
   select n.record_id,n.name,n.normalized_name,1::real as similarity,0 as edits
   from app_private.geographic_reference_names n join app_private.geographic_reference_records g on g.id=n.record_id
   where n.normalized_name=q and g.active and (length(q)>2 or n.name_kind='state_code')
   and (p_state is null or (n.state=p_state and n.kind='place')) order by n.record_id limit 128
 ), nearest as materialized (
   select n.record_id,n.name,n.normalized_name
   from app_private.geographic_reference_names n join app_private.geographic_reference_records g on g.id=n.record_id
   where max_edits>0 and not exists(select 1 from exact_pool) and g.active
   and (p_state is null or (n.state=p_state and n.kind='place'))
   order by n.normalized_name operator(extensions.<->) q limit 128
 ), scored as (
   select n.record_id,n.name,n.normalized_name,extensions.similarity(n.normalized_name,q) as similarity,
   extensions.levenshtein_less_equal(n.normalized_name,q,max_edits) as edits from nearest n
 ), accepted as (
   select * from exact_pool union all select * from scored where similarity>=0.35 and edits<=max_edits
 ), best_names as (
   select distinct on(record_id) * from accepted order by record_id,edits,similarity desc,name
 ), ranked as (
   select b.*,g.*,i.imported_at,count(*) over() as matches
   from best_names b join app_private.geographic_reference_records g on g.id=b.record_id
   join app_private.geographic_reference_imports i on i.id=g.import_id and i.completed_at is not null
   order by b.edits,b.similarity desc,g.id limit p_limit
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'canonical_name',canonical_name,'display_name',display_name,'kind',kind,'state',state,
 'latitude',latitude,'longitude',longitude,'coordinate_precision','representative',
 'source',jsonb_build_object('provider','census','id',source_id,'url','https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html','vintage',vintage,'geographic_id',geographic_id,'geoid_fq',geoid_fq,'ansi_code',ansi_code,'imported_at',imported_at),
 'match',jsonb_build_object('method',case when edits>0 then 'fuzzy' when trim(p_query)=name then 'exact' else 'normalized' end,'query',p_query,'matched_name',name,'local_similarity',round(similarity::numeric,5),'edit_distance',edits,'exact_match',edits=0,'ambiguous_matches',matches)) order by edits,similarity desc,id),'[]'::jsonb) into response from ranked;
 return response;
end $$;

create or replace function app_private.geographic_reference_import_batch(p_import uuid,p_records jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare run app_private.geographic_reference_imports%rowtype; r jsonb; named jsonb; count_rows integer=0;
begin
 select * into run from app_private.geographic_reference_imports where id=p_import for update;
 if not found or run.completed_at is not null or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>500 then raise exception 'Invalid geographic import batch'; end if;
 for r in select * from jsonb_array_elements(p_records) loop
   if r->>'id' is distinct from 'census:2026:'||run.kind||':'||(r->>'geographic_id') or r->>'kind' is distinct from run.kind
   or (r->>'geographic_id')!~ (case run.kind when 'place' then '^[0-9]{7}$' else '^[0-9]{2}$' end)
   or jsonb_typeof(r->'names') is distinct from 'array' or jsonb_array_length(r->'names') not between 1 and 3
   then raise exception 'Invalid canonical geographic identity'; end if;
   insert into app_private.geographic_reference_records(id,source_id,vintage,kind,geographic_id,geoid_fq,ansi_code,canonical_name,display_name,state,lsad,functional_status,latitude,longitude,import_id)
   values(r->>'id',run.source_id,run.vintage,run.kind,r->>'geographic_id',r->>'geoid_fq',r->>'ansi_code',r->>'canonical_name',r->>'display_name',r->>'state',r->>'lsad',r->>'functional_status',(r->>'latitude')::float8,(r->>'longitude')::float8,run.id)
   on conflict(id) do update set geoid_fq=excluded.geoid_fq,ansi_code=excluded.ansi_code,canonical_name=excluded.canonical_name,display_name=excluded.display_name,lsad=excluded.lsad,functional_status=excluded.functional_status,latitude=excluded.latitude,longitude=excluded.longitude,import_id=run.id,active=true;
   delete from app_private.geographic_reference_names where record_id=r->>'id';
   for named in select * from jsonb_array_elements(r->'names') loop
     insert into app_private.geographic_reference_names(record_id,state,kind,name,normalized_name,name_kind)
     values(r->>'id',r->>'state',run.kind,named->>'name',app_private.geographic_reference_normalize(named->>'name'),named->>'kind') on conflict do nothing;
   end loop;
   count_rows=count_rows+1;
 end loop;
 return count_rows;
end $$;

revoke all on function app_private.geographic_reference_normalize(text),app_private.geographic_reference_find(text,text,integer),app_private.geographic_reference_import_batch(uuid,jsonb) from public,our_ground_api;
grant execute on function app_private.geographic_reference_find(text,text,integer) to our_ground_api;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function app_private.geographic_reference_normalize(text),app_private.geographic_reference_find(text,text,integer),app_private.geographic_reference_import_batch(uuid,jsonb) from %I',r); end if;
 end loop;
end $$;
