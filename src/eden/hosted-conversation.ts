import {publicPageHeading} from '../../shared/eden-public-pages.ts';
import {EDEN_NOTICE_VERSION,type EdenAction} from '../../shared/eden-assistant.ts';
import {reduceEdenAgentInput,sameDirectoryView,validateEdenAgentContext,validateEdenAgentActionResponse,validateAgentReplyResponse,type EdenAgentIntent} from '../../shared/eden-agent.ts';
import {conversationChoices,projectPublicRequest,suggestedCity,socialReply,validSocialText,type EdenSurface} from '../../shared/eden-conversation.ts';
import {edenLocalPageContext,edenPageContext,clearEdenRememberedSearch} from './application-bridge.ts';
import {applyEdenPublicAction} from './live-actions.ts';
import {applyPageControl,currentPageControls} from './page-controls.ts';

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
  request:(path:string,body:unknown,signal?:AbortSignal)=>Promise<Response>;
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
export function createHostedConversation(){
  let previous:EdenAgentIntent|undefined;
  let correction:{city:string;category?:'food'|'healthcare'|'community'}|undefined;
  function clear(){previous=undefined;correction=undefined;clearEdenRememberedSearch();}
  async function run(options:CommandOptions):Promise<CommandReply>{
    const {signal,request,onStatus,aiAvailable}=options;
    signal.throwIfAborted();
    let text=options.text.trim();
    const accepted=correction && /^(?:yes|correct|that’s right|that's right)[.!]?$/i.test(text)?correction:undefined;
    correction=undefined;
    if(accepted)text=accepted.category?'find '+accepted.category+' near '+accepted.city:accepted.city;
    const before=currentHostedContext();
    if(!before)throw Error('Eden needs a public page with a current directory view.');
    const symbols=projectPublicRequest(text);
    if(!symbols)return {reply:'Please use a public city, resource category or page request. Leave out personal or medical details.'};
    const local=directControl(text);
    if(local){onStatus('Using the page control…');return {reply:await applyPageControl(local,signal)};}
    const reduced=reduceEdenAgentInput(text,before,previous?.goal==='clarify-search'?previous:undefined);
    if(reduced.status==='clarify' && reduced.localOnly)return {reply:reduced.message};
    let intent=reduced.status==='supported'?reduced.intent:undefined;
    const uncertain=suggestedCity(text);
    if(uncertain && intent?.goal!=='find-resources' && !symbols.includes(uncertain.id)){
      correction={city:uncertain.query,category:symbols.includes('food')?'food':symbols.includes('healthcare')?'healthcare':before.category};
      return {reply:'Did you mean '+uncertain.label+'? Reply yes or enter the city and state.'};
    }
    const initialURL=location.href;
    const changed=()=>{throw Error('The page or selection changed. Please ask again using the current view.');};
    const checkBefore=()=>{signal.throwIfAborted();if(location.href!==initialURL||!sameDirectoryView(before,currentHostedContext(),false))changed();};
    if(!intent || intent.goal==='help'){
      if(!aiAvailable)return {reply:'Gemini conversation is unavailable. You can still ask to open Find Support, show the map, or scroll to results.'};
      const controls=currentPageControls();
      onStatus('Thinking…');
      const payload={symbols,context:before,controls,previous:previous??null,noticeVersion:EDEN_NOTICE_VERSION};
      const decision=await (await request('understand',payload,signal)).json();
      checkBefore();
      const choices=conversationChoices(symbols,before,controls,previous);
      const chosen=choices.find(candidate=>JSON.stringify(candidate)===JSON.stringify(decision?.choice));
      if(decision?.engine!=='gemini'||!chosen)throw Error('Eden could not verify the proposed action. Please try again.');
      if(chosen.kind==='control'){onStatus('Using the page control…');return {reply:await applyPageControl(chosen.control,signal)};}
      if(chosen.kind==='message'){
        if(chosen.key==='boundary')return {reply:socialReply.boundary};
        if(!validSocialText(decision.reply))throw Error('Eden could not verify its reply. Please try again.');
        return {reply:decision.reply};
      }
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
    if(!aiAvailable){
      const action=localAction(intent);
      if(!action)return {reply:'Gemini conversation is unavailable. The public directory and navigation controls remain available.'};
      onStatus('Using the page control…');const result=await apply(action);
      if(result.status==='done')previous=intent;
      return {reply:result.message};
    }
    onStatus('Thinking…');
    const response=await (await request('plan',{intent,context:before,noticeVersion:EDEN_NOTICE_VERSION},signal)).json();
    const plan=validateEdenAgentActionResponse(response,intent,before);
    if(!plan)throw Error('Eden could not verify the proposed action.');
    checkBefore();
    if('clarification'in plan){previous=intent;return {reply:plan.clarification.question};}
    onStatus('Using the page control…');
    const result=await apply(plan.action);signal.throwIfAborted();
    const after=currentHostedContext(),confirmedURL=location.href;
    if(!after)return changed();
    const data=await (await request('result',{turnToken:plan.turnToken,context:after,outcome:result.status==='done'?'done':'failed',noticeVersion:EDEN_NOTICE_VERSION},signal)).json();
    signal.throwIfAborted();
    if(location.href!==confirmedURL || !sameDirectoryView(after,currentHostedContext(),intent.goal==='explain-page'))changed();
    const {speechTicket,...answer}=data;
    const confirmed=validateAgentReplyResponse(answer);
    if(!confirmed)throw Error('Eden could not verify the listing information.');
    if(result.status==='done')previous=intent;
    return {reply:confirmed.reply,...(typeof speechTicket==='string'&&/^[A-Za-z0-9_-]{43}$/.test(speechTicket)?{speechTicket}:{})};
  }
  return {run,clear};
}
