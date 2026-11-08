import postgres from 'postgres';
import {runtimeDatabaseConfiguration} from './database-security.ts';
import type {USResourceStateCode} from '../shared/resource-geography.ts';

export interface GeographicCandidate {
 id:string; canonical_name:string; display_name:string; state:USResourceStateCode; kind:'place'|'state';
 latitude:number; longitude:number; coordinate_precision:'representative';
 source:{provider:'census';id:string;url:string;vintage:2026;geographic_id:string;geoid_fq:string;ansi_code:string|null;imported_at:string};
 match:{method:'exact'|'normalized'|'fuzzy';query:string;matched_name:string;local_similarity:number;edit_distance:number;exact_match:boolean;ambiguous_matches:number};
}
export interface GeographicReference {
 findCandidates(query:string,state?:USResourceStateCode,limit?:number,signal?:AbortSignal):Promise<GeographicCandidate[]>;
 close?():Promise<void>;
}
export class GeographicReferenceError extends Error {
 code='GEOGRAPHIC_REFERENCE_UNAVAILABLE';status=503;
 constructor(){super('Geographic reference suggestions are temporarily unavailable.');}
}
/** Dedicated restricted-role pool. No resident query or coordinates are stored. */
export function createPostgresGeographicReference(env:Record<string,string|undefined>=process.env):GeographicReference {
 let sql:ReturnType<typeof postgres>|undefined;let queue:Promise<void>=Promise.resolve();
 function client(){const config=runtimeDatabaseConfiguration(env);return sql??=postgres(config.connection,{max:1,prepare:false,ssl:config.ssl,connect_timeout:5,idle_timeout:20,onnotice:()=>{}});}
 return {
  findCandidates(query,state,limit=5,signal){
   if(typeof query!=='string'||query.trim().length<2||query.length>80||/[\u0000-\u001f\u007f]/.test(query)||!Number.isInteger(limit)||limit<1||limit>5)return Promise.resolve([]);
   const pending=queue.then(async()=>{
    signal?.throwIfAborted();
    try{return await client().begin(async tx=>{
     await tx`set local statement_timeout='750ms'`;
     const [role]=await tx`select current_user as name`;if(role?.name!=='our_ground_api')throw new GeographicReferenceError();
     signal?.throwIfAborted();
     const request=tx.unsafe('select app_private.geographic_reference_find($1::text,$2::text,$3::integer) as candidates',[query,state??null,limit]);
     const cancel=()=>{try{request.cancel();}catch{/* The query may already have completed. */}};signal?.addEventListener('abort',cancel,{once:true});
     try{const [row]=await request;signal?.throwIfAborted();return (row?.candidates??[]) as GeographicCandidate[];}
     finally{signal?.removeEventListener('abort',cancel);}
    });}catch(error){if(signal?.aborted)throw signal.reason;if(error instanceof GeographicReferenceError)throw error;throw new GeographicReferenceError();}
   });
   queue=pending.then(()=>undefined,()=>undefined);return pending;
  },
  async close(){await queue;await sql?.end();sql=undefined;}
 };
}
