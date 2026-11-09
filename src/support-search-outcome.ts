// Transient page state only. Raw location and keyword never enter EDEN's provider context.
import type {SupportState} from './support-model.ts';
import {nationalFoodReferrals, nationalCommunityReferrals, nationalHealthcareReferrals} from '../shared/national-referrals.ts';

export type Filters=Pick<SupportState,'category'|'radius'|'location'|'keyword'|'term'|'mode'>;
export function searchFilters(s:Filters):Filters {
  return {category:s.category,radius:s.radius,location:s.location.trim(),keyword:s.keyword.trim(),term:s.term,mode:s.mode};
}
export type Failure={phase:'failed'|'limited';retryAt?:number};
export function searchFailure(error:unknown):Failure {
  const e=error as {status?:number;retryAfterSeconds?:number}|null;
  if(e?.status!==429)return {phase:'failed'};
  const wait=e.retryAfterSeconds;
  return {phase:'limited',...(typeof wait==='number'&&Number.isSafeInteger(wait)&&wait>0&&wait<=2678400?{retryAt:Date.now()+wait*1000}:{})};
}
export type Outcome={phase:'idle'} | ({filters:Filters}&(
  {phase:'loading'|'choose-location'|'edited'}|Failure|{phase:'complete';total:number}
));
export function forControls(outcome:Outcome,current:Filters):Outcome{
  const f=searchFilters(current);
  return outcome.phase==='idle'||Object.entries(f).every(([k,v])=>v===outcome.filters[k as keyof Filters])?outcome:{phase:'edited',filters:f};
}
export function completed(filters:Filters,total:number):Outcome{
  return Number.isSafeInteger(total)&&total>=0?{phase:'complete',filters:searchFilters(filters),total}:{phase:'failed',filters:searchFilters(filters)};
}
// Preserve the small existing provider enum. The local reply distinguishes 429, draft filters and empty success.
export function projectedState(o:Outcome){
  return o.phase==='complete'?'ready':o.phase==='loading'?'loading':o.phase==='limited'||o.phase==='failed'?'error':'idle';
}
export function describeResults(o:Outcome,names:string[],loadedDirectory:number,mapped:number,now=Date.now()){
  if(o.phase==='idle')return {status:'clarify' as const,message:'No search has been run yet. Choose a location and search Find Support.'};
  const f=o.filters,category=f.category==='food'?'Food':f.category==='community'?'Community Support':'Healthcare';
  const scope=category+' within '+f.radius+' miles of '+(f.location||'the selected location')+(f.keyword?' with keyword “'+f.keyword+'”':'');
  switch(o.phase){
    case 'edited':return {status:'clarify' as const,message:'The filters have changed. Run the search for '+scope+' before I read its results.'};
    case 'choose-location':return {status:'clarify' as const,message:'Choose a more specific location to finish the search. I don’t have a confirmed result count yet.'};
    case 'loading':return {status:'unavailable' as const,message:'The search for '+scope+' is still loading. I can read the results when it finishes.'};
    case 'limited':{const wait=o.retryAt?Math.ceil((o.retryAt-now)/1000):0;return {status:'unavailable' as const,message:'The search for '+scope+' was rate-limited. No directory count was confirmed. '+(wait>0?'Try again in '+wait+' seconds.':'Please retry shortly.')};}
    case 'failed':return {status:'unavailable' as const,message:'The search for '+scope+' could not finish. No directory count was confirmed. Please retry the search.'};
    case 'complete':{
      const synthetic=f.mode==='demo',prefix='The search completed: '+scope+'. ';
      if(!o.total){
        const refs=f.category==='food'?nationalFoodReferrals.slice(0,2):f.category==='community'?nationalCommunityReferrals:nationalHealthcareReferrals;
        const options=[...(f.radius<50?['broaden the radius']:[]),f.keyword?'clear the keyword':'adjust the filters','switch to '+(f.category==='food'?'Healthcare':'Food')];
        return {status:'done' as const,synthetic,message:prefix+(synthetic?'No sample listings matched. This demonstration does not describe real services.':'Our Ground’s current directory has no matching listings for these filters. Services may still be available in the community. '+(mapped?mapped+' mapped leads are shown separately. ':'')+'The referral links on this page include '+refs.map(r=>r.name).join(' and ')+'.')+' You can '+options.join(', or ')+'.'};
      }
      return {status:'done' as const,synthetic,message:prefix+o.total+' matching '+(synthetic?'sample':'directory')+' listing'+(o.total===1?'':'s')+'; '+loadedDirectory+' loaded here.'+(mapped?' '+mapped+' mapped leads shown separately.':'')+(names.length?' '+names.slice(0,5).map((n,i)=>(i+1)+'. '+n).join('; ')+'.':'')+(synthetic?' These are examples, not real services.':' Check each listing’s source and confirm current services directly.')};
    }
  }
}
