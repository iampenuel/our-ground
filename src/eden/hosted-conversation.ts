import {publicPageHeading} from '../../shared/eden-public-pages.ts';
import {EDEN_NOTICE_VERSION,type EdenAction} from '../../shared/eden-assistant.ts';
import {reduceEdenAgentInput,sameDirectoryView,validateEdenAgentContext,validateEdenAgentActionResponse,validateAgentReplyResponse,type EdenAgentIntent} from '../../shared/eden-agent.ts';
import {conversationChoices,projectPublicRequest,suggestedCity,socialReply,validSocialText,profileReply,type EdenConversationMemory,type PublicDecision,type EdenSurface} from '../../shared/eden-conversation.ts';
import {edenLocalPageContext,edenPageContext,clearEdenRememberedSearch} from './application-bridge.ts';
import {applyEdenPublicAction} from './live-actions.ts';
import {applyPageControlResult,currentPageControls} from './page-controls.ts';
import {clearTurnTrace,startTurnTrace,type EdenTurnDiagnostic} from './turn-diagnostic.ts';

export function currentHostedContext(){
  const page=edenPageContext(),view=edenLocalPageContext();
  if(page.synthetic)return null;
  const rows=view.results.filter(r=>r.kind==='directory' && r.id);
  const visibleHeading=document.querySelector<HTMLElement>('#app main h1');
  const heading=visibleHeading?publicPageHeading(page.page,visibleHeading.innerText.replace(/\s+/g,' ').trim()):undefined;
  const selected=rows.findIndex(r=>r.selected);
  return validateEdenAgentContext({...page,directory:'public',...(heading?{heading}:{}),resultCount:rows.length,
    resourceIds:rows.map(r=>r.id),...(selected<0?{}:{selectedIndex:selected+1}),
    ...(['support','resource'].includes(page.page)?{view:view.mapState==='not-shown'?'list':'map',mappedCount:view.results.filter(r=>r.kind==='mapped').length,...(view.hasFilter?{filtered:true}:{})}:{}),
    ...(view.cityId?{cityId:view.cityId}:{}),searchState:view.loading,mapState:view.mapState});
}

type CommandOptions={
  text:string;signal:AbortSignal;aiAvailable:boolean;onStatus:(message:string)=>void;
  request:(path:string,body:unknown,signal?:AbortSignal,correlationId?:string)=>Promise<Response>;
};
export type CommandReply={reply:string;speechTicket?:string};
function directControl(text:string):EdenSurface|undefined{
  const v=text.toLowerCase().trim().replace(/^(?:hey )?eden[, :]*/,'').replace(/^please /,'').replace(/[.!?]+$/,'').trim();
  if(/^(?:scroll|jump)(?: down| up)? to (?:the )?(?:matching )?(?:results|listings)$/.test(v))return 'scroll-results';
  if(/^(?:show(?: me)? (?:where )?(?:the )?map(?: is)?|switch to (?:the )?map(?: view)?)$/.test(v))return 'show-map';
  if(/^(?:show(?: me)?|switch to|go back to) (?:the )?list(?: view| instead of (?:the )?map)?$/.test(v))return 'show-list';
  if(/^(?:scroll|jump) (?:back )?(?:up|to the top)$/.test(v))return 'scroll-up';
  if(/^scroll down$/.test(v))return 'scroll-down';
  if(/^(?:scroll|jump)(?: down| up)? to (?:the )?search(?: form)?$/.test(v))return 'scroll-search';
  if(/^focus (?:the )?(?:city|location)(?: field| input)?$/.test(v))return 'focus-location';
  if(/^focus (?:the )?(?:radius|distance)(?: field| control)?$/.test(v))return 'focus-radius';
  if(/^(?:submit|run) (?:this |the |my )?search$/.test(v))return 'submit-search';
}
function localAction(intent:EdenAgentIntent):EdenAction|null{
  switch(intent.goal){
    case 'find-resources':return {type:'search',city:intent.cityId,category:intent.category,radius:intent.radius??10};
    case 'change-category':return {type:'refine',category:intent.category};
    case 'adjust-distance':return {type:'radius',radius:intent.radius};
    case 'inspect-resource':return {type:intent.view==='map'?'select':'details',index:intent.ordinal};
    case 'navigate-public':return {type:'navigate-public',page:intent.page};
    case 'explain-page':return {type:'read-page'};
    case 'read-results':case 'navigate-support':case 'clear-filters':return {type:intent.goal};
    default:return null;
  }
}
const ticketFrom=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)?{speechTicket:value}:{};
export function createHostedConversation(){
  let previous:EdenConversationMemory|undefined;
  let correction:{city:string;category?:'food'|'healthcare'|'community'}|undefined;
  function clear(){
    previous=undefined;correction=undefined;clearEdenRememberedSearch();
    clearTurnTrace();
  }
  async function run(options:CommandOptions):Promise<CommandReply & {outcome:EdenTurnDiagnostic['outcome']}>{
    const trace=startTurnTrace();
    try{const reply=await processTurn(options,trace);return {...reply,outcome:trace.diagnostic.outcome};}
    catch(error){trace.update({output:'unavailable',outcome:options.signal.aborted?'cancelled':'failed'});throw error;}
  }
  async function processTurn(options:CommandOptions,trace:ReturnType<typeof startTurnTrace>):Promise<CommandReply>{
    const {signal,request,onStatus,aiAvailable}=options;
    const remote=async(path:string,body:unknown)=>{
      trace.update({provider:'undetermined',model:null,output:'tool-selection',outcome:'pending'});
      const res=await request(path,body,signal,trace.diagnostic.correlationId);
      trace.observe(res);signal.throwIfAborted();return res.json();
    };
    const say=(reply:string,outcome:'confirmed'|'clarification'|'unavailable'='clarification')=>{
      trace.update({outcome});return {reply};
    };
    const runControl=async(control:EdenSurface)=>{
      trace.update({proposedAction:control,output:'page-control-result',outcome:'pending'});
      onStatus('Using the page control…');
      const available=currentPageControls().includes(control);
      if(!available)return say('That control is unavailable on this page.','unavailable');
      const result=await applyPageControlResult(control,signal);
      signal.throwIfAborted();
      return say(result.message,result.status==='done'?'confirmed':result.status==='clarify'?'clarification':'unavailable');
    };
    signal.throwIfAborted();
    let text=options.text.trim();
    const accepted=correction && /^(?:yes|correct|that’s right|that's right)[.!]?$/i.test(text)?correction:undefined;
    correction=undefined;
    if(accepted)text=accepted.category?'find '+accepted.category+' near '+accepted.city:accepted.city;
    const before=currentHostedContext();
    if(!before)throw Error('Eden needs a public page with a current directory view.');
    const symbols=projectPublicRequest(text);
    if(!symbols)return say('Please use a public city, resource category or page request. Leave out personal or medical details.');
    const local=directControl(text);
    if(local)return runControl(local);
    const pending=previous&&'goal'in previous&&previous.goal==='clarify-search'?previous:undefined;
    const reduced=reduceEdenAgentInput(text,before,pending);
    if(reduced.status==='clarify' && reduced.localOnly)return say(reduced.message);
    let intent=reduced.status==='supported'?reduced.intent:undefined;
    const uncertain=suggestedCity(text);
    if(uncertain && intent?.goal!=='find-resources' && !symbols.includes(uncertain.id)){
      correction={city:uncertain.query,category:symbols.includes('food')?'food':symbols.includes('healthcare')?'healthcare':before.category};
      return say('Did you mean '+uncertain.label+'? Reply yes or enter the city and state.');
    }
    const changed=()=>{throw Error('The page or selection changed. Please ask again using the current view.');};
    const check=(url:string,view:NonNullable<typeof before>,includeMap=false)=>{
      signal.throwIfAborted();if(location.href!==url||!sameDirectoryView(view,currentHostedContext(),includeMap))changed();
    };
    const controls=currentPageControls();
    const choices=conversationChoices(symbols,before,controls,previous);
    let followUp:number|undefined;
    if(!intent||intent.goal==='help'||choices.some(c=>c.kind==='search-and-open')){
      let chosen:PublicDecision|undefined;
      let replyText,speechTicket;
      if(aiAvailable){
        const url=location.href;
        onStatus('Thinking…');
        const decision=await remote('understand',{symbols,context:before,controls,previous:previous??null,noticeVersion:EDEN_NOTICE_VERSION});
        check(url,before);
        chosen=choices.find(candidate=>JSON.stringify(candidate)===JSON.stringify(decision?.choice));
        if(decision?.engine!=='gemini'||!chosen)throw Error('Eden could not verify the proposed action. Please try again.');
        ({reply:replyText,speechTicket}=decision);
      }else{
        // Public profile facts and explicit page controls also work without AI.
        chosen=choices.find(c=>c.kind==='message'&&(c.key==='identity'||c.key==='capabilities'));
        if(!chosen)return say('Gemini conversation is unavailable. You can still ask to open Find Support, show the map, or scroll to results.','unavailable');
      }
      if(chosen.kind==='control')return runControl(chosen.control);
      if(chosen.kind==='message'){
        if(chosen.key==='boundary')return say(socialReply.boundary);
        if(chosen.key==='identity'||chosen.key==='capabilities'){
          const grounded=profileReply(chosen.key,chosen.focus,symbols.includes('correction'));
          if(!grounded||(aiAvailable&&replyText!==grounded))throw Error('Eden could not verify its introduction.');
          previous={topic:chosen.key};
          trace.update({output:aiAvailable?'model-approved-facts':'application',proposedAction:chosen.key,outcome:'confirmed'});
          return {reply:grounded,...ticketFrom(speechTicket)};
        }
        if(!validSocialText(replyText))throw Error('Eden could not verify its reply. Please try again.');
        trace.update({output:chosen.key==='clarify'?'approved-clarification':'model-text',outcome:chosen.key==='clarify'?'clarification':'confirmed'});
        return {reply:replyText,...ticketFrom(speechTicket)};
      }
      if(chosen.kind==='search-and-open'){followUp=chosen.ordinal;trace.update({proposedAction:'search-and-open'});}
      intent=chosen.intent;
    }
    const apply=async(action:EdenAction)=>{
      if(action.type==='details'||action.type==='select'||action.type==='read-hours'){
        const id=currentHostedContext()?.resourceIds[action.index-1],index=edenLocalPageContext().results.findIndex(r=>r.id===id);
        if(!id||index<0)throw Error('That listing is no longer in the results.');
        action={...action,index:index+1};
      }
      return applyEdenPublicAction(action,{publicDirectory:true,signal});
    };
    async function perform(step:EdenAgentIntent,view:NonNullable<typeof before>){
      if(!aiAvailable){
        const action=localAction(step);
        if(!action)return say('Gemini conversation is unavailable. The public directory and navigation controls remain available.','unavailable');
        trace.update({proposedAction:action.type});onStatus('Using the page control…');
        const result=await apply(action);
        if(result.status==='done')previous=step;
        return say(result.message,result.status==='done'?'confirmed':'unavailable');
      }
      const url=location.href;onStatus('Thinking…');
      let raw:Awaited<ReturnType<typeof remote>>;
      try{raw=await remote('plan',{intent:step,context:view,noticeVersion:EDEN_NOTICE_VERSION});}
      catch(error){
        if(error instanceof Error&&'code'in error&&error.code==='DIRECTORY_LOCATION_AMBIGUOUS')previous=step;
        throw error;
      }
      const {speechTicket:clarificationTicket,...response}=raw;
      const plan=validateEdenAgentActionResponse(response,step,view);
      if(!plan)throw Error('Eden could not verify the proposed action.');
      check(url,view);
      if('clarification'in plan){previous=step;trace.update({output:'approved-clarification',outcome:'clarification'});return {reply:plan.clarification.question,...ticketFrom(clarificationTicket)};}
      trace.update({proposedAction:plan.action.type});onStatus('Using the page control…');
      const result=await apply(plan.action);signal.throwIfAborted();
      const after=currentHostedContext(),confirmedURL=location.href;
      if(!after)return changed();
      const data=await remote('result',{turnToken:plan.turnToken,context:after,outcome:result.status==='done'?'done':'failed',noticeVersion:EDEN_NOTICE_VERSION});
      check(confirmedURL,after,step.goal==='explain-page');
      const {speechTicket,...answer}=data;
      const confirmed=validateAgentReplyResponse(answer);
      if(!confirmed)throw Error('Eden could not verify the listing information.');
      if(result.status==='done')previous=step;
      trace.update({output:plan.action.type==='read-hours'?'verified-listing':'model-approved-facts',outcome:result.status==='done'?'confirmed':'unavailable'});
      return {reply:confirmed.reply,...ticketFrom(speechTicket)};
    }
    const answer=await perform(intent,before);
    if(!followUp||trace.diagnostic.outcome!=='confirmed')return answer;
    // Never bind an ordinal on the old page. The first verified public
    // search must finish, and the requested row must now actually be visible.
    const after=currentHostedContext();
    if(!after||after.searchState!=='ready'||!after.resourceIds[followUp-1])return answer;
    try{return await perform({goal:'inspect-resource',ordinal:followUp,view:'details'},after);}
    catch{signal.throwIfAborted();throw Error('The search finished, but Eden could not confirm opening the requested listing. Please try again or use the results list.');}
  }
  return {run,clear};
}
