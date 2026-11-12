import {createHostedEden} from '../backend/eden-hosted.ts';
import {handleApi} from '../backend/app.ts';
import {publicApiRoute} from '../backend/api-route.ts';
import {adultGate} from '../backend/adult-access.ts';
import {redis} from '../backend/hosted-store.ts';
import {productionDependencies} from '../backend/runtime.ts';
const deps=productionDependencies();
const hostedEden=createHostedEden(deps,process.env);
async function serve(request:Request) {
  const gate=await adultGate(request,process.env);
  if (gate) return gate;
  const url=new URL(request.url);
  const route=publicApiRoute(url);
  if(route.startsWith('eden/hosted/')) return hostedEden(request,route.slice('eden/hosted/'.length));
  if(request.method==='POST' && route==='correction-reports'){
    let open=false;
    try { open = await redis(process.env,['GET','og:corrections:production:intake'])==='monitored'; } catch { /* A failed availability check closes intake. */ }
    if(!open)return Response.json({error:{code:'CORRECTIONS_PAUSED',message:'Listing reports are temporarily paused.'}},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return handleApi(request,deps);
}
export {serve as GET,serve as POST,serve as PATCH,serve as DELETE};
