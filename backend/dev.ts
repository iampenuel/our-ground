import { createServer } from 'node:http';
import { handleApi } from './app.ts';
import { productionDependencies } from './runtime.ts';
import { attestLocalDevelopmentRequest } from './local-transport.ts';

if (process.argv.includes('--demo')) {
  process.env.BACKEND_DATA_MODE = 'demo';
  process.env.ALLOW_DEMO_DATA = 'true';
}
const deps = productionDependencies();
const port = Number(process.env.API_PORT ?? 8787);
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort());
  outgoing.once('close', () => { if (!outgoing.writableFinished) controller.abort(); });
  let timedOut=false;
  const reject=(status:number,code:string,message:string)=>{if(!outgoing.headersSent){outgoing.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});outgoing.end(JSON.stringify({error:{code,message}}),()=>incoming.destroy());}};
  const deadline=setTimeout(()=>{timedOut=true;reject(408,'REQUEST_TIMEOUT','The request body took too long.');},5000);
  const parts: Buffer[] = [];
  let size = 0;
  try {for await (const chunk of incoming) {
    size += chunk.length;
    if (size > 16384) {
      reject(413,'BODY_TOO_LARGE','Request body is too large.');
      return;
    }
    parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }}catch{if(!timedOut)reject(400,'REQUEST_INTERRUPTED','The request could not be read.');return;}finally{clearTimeout(deadline);}
  if(timedOut)return;
  const body = parts.length ? Buffer.concat(parts) : undefined;
  const host=incoming.headers.host??('localhost:'+port);
  if(!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)){outgoing.writeHead(403,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({error:{code:'HOST_DENIED',message:'Use the local preview address.'}}));return;}
  const url = 'http://' + host + (incoming.url ?? '/');
  const request = new Request(url, {
    method: incoming.method,
    signal: controller.signal,
    headers: incoming.headers as HeadersInit,
    body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : body
  });
  attestLocalDevelopmentRequest(request, server, incoming.socket);
  const response = await handleApi(request, deps);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => {
  console.log('Our Ground API listening on http://localhost:' + port + '/api/v1/health');
});
