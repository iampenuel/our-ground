// Reads the existing nonproduction directory only. Does not start services,
// import data, call a geocoder, mint tokens or change database state.
import {PostgresRepository,closeDatabase} from '../backend/postgres.ts';
import {createPostgresGeographicReference} from '../backend/geographic-reference.ts';
import {createDirectoryCityLookup} from '../backend/directory-city.ts';
import {createEdenDirectory} from '../backend/eden-directory.ts';
import {combineSupportResults,supportMapPoints} from '../src/support-model.ts';
import postgres from 'postgres';
import {runtimeDatabaseConfiguration} from '../backend/database-security.ts';
import {inspectDatabase} from '../backend/db-checks.mjs';

// Read catalog metadata and the published projection only. Never read private
// source rows, return credentials, or use the migration/owner connection.
async function inspectPublishedDirectory() {
  const {connection,ssl}=runtimeDatabaseConfiguration(process.env);
  const sql=postgres(connection,{ssl,max:1,prepare:false,connect_timeout:5,onnotice:()=>{}});
  try {
    return await sql.begin('read only',async tx=>{
      await tx`set local statement_timeout='10s'`;
      const [instance]=await tx`select current_user as role,current_setting('server_version_num') as pg_version,
        (select extversion from pg_extension e join pg_namespace n on n.oid=e.extnamespace
         where e.extname='postgis' and n.nspname='extensions') as postgis`;
      if(instance?.role!=='our_ground_api'||!instance.postgis)throw Error();
      const schema=await inspectDatabase(tx);
      if(schema.problems.length)throw Error();
      const counts=await tx`select c.slug as category,count(distinct p.service_id)::int as published
        from app_private.public_resource_provenance p
        join app_private.public_services s on s.id=p.service_id and not s.is_demo
        join app_private.public_service_locations l on l.id=s.location_id and not l.is_demo
        join app_private.public_organizations o on o.id=s.organization_id and not o.is_demo
        join app_private.public_service_categories sc on sc.service_id=s.id
        join app_private.public_categories c on c.id=sc.category_id
        where c.slug in ('healthcare','food') group by c.slug`;
      return {runtimeRole:instance.role,postgresVersionNumber:instance.pg_version,postgisVersion:instance.postgis,
        publishedImported:Object.fromEntries(['food','healthcare'].map(k=>[k,counts.find(c=>c.category===k)?.published??0]))};
    });
  } finally {await sql.end();}
}

async function verify() {
  if (!process.argv.includes('--confirmed-nonproduction') || !process.env.DATABASE_URL || process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV==='production') {
    console.log('BLOCKED: select the existing nonproduction restricted DATABASE_URL locally and pass --confirmed-nonproduction.');return 2;
  }
  const reference=createPostgresGeographicReference(),lookup=createDirectoryCityLookup(reference),repo=new PostgresRepository(),directory=createEdenDirectory(repo,lookup);
  let check='runtime role, schema, PostGIS or published inventory';
  try {
    console.log(JSON.stringify(await inspectPublishedDirectory()));
    check='restricted city search, list, detail or marker agreement';
    const positiveCategories=new Set();
    for (const [cityId,category] of [['harrisburg-pa','food'],['philadelphia-pa','food'],['harrisburg-pa','healthcare']]) {
      let previous=Infinity;
      for (const radius of [10,5]) {
        const q={cityId,category,radius},point=await lookup(cityId),found=await directory.search(q);
        if(found.total>previous)throw Error();
        previous=found.total;
        const page=await repo.search({lat:point.latitude,lng:point.longitude,radiusMiles:radius,category,page:1,pageSize:20,allowDemo:false});
        const list=combineSupportResults(page.items,[],'real');
        if(found.total!==page.total || list.length!==found.ids.length || list.some((r,i)=>r.record.id!==found.ids[i]))throw Error();
        let source;
        if(found.ids.length) {
          await directory.facts(found.ids[0],1);
          const selected=await repo.detail(found.ids[0],false),marker=supportMapPoints(list)[0];
          if(selected?.data_kind!=='imported_unverified'||marker?.place_id!=='directory:'+selected.id||
             marker.latitude!==selected.location.latitude||marker.longitude!==selected.location.longitude)throw Error();
          positiveCategories.add(category);
          source={id:selected.provenance.source_id,updated:selected.provenance.source_updated_at,status:selected.provenance.verification_status};
        }
        console.log(JSON.stringify({cityId,category,radius,total:found.total,loaded:found.ids.length,selectedDetailAndPoint:found.ids.length?'matched':'no selection',source}));
      }
    }
    const missing=['food','healthcare'].filter(category=>!positiveCategories.has(category));
    if(missing.length){console.log('BLOCKED: no positive source-backed detail and marker to verify for '+missing.join(', ')+' in the probed areas. Confirm source coverage; do not seed a listing.');return 2;}
    console.log('PASS: read-only directory, geographic refinement, first details and marker data. Browser rendering and Gemini require separate verification.');return 0;
  } catch { console.log('BLOCKED: unable to verify '+check+'. No credentials or contact data are reported.');return 2; }
  finally { await reference.close();await closeDatabase(); }
}
process.exitCode=await verify();
