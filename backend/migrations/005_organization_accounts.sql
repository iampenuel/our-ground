-- Phase 7B. Additive private-schema workflow; run as the reviewed migration owner.
-- No public/anon/authenticated role receives table access or command execution.
alter table app_private.organizations add column if not exists version integer not null default 1 check (version > 0);
alter table app_private.service_locations add column if not exists version integer not null default 1 check (version > 0);

create table if not exists app_private.organization_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_private.app_users(id),
  organization_name text not null check (length(trim(organization_name)) between 2 and 160),
  website_url text,
  location text not null check (length(trim(location)) between 2 and 300),
  applicant_role text not null check (length(trim(applicant_role)) between 2 and 100),
  contact_email text not null check (length(contact_email) between 3 and 254),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  explanation text check (explanation is null or length(explanation) <= 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  service_id uuid references app_private.services(id),
  reviewer_id uuid references app_private.app_users(id),
  review_note text,
  evidence_url text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((status='pending' and reviewer_id is null and reviewed_at is null) or (status<>'pending' and reviewer_id is not null and reviewed_at is not null)),
  check (status<>'approved' or service_id is not null),
  check (reviewer_id is distinct from user_id)
);
create unique index if not exists organization_claims_pending_unique on app_private.organization_claims(user_id,lower(trim(organization_name)),lower(trim(location))) where status='pending';
create index if not exists organization_claims_queue_idx on app_private.organization_claims(status,created_at);

create table if not exists app_private.organization_listing_access (
  service_id uuid not null references app_private.services(id),
  user_id uuid not null references app_private.app_users(id),
  organization_id uuid not null,
  claim_id uuid not null references app_private.organization_claims(id),
  granted_by uuid not null references app_private.app_users(id),
  granted_at timestamptz not null default now(),
  primary key(service_id,user_id),
  foreign key(organization_id,user_id) references app_private.organization_memberships(organization_id,user_id) on delete cascade
);

create table if not exists app_private.organization_revisions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references app_private.services(id),
  organization_id uuid not null references app_private.organizations(id),
  user_id uuid not null references app_private.app_users(id),
  expected_version integer not null check (expected_version>0),
  expected_organization_version integer not null check (expected_organization_version>0),
  expected_location_version integer not null check (expected_location_version>0),
  patch jsonb not null check (jsonb_typeof(patch)='object' and patch<>'{}'::jsonb),
  before_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references app_private.app_users(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((status='pending' and reviewer_id is null and reviewed_at is null) or (status<>'pending' and reviewer_id is not null and reviewed_at is not null)),
  check (reviewer_id is distinct from user_id)
);
create unique index if not exists organization_revisions_pending_unique on app_private.organization_revisions(service_id,user_id) where status='pending';
create index if not exists organization_revisions_queue_idx on app_private.organization_revisions(status,created_at);

create table if not exists app_private.organization_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references app_private.app_users(id),
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists app_private.organization_revoked_sessions (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references app_private.app_users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists app_private.organization_action_limits (
  bucket text primary key,
  count integer not null check (count>0),
  expires_at timestamptz not null
);

alter table app_private.organization_claims enable row level security;
alter table app_private.organization_listing_access enable row level security;
alter table app_private.organization_revisions enable row level security;
alter table app_private.organization_audit enable row level security;
alter table app_private.organization_revoked_sessions enable row level security;
alter table app_private.organization_action_limits enable row level security;

-- Every new relation is denied by default. Access occurs through the narrow
-- server-only function after the API independently verifies the Supabase user.
revoke all on app_private.organization_claims,app_private.organization_listing_access,app_private.organization_revisions,app_private.organization_audit,app_private.organization_revoked_sessions,app_private.organization_action_limits from public,our_ground_api;
revoke all on sequence app_private.organization_audit_id_seq from public,our_ground_api;
revoke update (title,summary,eligibility_text,cost_summary,status,version,updated_by,updated_at) on app_private.services from our_ground_api;

create or replace function app_private.organization_audit_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception using errcode='P0001',message='OG_AUDIT_IMMUTABLE'; end;
$$;
drop trigger if exists organization_audit_immutable on app_private.organization_audit;
create trigger organization_audit_immutable before update or delete on app_private.organization_audit for each row execute function app_private.organization_audit_immutable();

create or replace function app_private.organization_limit(p_bucket text,p_max integer,p_window integer) returns boolean language plpgsql security definer set search_path=pg_catalog,app_private as $$
declare n integer; cutoff timestamptz; k text;
begin
  cutoff=to_timestamp((floor(extract(epoch from clock_timestamp())/p_window)+1)*p_window);
  k=p_bucket||':'||floor(extract(epoch from clock_timestamp())/p_window)::text;
  insert into app_private.organization_action_limits(bucket,count,expires_at) values(k,1,cutoff)
  on conflict(bucket) do update set count=organization_action_limits.count+1 where organization_action_limits.count<p_max returning count into n;
  if n is null then return false; end if;
  delete from app_private.organization_action_limits where expires_at < clock_timestamp()-interval '1 day';
  return true;
end;
$$;

create or replace function app_private.account_rate_gate(p_key text,p_action text) returns boolean language plpgsql security definer set search_path=pg_catalog,app_private as $$
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_action not in ('email','client','verify') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  return app_private.organization_limit('auth:'||p_action||':'||p_key,case p_action when 'email' then 3 else 10 end,case p_action when 'verify' then 600 else 3600 end);
end;
$$;

create or replace function app_private.organization_safe_url(p_value text) returns boolean language sql immutable set search_path=pg_catalog as $$
select p_value is null or (length(p_value)<=2048 and p_value ~ '^https?://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' and p_value !~ '[[:cntrl:]]');
$$;

create or replace function app_private.organization_listing_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,app_private,extensions as $$
select jsonb_build_object('id',s.id,'organization_id',s.organization_id,'location_id',s.location_id,'organization_name',o.name,
  'organization_description',o.description,'website_url',o.website_url,'public_phone',o.public_phone,
  'site_name',l.site_name,'street_address',l.street_address,'city',l.city,'state',l.state,'postal_code',l.postal_code,
  'latitude',extensions.st_y(l.point::extensions.geometry),'longitude',extensions.st_x(l.point::extensions.geometry),
  'title',s.title,'summary',s.summary,'description',s.description,'eligibility_text',s.eligibility_text,'cost_summary',s.cost_summary,
  'appointment_note',s.appointment_note,'contact_phone',s.contact_phone,'contact_url',s.contact_url,'status',s.status,
  'version',s.version,'organization_version',o.version,'location_version',l.version,'is_demo',(s.is_demo or o.is_demo or l.is_demo),
  'source_url',s.source_url,'source_recorded_at',s.source_recorded_at,'updated_at',s.updated_at,
  'category_slugs',coalesce((select jsonb_agg(c.slug order by c.slug) from app_private.service_categories sc join app_private.categories c on c.id=sc.category_id where sc.service_id=s.id),'[]'::jsonb),
  'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens_at',to_char(h.opens_at,'HH24:MI'),'closes_at',to_char(h.closes_at,'HH24:MI'),'notes',h.notes) order by h.weekday,h.sequence) from app_private.opening_hours h where h.service_id=s.id),'[]'::jsonb))
from app_private.services s join app_private.organizations o on o.id=s.organization_id join app_private.service_locations l on l.id=s.location_id where s.id=p_id;
$$;

create or replace function app_private.organization_validate_patch(p jsonb) returns void language plpgsql set search_path=pg_catalog,app_private as $$
declare k text; v jsonb; hour jsonb; maxlen integer;
begin
  if jsonb_typeof(p)<>'object' or p='{}'::jsonb or pg_column_size(p)>16000 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  if (p ? 'latitude') is distinct from (p ? 'longitude') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  for k,v in select * from jsonb_each(p) loop
    if k not in ('title','summary','description','eligibility_text','cost_summary','appointment_note','contact_phone','contact_url','organization_description','website_url','public_phone','site_name','street_address','city','state','postal_code','latitude','longitude','category_slugs','hours') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    if k in ('latitude','longitude') then
      if jsonb_typeof(v)<>'number' or not ((v::text)::numeric between case k when 'latitude' then 39.5 else -80.6 end and case k when 'latitude' then 42.6 else -74.5 end) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    elsif k='category_slugs' then
      if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<1 or jsonb_array_length(v)>2 or exists(select 1 from jsonb_array_elements(v) x where x not in ('"food"'::jsonb,'"healthcare"'::jsonb)) or (select count(distinct x) from jsonb_array_elements(v) x)<>jsonb_array_length(v) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    elsif k='hours' then
      if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>28 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      for hour in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(hour)<>'object' or not (hour ?& array['weekday','opens_at','closes_at']) or exists(select 1 from jsonb_object_keys(hour) z where z not in ('weekday','opens_at','closes_at','notes'))
          or jsonb_typeof(hour->'weekday')<>'number' or (hour->>'weekday')!~ '^[0-6]$'
          or coalesce(hour->>'opens_at','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(hour->>'closes_at','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (hour->>'opens_at')>=(hour->>'closes_at') or (hour ? 'notes' and hour->'notes'<>'null'::jsonb and (jsonb_typeof(hour->'notes')<>'string' or length(hour->>'notes')>300))
        then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      end loop;
    else
      if v='null'::jsonb then
        if k in ('title','summary','description','organization_description','site_name','city','state') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      elsif jsonb_typeof(v)<>'string' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';
      end if;
      maxlen=case when k in ('contact_url','website_url') then 2048 when k in ('description','organization_description') then 4000 when k in ('contact_phone','public_phone') then 40 when k='street_address' then 300 when k in ('title','site_name') then 160 when k='city' then 100 when k in ('eligibility_text','appointment_note') then 1000 else 500 end;
      if length(p->>k)>maxlen or (k in ('title','site_name','city') and length(trim(p->>k))<2)
        or (k='state' and (p->>k) is distinct from 'PA') or (k='postal_code' and v<>'null'::jsonb and (p->>k)!~ '^[0-9]{5}$')
        or (k in ('contact_url','website_url') and not app_private.organization_safe_url(p->>k))
        or (k in ('contact_phone','public_phone') and v<>'null'::jsonb and (p->>k)!~ '^\+?[0-9() .-]{7,40}$')
      then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    end if;
  end loop;
end;
$$;

create or replace function app_private.organization_command(p_actor uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,app_private,extensions as $$
declare
  admin boolean; c app_private.organization_claims%rowtype; r app_private.organization_revisions%rowtype;
  s app_private.services%rowtype; org app_private.organizations%rowtype; loc app_private.service_locations%rowtype;
  patch jsonb; snap jsonb; target uuid; result jsonb; note text; field text; desired text;
begin
  if p_actor is null then raise exception using errcode='P0001',message='OG_SESSION_EXPIRED'; end if;
  if jsonb_typeof(p_input)<>'object' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
  insert into app_private.app_users(id) values(p_actor) on conflict(id) do nothing;
  select u.role='admin' into admin from app_private.app_users u where u.id=p_actor;
  if p_action='session.check' then
    if coalesce(p_input->>'session_hash','')!~ '^[a-f0-9]{64}$' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    return jsonb_build_object('active',not exists(select 1 from app_private.organization_revoked_sessions rs where rs.session_hash=p_input->>'session_hash' and rs.user_id=p_actor));
  elsif p_action='session.revoke' then
    if coalesce(p_input->>'session_hash','')!~ '^[a-f0-9]{64}$' or (p_input->>'expires_at') is null or (p_input->>'expires_at')::timestamptz>clock_timestamp()+interval '32 days' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    insert into app_private.organization_revoked_sessions(session_hash,user_id,expires_at) values(p_input->>'session_hash',p_actor,(p_input->>'expires_at')::timestamptz) on conflict(session_hash) do nothing;
    insert into app_private.organization_audit(actor_id,action,target_id) values(p_actor,'session.revoked',p_actor);
    return jsonb_build_object('signed_out',true);
  end if;

  if p_action like 'admin.%' and not admin then raise exception using errcode='P0001',message='OG_ACCESS_DENIED'; end if;
  if p_action in ('claims.create','revisions.create') or p_action like 'admin.%.%' then
    if not app_private.organization_limit('mutation:'||p_actor::text,60,3600) then raise exception using errcode='P0001',message='OG_RATE_LIMITED'; end if;
  end if;

  if p_action in ('account.get','claims.list','listings.list','revisions.list') then
    if p_action='claims.list' then
      return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select cl.*,exists(select 1 from app_private.organization_listing_access a where a.claim_id=cl.id and a.user_id=p_actor) as access_active from app_private.organization_claims cl where cl.user_id=p_actor order by cl.created_at desc limit 100) x),'[]'::jsonb));
    elsif p_action='revisions.list' then
      return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select rv.* from app_private.organization_revisions rv where rv.user_id=p_actor order by rv.created_at desc limit 100) x),'[]'::jsonb));
    elsif p_action='listings.list' then
      return jsonb_build_object('items',coalesce((select jsonb_agg(app_private.organization_listing_snapshot(ss.id) order by ss.title) from app_private.services ss where admin or exists(select 1 from app_private.organization_listing_access a join app_private.organization_memberships m on m.organization_id=a.organization_id and m.user_id=a.user_id where a.service_id=ss.id and a.user_id=p_actor and a.organization_id=ss.organization_id)),'[]'::jsonb));
    end if;
    return jsonb_build_object('id',p_actor,'role',case when admin then 'admin' else 'user' end,
      'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role','editor') order by o.name) from app_private.organization_memberships m join app_private.organizations o on o.id=m.organization_id where m.user_id=p_actor and exists(select 1 from app_private.organization_listing_access a where a.organization_id=o.id and a.user_id=p_actor)),'[]'::jsonb),
      'claims',app_private.organization_command(p_actor,'claims.list','{}')->'items',
      'listings',app_private.organization_command(p_actor,'listings.list','{}')->'items',
      'revisions',app_private.organization_command(p_actor,'revisions.list','{}')->'items');
  elsif p_action='claims.create' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('organization_name','website_url','location','applicant_role','contact_email','contact_phone','explanation')) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    foreach field in array array['organization_name','location','applicant_role','contact_email'] loop
      if jsonb_typeof(p_input->field) is distinct from 'string' or length(trim(p_input->>field))<2 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    end loop;
    if length(p_input->>'organization_name')>160 or length(p_input->>'location')>300 or length(p_input->>'applicant_role')>100 or length(p_input->>'contact_email')>254 or (p_input->>'contact_email')!~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_input->>'contact_phone')>40 or length(p_input->>'explanation')>1500 or not app_private.organization_safe_url(p_input->>'website_url') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    foreach field in array array['website_url','contact_phone','explanation'] loop
      if p_input ? field and p_input->field<>'null'::jsonb and jsonb_typeof(p_input->field)<>'string' then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    end loop;
    if exists(select 1 from app_private.organization_claims cl where cl.user_id=p_actor and cl.status='pending' and lower(trim(cl.organization_name))=lower(trim(p_input->>'organization_name')) and lower(trim(cl.location))=lower(trim(p_input->>'location'))) then raise exception using errcode='P0001',message='OG_DUPLICATE_CLAIM'; end if;
    if not app_private.organization_limit('claims:'||p_actor::text,3,86400) then raise exception using errcode='P0001',message='OG_RATE_LIMITED'; end if;
    insert into app_private.organization_claims(user_id,organization_name,website_url,location,applicant_role,contact_email,contact_phone,explanation)
      values(p_actor,trim(p_input->>'organization_name'),p_input->>'website_url',trim(p_input->>'location'),trim(p_input->>'applicant_role'),lower(trim(p_input->>'contact_email')),p_input->>'contact_phone',p_input->>'explanation') returning * into c;
    insert into app_private.organization_audit(actor_id,action,target_id) values(p_actor,'claim.submitted',c.id);
    return to_jsonb(c);
  elsif p_action='listings.get' or p_action='revisions.create' then
    target=(p_input->>'service_id')::uuid;
    select * into s from app_private.services ss where ss.id=target for update;
    if s.id is null or (not admin and not exists(select 1 from app_private.organization_listing_access a join app_private.organization_memberships m on m.organization_id=a.organization_id and m.user_id=a.user_id where a.service_id=target and a.user_id=p_actor and a.organization_id=s.organization_id)) then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
    snap=app_private.organization_listing_snapshot(target);
    if p_action='listings.get' then return snap; end if;
    if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('service_id','expected_version','expected_organization_version','expected_location_version','patch')) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    perform app_private.organization_validate_patch(p_input->'patch');
    if (p_input->>'expected_version')::integer is distinct from s.version or (p_input->>'expected_organization_version')::integer is distinct from (snap->>'organization_version')::integer or (p_input->>'expected_location_version')::integer is distinct from (snap->>'location_version')::integer then raise exception using errcode='P0001',message='OG_CONFLICT'; end if;
    if (snap->>'is_demo')::boolean and ((p_input->'patch') ?| array['contact_phone','contact_url','public_phone','website_url','street_address']) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    if exists(select 1 from app_private.organization_revisions rv where rv.user_id=p_actor and rv.service_id=target and rv.status='pending') then raise exception using errcode='P0001',message='OG_PENDING_REVISION'; end if;
    if not app_private.organization_limit('revisions:'||p_actor::text,20,3600) then raise exception using errcode='P0001',message='OG_RATE_LIMITED'; end if;
    insert into app_private.organization_revisions(service_id,organization_id,user_id,expected_version,expected_organization_version,expected_location_version,patch,before_snapshot)
      values(target,s.organization_id,p_actor,s.version,(snap->>'organization_version')::integer,(snap->>'location_version')::integer,p_input->'patch',snap) returning * into r;
    insert into app_private.organization_audit(actor_id,action,target_id) values(p_actor,'revision.submitted',r.id);
    return to_jsonb(r);
  elsif p_action='admin.queue' then
    return jsonb_build_object('claims',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select * from app_private.organization_claims where status='pending' order by created_at limit 100) x),'[]'::jsonb),
      'revisions',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('current',app_private.organization_listing_snapshot(x.service_id)) order by x.created_at) from (select * from app_private.organization_revisions where status='pending' order by created_at limit 100) x),'[]'::jsonb),
      'listings',app_private.organization_command(p_actor,'listings.list','{}')->'items',
      'memberships',coalesce((select jsonb_agg(to_jsonb(x)) from (select m.organization_id,m.user_id,o.name as organization_name,jsonb_agg(a.service_id order by a.service_id) as service_ids from app_private.organization_memberships m join app_private.organizations o on o.id=m.organization_id join app_private.organization_listing_access a on a.organization_id=m.organization_id and a.user_id=m.user_id group by m.organization_id,m.user_id,o.name) x),'[]'::jsonb),
      'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from app_private.organization_audit order by id desc limit 50) x),'[]'::jsonb));
  elsif p_action='admin.claim.decide' then
    note=trim(p_input->>'review_note'); desired=p_input->>'decision';
    if note is null or length(note) not between 2 and 1500 or desired not in ('approved','rejected') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    select * into c from app_private.organization_claims cl where cl.id=(p_input->>'claim_id')::uuid for update;
    if c.id is null then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
    if c.user_id=p_actor then raise exception using errcode='P0001',message='OG_SELF_REVIEW'; end if;
    if c.status<>'pending' then raise exception using errcode='P0001',message='OG_CONFLICT'; end if;
    if desired='approved' then
      if not app_private.organization_safe_url(p_input->>'source_url') or p_input->>'source_url' is null then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      select * into s from app_private.services ss where ss.id=(p_input->>'service_id')::uuid for update;
      if s.id is null then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
      insert into app_private.organization_memberships(organization_id,user_id,role,granted_by) values(s.organization_id,c.user_id,'editor',p_actor) on conflict(organization_id,user_id) do nothing;
      insert into app_private.organization_listing_access(service_id,user_id,organization_id,claim_id,granted_by) values(s.id,c.user_id,s.organization_id,c.id,p_actor) on conflict(service_id,user_id) do update set claim_id=excluded.claim_id,granted_by=excluded.granted_by,granted_at=now();
    end if;
    update app_private.organization_claims set status=desired,service_id=case when desired='approved' then s.id else null end,reviewer_id=p_actor,review_note=note,evidence_url=case when desired='approved' then p_input->>'source_url' else null end,reviewed_at=now() where id=c.id returning * into c;
    insert into app_private.organization_audit(actor_id,action,target_id,details) values(p_actor,'claim.'||desired,c.id,jsonb_build_object('user_id',c.user_id,'service_id',c.service_id));
    return to_jsonb(c);
  elsif p_action='admin.access.revoke' then
    note=trim(p_input->>'review_note');
    if note is null or length(note) not between 2 and 1500 then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    delete from app_private.organization_memberships m where m.organization_id=(p_input->>'organization_id')::uuid and m.user_id=(p_input->>'user_id')::uuid;
    if not found then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
    insert into app_private.organization_audit(actor_id,action,target_id,details) values(p_actor,'access.revoked',(p_input->>'organization_id')::uuid,jsonb_build_object('user_id',p_input->>'user_id','review_note',note));
    return jsonb_build_object('revoked',true);
  elsif p_action='admin.revision.decide' then
    note=trim(p_input->>'review_note'); desired=p_input->>'decision';
    if note is null or length(note) not between 2 and 1500 or desired not in ('approved','rejected') then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
    select * into r from app_private.organization_revisions rv where rv.id=(p_input->>'revision_id')::uuid for update;
    if r.id is null then raise exception using errcode='P0001',message='OG_NOT_FOUND'; end if;
    if r.user_id=p_actor then raise exception using errcode='P0001',message='OG_SELF_REVIEW'; end if;
    if r.status<>'pending' then raise exception using errcode='P0001',message='OG_CONFLICT'; end if;
    if desired='approved' then
      select * into s from app_private.services ss where ss.id=r.service_id for update;
      select * into org from app_private.organizations o where o.id=s.organization_id for update;
      select * into loc from app_private.service_locations l where l.id=s.location_id for update;
      -- Recheck the applicant's live binding at review, including after revocation.
      perform 1 from app_private.organization_memberships m where m.organization_id=s.organization_id and m.user_id=r.user_id for update;
      if not found or not exists(select 1 from app_private.organization_listing_access a where a.service_id=s.id and a.organization_id=s.organization_id and a.user_id=r.user_id) then raise exception using errcode='P0001',message='OG_ACCESS_REVOKED'; end if;
      if s.version<>r.expected_version or org.version<>r.expected_organization_version or loc.version<>r.expected_location_version then raise exception using errcode='P0001',message='OG_CONFLICT'; end if;
      patch=r.patch; perform app_private.organization_validate_patch(patch);
      if (s.is_demo or org.is_demo or loc.is_demo) and (patch ?| array['contact_phone','contact_url','public_phone','website_url','street_address']) then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR'; end if;
      update app_private.services set title=coalesce(patch->>'title',title),summary=coalesce(patch->>'summary',summary),description=coalesce(patch->>'description',description),
        eligibility_text=case when patch?'eligibility_text' then patch->>'eligibility_text' else eligibility_text end,
        cost_summary=case when patch?'cost_summary' then patch->>'cost_summary' else cost_summary end,
        appointment_note=case when patch?'appointment_note' then patch->>'appointment_note' else appointment_note end,
        contact_phone=case when patch?'contact_phone' then patch->>'contact_phone' else contact_phone end,
        contact_url=case when patch?'contact_url' then patch->>'contact_url' else contact_url end,
        version=version+1,updated_by=p_actor,updated_at=now() where id=s.id;
      if patch ?| array['organization_description','website_url','public_phone'] then
        update app_private.organizations set description=coalesce(patch->>'organization_description',description),website_url=case when patch?'website_url' then patch->>'website_url' else website_url end,public_phone=case when patch?'public_phone' then patch->>'public_phone' else public_phone end,version=version+1,updated_at=now() where id=org.id;
      end if;
      if patch ?| array['site_name','street_address','city','state','postal_code','latitude','longitude'] then
        update app_private.service_locations set site_name=coalesce(patch->>'site_name',site_name),street_address=case when patch?'street_address' then patch->>'street_address' else street_address end,city=coalesce(patch->>'city',city),state=coalesce(patch->>'state',state),postal_code=case when patch?'postal_code' then patch->>'postal_code' else postal_code end,
          point=extensions.st_setsrid(extensions.st_makepoint(coalesce((patch->>'longitude')::float8,extensions.st_x(loc.point::extensions.geometry)),coalesce((patch->>'latitude')::float8,extensions.st_y(loc.point::extensions.geometry))),4326)::extensions.geography,version=version+1,updated_at=now() where id=loc.id;
      end if;
      if patch?'category_slugs' then
        delete from app_private.service_categories where service_id=s.id;
        insert into app_private.service_categories(service_id,category_id) select s.id,cat.id from app_private.categories cat where cat.slug in (select jsonb_array_elements_text(patch->'category_slugs'));
      end if;
      if patch?'hours' then
        delete from app_private.opening_hours where service_id=s.id;
        insert into app_private.opening_hours(service_id,weekday,opens_at,closes_at,notes,sequence)
          select s.id,(h.value->>'weekday')::smallint,(h.value->>'opens_at')::time,(h.value->>'closes_at')::time,h.value->>'notes',row_number() over(partition by h.value->>'weekday' order by h.ordinality)::smallint from jsonb_array_elements(patch->'hours') with ordinality h;
      end if;
    end if;
    update app_private.organization_revisions set status=desired,reviewer_id=p_actor,review_note=note,reviewed_at=now() where id=r.id returning * into r;
    insert into app_private.organization_audit(actor_id,action,target_id,details) values(p_actor,'revision.'||desired,r.id,jsonb_build_object('service_id',r.service_id,'submitted_by',r.user_id));
    return to_jsonb(r);
  end if;
  raise exception using errcode='P0001',message='OG_NOT_FOUND';
exception
  when unique_violation then raise exception using errcode='P0001',message='OG_CONFLICT';
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or not_null_violation or check_violation then raise exception using errcode='P0001',message='OG_VALIDATION_ERROR';
end;
$$;

-- Remove default function EXECUTE and all browser grants, including accidental
-- default grants in a Supabase project. Private helpers are owner-only.
revoke all on function app_private.organization_command(uuid,text,jsonb),app_private.account_rate_gate(text,text),app_private.organization_limit(text,integer,integer),app_private.organization_safe_url(text),app_private.organization_listing_snapshot(uuid),app_private.organization_validate_patch(jsonb),app_private.organization_audit_immutable() from public;
grant execute on function app_private.organization_command(uuid,text,jsonb),app_private.account_rate_gate(text,text) to our_ground_api;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on schema app_private from %I',r);
      execute format('revoke all on all tables in schema app_private from %I',r);
      execute format('revoke all on all sequences in schema app_private from %I',r);
      execute format('revoke all on function app_private.organization_command(uuid,text,jsonb),app_private.account_rate_gate(text,text),app_private.organization_limit(text,integer,integer),app_private.organization_safe_url(text),app_private.organization_listing_snapshot(uuid),app_private.organization_validate_patch(jsonb),app_private.organization_audit_immutable() from %I',r);
    end if;
  end loop;
end $$;
