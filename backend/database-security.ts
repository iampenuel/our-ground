import { checkServerIdentity, type PeerCertificate } from 'node:tls';
import { UnavailableError } from './errors.ts';
type DatabaseEnvironment=Record<string,string|undefined>;
export function databaseTls(env:DatabaseEnvironment,connection:string):false|{rejectUnauthorized:true;ca?:string;checkServerIdentity:(hostname:string,cert:PeerCertificate)=>Error|undefined}{
 let url:URL;
 try{url=new URL(connection);}catch{throw new UnavailableError('DATABASE_CONFIG_INVALID','The database connection is not safely configured.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||connection!==connection.trim())throw new UnavailableError('DATABASE_CONFIG_INVALID','The database connection is not safely configured.');
 if(env.DB_SSL==='disable'){
  if(env.VERCEL==='1'||env.NODE_ENV==='production'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new UnavailableError('DATABASE_TLS_INVALID','Database certificate verification is required.');
  return false;
 }
 const ca=env.DATABASE_SSL_CA?.replaceAll('\\n','\n');
 if(ca && (!ca.includes('-----BEGIN CERTIFICATE-----')||!ca.includes('-----END CERTIFICATE-----')))throw new UnavailableError('DATABASE_TLS_INVALID','The database CA certificate is not valid.');
 return {rejectUnauthorized:true,...(ca?{ca}:{}),checkServerIdentity:(_hostname,cert)=>checkServerIdentity(url.hostname.replace(/^\[|\]$/g,''),cert)};
}
export function runtimeDatabaseConfiguration(env:DatabaseEnvironment){
 const connection=env.DATABASE_URL;
 if(!connection)throw new UnavailableError('DATABASE_NOT_CONFIGURED','Resource information is temporarily unavailable.');
 let url:URL;try{url=new URL(connection);}catch{throw new UnavailableError('DATABASE_CONFIG_INVALID','The database connection is not safely configured.');}
 let username:string;try{username=decodeURIComponent(url.username);}catch{throw new UnavailableError('DATABASE_CONFIG_INVALID','The database connection is not safely configured.');}
 if(!/^our_ground_api(?:\.[a-z0-9]{10,30})?$/.test(username)||connection===env.MIGRATION_DATABASE_URL)throw new UnavailableError('RUNTIME_ROLE_INVALID','The runtime database connection must use the restricted application role.');
 return {connection,ssl:databaseTls(env,connection)};
}
