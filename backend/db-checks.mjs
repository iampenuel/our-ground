export const requiredTables = ['app_users','organizations','organization_memberships','service_locations','services','categories','service_categories','opening_hours','correction_reports','campaigns','organization_claims','organization_listing_access','organization_revisions','organization_audit','organization_revoked_sessions','organization_action_limits','resource_data_sources','resource_import_runs','resource_source_records','resource_source_versions','resource_privacy_holds','resource_privacy_events','geographic_reference_imports','geographic_reference_records','geographic_reference_names','privacy_retention_holds','food_source_row_lineage'];
export async function inspectDatabase(sql) {
  const tables = await sql`select tablename from pg_tables where schemaname='app_private' order by tablename`;
  const relations = await sql`select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition from pg_constraint where connamespace='app_private'::regnamespace and contype='f'`;
  const roles = await sql`select rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname in ('our_ground_api','anon','authenticated')`;
  const problems = [];
  for (const table of requiredTables) if (!tables.some(t=>t.tablename===table)) problems.push('Missing table: '+table);
  if (!relations.some(r=>r.table_name==='app_private.services' && r.definition.includes('FOREIGN KEY (location_id, organization_id)'))) problems.push('Missing service/location organization foreign key');
  for (const [table,target] of [['organization_memberships','organizations'],['organization_memberships','app_users'],['service_locations','organizations'],['services','organizations'],['service_categories','services'],['service_categories','categories'],['opening_hours','services'],['correction_reports','services'],['campaigns','organizations']]) {
    if (!relations.some(r=>r.table_name==='app_private.'+table && r.definition.includes('REFERENCES app_private.'+target+'('))) problems.push('Missing relationship: '+table+' → '+target);
  }
  const role = roles.find(r=>r.rolname==='our_ground_api');
  if (!role || role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls) problems.push('API role missing or has elevated role attributes');
  if (role) {
    const [p] = await sql`select has_schema_privilege('our_ground_api','app_private','USAGE') as schema_usage,has_schema_privilege('our_ground_api','app_private','CREATE') as schema_create,has_column_privilege('our_ground_api','app_private.app_users','role','UPDATE') as role_update,has_table_privilege('our_ground_api','app_private.organization_memberships','INSERT') as membership_insert,has_column_privilege('our_ground_api','app_private.services','title','UPDATE') as service_update,has_column_privilege('our_ground_api','app_private.services','organization_id','UPDATE') as ownership_update`;
    if (!p.schema_usage || p.schema_create || p.role_update || p.membership_insert || p.service_update || p.ownership_update) problems.push('Unexpected API role privileges');
    const inherited = await sql`select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='our_ground_api')`;
    if (inherited.length) problems.push('API role inherits another role; inspect before use');
  }
  for (const role of roles.filter(r=>r.rolname!=='our_ground_api')) {
    const [p] = await sql`select has_schema_privilege(${role.rolname},'app_private','USAGE') as allowed`;
    if (p.allowed) problems.push('Browser role has private-schema access: '+role.rolname);
  }
  const protectedTables = ['app_users','organizations','organization_memberships','service_locations','services','categories','service_categories','opening_hours','correction_reports','campaigns','organization_claims','organization_listing_access','organization_revisions','organization_audit','organization_revoked_sessions','organization_action_limits','resource_data_sources','resource_import_runs','resource_source_records','resource_source_versions','resource_privacy_holds','resource_privacy_events','geographic_reference_imports','geographic_reference_records','geographic_reference_names','privacy_retention_holds','food_source_row_lineage'];
  const policyRows = await sql`select c.relname,c.relrowsecurity,has_table_privilege('our_ground_api',c.oid,'INSERT,UPDATE,DELETE') as writable,has_table_privilege('our_ground_api',c.oid,'SELECT') as readable from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'`;
  for (const table of protectedTables) {
    const row=policyRows.find(r=>r.relname===table);
    if(!row?.relrowsecurity || row.writable || row.readable) problems.push('Organization workflow table is not protected: '+table);
  }
  const [commands] = await sql`select has_function_privilege('our_ground_api','app_private.organization_request(uuid,text,jsonb,uuid,text)','EXECUTE') as request,has_function_privilege('our_ground_api','app_private.organization_command(uuid,text,jsonb)','EXECUTE') as command,has_function_privilege('our_ground_api','app_private.organization_command_v7b(uuid,text,jsonb)','EXECUTE') as core,has_function_privilege('our_ground_api','app_private.organization_listing_snapshot(uuid)','EXECUTE') as helper`;
  if(!commands.request || commands.command || commands.core || commands.helper) problems.push('Unexpected organization workflow function grants');
  const owners=await sql`select c.relname,p.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles p on p.oid=c.relowner where n.nspname='app_private' and p.rolname='our_ground_api'`;
  if(owners.length)problems.push('Runtime role owns application objects');
  const unsafePaths=await sql`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.prosecdef and (p.proconfig is null or not exists(select 1 from unnest(p.proconfig) x where x like 'search_path=pg_catalog%'))`;
  if(unsafePaths.length)problems.push('Privileged function lacks a fixed pg_catalog-first search path');
  const [privacy] = await sql`select has_function_privilege('our_ground_api','app_private.privacy_retention(boolean,uuid)','EXECUTE') as retention,has_function_privilege('our_ground_api','app_private.privacy_redact_subject(uuid,uuid,boolean)','EXECUTE') as redact`;
  if(privacy.retention || privacy.redact)problems.push('Runtime role can invoke owner privacy maintenance');
  const [boundedPrivacy]=await sql`select has_function_privilege('our_ground_api','app_private.privacy_retention_bounded(boolean,uuid,integer,integer)','EXECUTE') as allowed`;
  if(boundedPrivacy.allowed)problems.push('Runtime role can invoke bounded owner privacy maintenance');
  for(const role of ['our_ground_api',...roles.filter(r=>r.rolname!=='our_ground_api').map(r=>r.rolname)]) {
    const [holds]=await sql`select has_function_privilege(${role},'app_private.privacy_hold_set(uuid,text,text,text,text,boolean)','EXECUTE') as setter,has_function_privilege(${role},'app_private.privacy_record_held(text,text,uuid,uuid,uuid,uuid)','EXECUTE') as record,has_function_privilege(${role},'app_private.privacy_audit_held(bigint)','EXECUTE') as audit`;
    if(holds.setter || holds.record || holds.audit)problems.push('Application/browser role can manage or inspect preservation holds: '+role);
  }
  const [discovery] = await sql`select has_function_privilege('our_ground_api','app_private.public_resource_search(double precision,double precision,double precision,text,text,integer,integer,boolean,boolean)','EXECUTE') as search,has_function_privilege('our_ground_api','app_private.resource_import_batch(uuid,jsonb)','EXECUTE') as importer,has_table_privilege('our_ground_api','app_private.public_resource_provenance','SELECT') as provenance`;
  if(!discovery.search || discovery.importer || !discovery.provenance)problems.push('Unexpected public discovery/import grants');
  const[foodPresent]=await sql`select to_regprocedure('app_private.food_import_batch(uuid,jsonb)') is not null as ready`;
  if(foodPresent.ready)for(const role of ['our_ground_api',...roles.filter(r=>r.rolname!=='our_ground_api').map(r=>r.rolname)]){
    const[p]=await sql`select has_function_privilege(${role},'app_private.food_import_batch(uuid,jsonb)','EXECUTE') as importer,has_function_privilege(${role},'app_private.food_privacy_withdraw(uuid,jsonb)','EXECUTE') as withdrawal`;
    if(p.importer||p.withdrawal)problems.push('Application/browser role can invoke owner food ingestion or privacy withdrawal: '+role);
  }
  const[lineagePresent]=await sql`select to_regclass('app_private.food_source_row_lineage') is not null as ready`;
  if(lineagePresent.ready){
    const[lineage]=await sql`select relrowsecurity from pg_class where oid='app_private.food_source_row_lineage'::regclass`;if(!lineage.relrowsecurity)problems.push('Food source row lineage lacks RLS');
    for(const role of ['our_ground_api',...roles.filter(r=>r.rolname!=='our_ground_api').map(r=>r.rolname)]){const[p]=await sql`select has_table_privilege(${role},'app_private.food_source_row_lineage','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege(${role},'app_private.food_lineage_preserve()','EXECUTE') as allowed`;if(p.allowed)problems.push('Application/browser role can access private food source lineage: '+role);}
  }
  const [withdrawal] = await sql`select has_function_privilege('our_ground_api','app_private.resource_privacy_withdraw(uuid,jsonb)','EXECUTE') as withdraw,has_function_privilege('our_ground_api','app_private.resource_privacy_review_release(text,text,uuid,text)','EXECUTE') as release`;
  if(withdrawal.withdraw || withdrawal.release)problems.push('Runtime role can manage privacy withdrawals');
  const [reference] = await sql`select has_function_privilege('our_ground_api','app_private.geographic_reference_find(text,text,integer)','EXECUTE') as search,has_function_privilege('our_ground_api','app_private.geographic_reference_import_batch(uuid,jsonb)','EXECUTE') as importer,has_function_privilege('our_ground_api','app_private.geographic_reference_normalize(text)','EXECUTE') as normalize`;
  if(!reference.search || reference.importer || reference.normalize)problems.push('Unexpected canonical geographic reference function grants');
  const indexes = await sql`select indexname,indexdef from pg_indexes where schemaname='app_private'`;
  if (!indexes.some(i=>i.indexdef.includes('USING gist (point)'))) problems.push('Missing geographic search index');
  if(!indexes.some(i=>i.indexname==='geographic_reference_names_trgm_idx' && i.indexdef.includes('gist_trgm_ops')))problems.push('Missing geographic name similarity index');
  return { tables:tables.map(t=>t.tablename),foreign_keys:relations.length,indexes:indexes.length,problems };
}
