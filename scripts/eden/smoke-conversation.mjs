// Opt-in provider smoke. The fixture uses no visitor, account or real listing data.
import {createEdenAgent} from '../../backend/eden-agent.ts';
import {createEdenProvider} from '../../backend/eden-provider.ts';
import {DemoRepository} from '../../backend/demo.ts';
import {projectPublicRequest} from '../../shared/eden-conversation.ts';
import {EDEN_NOTICE_VERSION as noticeVersion} from '../../shared/eden-assistant.ts';
const env={...process.env,BACKEND_DATA_MODE:'demo',ALLOW_DEMO_DATA:'true'};
const model=createEdenProvider(env).status();
const report={scope:'local synthetic',model:model.model,provider:'Google Gemini Interactions',configured:model.available,reason:model.reason,checks:{}};
try{
  if(!model.available)throw Error('Provider is not eligible in this environment.');
  const agent=createEdenAgent(env,{repository:new DemoRepository()});
  const context={page:'home',synthetic:true,resultCount:0,resourceIds:[]};
  const signal=AbortSignal.timeout(55_000);
  const greeting=await agent.understand(projectPublicRequest('hii'),context,[],null,signal);
  report.checks.greeting=greeting.choice.kind==='message'&&greeting.choice.key==='greet';
  const intent={goal:'navigate-public',page:'give'};
  const plan=await agent.begin({intent,context,noticeVersion},'provider-smoke',signal);
  report.checks.functionCall=plan.action?.type==='navigate-public'&&plan.action.page==='give';
  if(!report.checks.functionCall)throw Error('Unexpected function.');
  // The simulated browser confirmation is deliberately identified in the report.
  const reply=await agent.complete({turnToken:plan.turnToken,outcome:'done',resourceIds:[],context:{...context,page:'give'},noticeVersion},'provider-smoke',signal);
  report.checks.groundedReply=reply.sources.some(f=>f.id==='page-give-1');
  report.resultContext='fixture';
  if(Object.values(report.checks).some(v=>!v))throw Error('Validation failed.');
}catch(error){report.error=error.code??'SMOKE_FAILED';report.status=error.status??null;process.exitCode=1;}
console.log(JSON.stringify(report));
