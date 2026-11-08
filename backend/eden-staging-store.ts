import {createHash} from 'node:crypto';
import postgres from 'postgres';
import {stagingLimitConfig} from './staging-limiter.ts';

type Env=Record<string,string|undefined>;
const clients=new WeakMap<Env,ReturnType<typeof postgres>>();
// Only the fixed internal command shapes used by hosted Eden are understood.
// No Redis scripts, arbitrary keys or arbitrary SQL are executed on this path.
export async function stagingEdenStore(env:Env,command:string[]) {
  const config=stagingLimitConfig(env);
  const [cmd]=command;
  const key=cmd==='EVAL'?command[3]:command[1];
  if (!key||!/^og:adult:eden:v1:(session|speech|turn|rate):[\w:.\-]{1,220}$/.test(key))throw Error('Unsupported staging ticket');
  let op=cmd,value='',ttl=0;
  if(cmd==='EVAL'&&command.length===5&&command[2]==='1'&&key.startsWith('og:adult:eden:v1:rate:')){op='COUNT';ttl=Number(command[4]);}
  else if(cmd==='SET'&&command.length===6&&command[3]==='EX'&&command[5]==='NX'){value=command[2];ttl=Number(command[4]);}
  else if(!(['GET','GETDEL','DEL'].includes(cmd)&&command.length===2))throw Error('Unsupported staging operation');
  if(!Number.isSafeInteger(ttl)||Buffer.byteLength(value)>32768)throw Error('Invalid ticket');
  const digest=createHash('sha256').update(key).digest('hex');
  let sql=clients.get(env);
  if(!sql){sql=postgres(config.connection,{max:2,prepare:false,ssl:config.ssl,connect_timeout:3,idle_timeout:10,connection:{statement_timeout:2000},onnotice:()=>{}});clients.set(env,sql);}
  const [row]=await sql`select eden_staging_limits.eden_op(${op},${digest},${value},${ttl}) as result`;
  return op==='COUNT'?Number(row.result):cmd==='DEL'?(row.result===null?0:1):row.result;
}
