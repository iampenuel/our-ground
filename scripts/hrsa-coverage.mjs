import postgres from 'postgres';
import {writeFile} from 'node:fs/promises';
const connection=process.env.NATIONAL_TEST_DATABASE_URL;
if(!connection)throw Error('Set NATIONAL_TEST_DATABASE_URL to the disposable local ourground_7d database.');
const u=new URL(connection);if(!['127.0.0.1','localhost'].includes(u.hostname)||!/^\/ourground_7d[a-z0-9_]*$/.test(u.pathname))throw Error('Coverage measurement is restricted to the explicit local Phase7D database.');
const sql=postgres(connection,{ssl:false,max:1,prepare:false,onnotice:()=>{}});
const cities=[['Harrisburg',40.2732,-76.8867],['Philadelphia',39.9526,-75.1652],['San Francisco',37.7749,-122.4194],['New York',40.7128,-74.006],['Boston',42.3601,-71.0589],['Chicago',41.8781,-87.6298],['Houston',29.7604,-95.3698],['Seattle',47.6062,-122.3321],['Los Angeles',34.0522,-118.2437],['Anchorage',61.2181,-149.9003],['Honolulu',21.3099,-157.8581],['Washington DC',38.9072,-77.0369]];
try{
 const [run]=await sql`select source_id,checksum,source_updated_at,imported_at,completed_at,summary from app_private.resource_import_runs where completed_at is not null order by imported_at desc limit 1`;
 const states=await sql`select l.state,count(*)::int as healthcare_sites from app_private.resource_source_records sr join app_private.services s on s.id=sr.service_id join app_private.service_locations l on l.id=s.location_id where sr.source_id='hrsa-health-centers' and sr.record_status='active' group by l.state order by l.state`;
 const counts=await sql`select count(distinct sr.organization_id)::int as organizations,count(*)::int as healthcare_sites,count(*) filter(where s.eligibility_text is not null)::int as eligibility_claims,count(*) filter(where s.cost_summary is not null)::int as cost_claims,(select count(*)::int from app_private.opening_hours h join app_private.resource_source_records r on r.service_id=h.service_id) as opening_hour_rows from app_private.resource_source_records sr join app_private.services s on s.id=sr.service_id`;
 const [planRow]=await sql`explain (analyze,buffers,format json) select id from app_private.service_locations where extensions.st_dwithin(point,extensions.st_setsrid(extensions.st_makepoint(-122.4194,37.7749),4326)::extensions.geography,16093.44)`;
 const citiesMeasured=[];
 await sql.begin(async tx=>{
   await tx`set local role our_ground_api`;
   const search=(lat,lng)=>tx`select app_private.public_resource_search(${lat},${lng},10,'healthcare','',1,20,false,false) as result`;
   for(const [city,lat,lng]of cities){
     await search(lat,lng);const times=[];let result;
     for(let i=0;i<5;i++){const start=performance.now();[result]=await search(lat,lng);times.push(performance.now()-start);}
     times.sort((a,b)=>a-b);const first=result.result.items[0];
     citiesMeasured.push({city,latitude:lat,longitude:lng,radius_miles:10,total:result.result.total,returned:result.result.items.length,nearest_source_id:first?.provenance?.source_record_id,nearest_distance_miles:first?.distance_miles,median_sql_round_trip_ms:Number(times[2].toFixed(2)),max_sql_round_trip_ms:Number(times[4].toFixed(2))});
   }
 });
 const report={measured_at:new Date().toISOString(),environment:'Disposable local PostgreSQL18/PostGIS, loopback; no hosted or production measurement',source:run,counts:counts[0],states:[...states],cities:citiesMeasured,index_plan:planRow['QUERY PLAN'],limits:'Five warm SQL round trips per city, not end-to-end browser/API benchmarks; local hardware/load only. Authoritative source listing does not prove current patient availability.'};
 const output=process.argv[2];if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
}finally{await sql.end();}
