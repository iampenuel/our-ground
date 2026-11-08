import {handleApi} from '../backend/app.ts';
import {adultGate,redis} from '../backend/adult-access.ts';
import {productionDependencies} from '../backend/runtime.ts';
const deps=productionDependencies();
async function serve(request:Request) {
  const gate=await adultGate(request,{ADULT_SESSION_SECRET:process.env.ADULT_SESSION_SECRET});
  if (gate) return gate;
  const url=new URL(request.url);
  const route=(url.searchParams.get('path')??url.pathname.replace(/^\/api\/v1\/?/, '')).replace(/^\/+|\/+$/g,'');
  if(request.method==='POST' && route==='correction-reports'){
    let open=false;
    try { open = await redis(process.env,['GET','og:corrections:production:intake'])==='monitored'; } catch { /* A failed availability check closes intake. */ }
    if(!open)return Response.json({error:{code:'CORRECTIONS_PAUSED',message:'Listing reports are temporarily paused.'}},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return handleApi(request,deps);
}
export {serve as GET,serve as POST,serve as PATCH,serve as DELETE};
