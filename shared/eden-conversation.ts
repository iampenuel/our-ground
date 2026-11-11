// Only application-owned symbols cross the text privacy boundary. Preserve their
// order (including corrections and negations) without sending unrecognized words.
import { EDEN_CITIES, edenCityQuery, normalizeEdenCityId, validateEdenCityId, EDEN_MAX_COMMAND_LENGTH, interpretEdenCommand } from './eden-assistant.ts';
import type { EdenCategory, EdenRadius } from './eden-assistant.ts';
import { validateEdenAgentIntent, reduceEdenAgentInput } from './eden-agent.ts';
import type { EdenAgentContext, EdenAgentIntent } from './eden-agent.ts';
import {stateCode,parseLocationQuery} from './us-location.ts';
import { EDEN_PUBLIC_DESTINATIONS } from './eden-public-pages.ts';

const vocabulary = {
  identity:['who are you','who you are','who are u','who r u','who exactly are you','who is eden','what are you','what is your role','your role','your purpose','who am i talking to','tell me about eden','tell me about yourself','tell me about you','introduce yourself','introduce your self','introduce yourslef','introduce youself','introduce yoursef','introduce urself','introduse yourself','your name'],
  continuation:['continue','where were we','where we left off','resume'],
  intro:['intro','introduction'], capabilities:['what can you do','what you can do','what do you do','what are you here for','what can you help me do','what can you actually help me do','how can you help','what are you able to do','your capabilities','what else can you do','what else can you help me with','what can you help me with'],
  request:['give me','give us'], inspect:['show me','show the','show its','view','open details'], sequence:['and then','and','then'],
  back:['go back','return to','back to','go back to'], more:['else','more'],
  greet: ['hi','hey','hello','hiya','hii','heyy','morning','afternoon','evening'],
  thanks:['thanks','thank','appreciate'], help:['help','assist','confused','guide','guidance'],
  search:['search','find','near','around','within','looking','need','locate','nearby','close'],
  change:['switch','change','instead','narrow','update','refine'], correction:['meant','actually','correction','sorry'],
  negate:['not','no','never',"don't","didn't","rather than","instead of"], page:['page','site','here','website','looking at','this screen'],
  food:['food','pantries','pantry','groceries','meals','hunger'], healthcare:['healthcare','health care','clinic','clinics','medical care'],
  community:['community','housing'], give:['donor','donate','volunteer','give','donation','donations','giving','goods'],
  organizations:['organization','organisation','organizations','join','onboard','onboarding'],
  home:['home','homepage'], about:['about'], privacy:['privacy'], support:['support','directory','resident'],
  go:['take','open','navigate','visit','bring','go'], read:['explain','read','describe','tell','what about','tell me about','what','how','where'],
  map:['map'], list:['list'], results:['results','matches'], listing:['listing','provider','resource','result','one','record'],
  hours:['hours','open now'], scroll:['scroll','jump'], down:['down','below'], up:['up','above','top'],
  focus:['focus','cursor'], location:['location','city'], radius:['radius','distance','miles','mile'], submit:['submit','run'],
  restricted:['pay','payment','purchase','transfer','submit application','delete','credentials','password','login','medical advice','book an appointment','book me an appointment','schedule an appointment','make an appointment'],
  first:['first','1'], second:['second','2'], third:['third','3'], fourth:['fourth','4'],
  five:['5','five'], ten:['10','ten'], twentyfive:['25','twenty five','twenty-five'], fifty:['50','fifty'],
  question:['can','could','would','should','possible'], selected:['selected','current','this','that','those','its','their']
} as const;
const surfaceNames = ['scroll-results','scroll-search','scroll-giving','scroll-organizations','scroll-up','scroll-down','focus-location','focus-radius','show-map','back-to-map','show-list','submit-search'] as const;
export type EdenSurface = typeof surfaceNames[number];
export const isEdenSurface = (v:unknown):v is EdenSurface => surfaceNames.some(id=>id===v);
const citiesByLength = [...EDEN_CITIES].sort((a,b)=>b.label.length-a.label.length);
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cityPattern = citiesByLength.flatMap(city=>[...city.aliases,city.label.split(',')[0].toLowerCase()].map(alias=>({word:alias,symbol:city.id})));
const terms = [...cityPattern,...Object.entries(vocabulary).flatMap(([symbol,words])=>words.map(word=>({word,symbol})))].sort((a,b)=>b.word.length-a.word.length);
const lookup=new Map(terms.map(item=>[item.word,item.symbol]));
const words=new RegExp('\\b(?:'+terms.map(item=>escape(item.word)).join('|')+')\\b','gi');
const approved=new Set<string>([...Object.keys(vocabulary),...EDEN_CITIES.map(c=>c.id)]);
export function validSymbols(value:unknown): value is string[] {
  return Array.isArray(value)&&value.length<=36&&value.every(v=>typeof v==='string'&&(approved.has(v)||v.startsWith('place:')&&validateEdenCityId(v.slice(6))||v.startsWith('region:')&&stateCode(v.slice(7))===v.slice(7)));
}
export function projectPublicRequest(raw:string): string[] | null {
  if (!raw.trim() || raw.length>EDEN_MAX_COMMAND_LENGTH || /[\p{Cc}\p{Cf}<>@]/u.test(raw) || interpretEdenCommand(raw).status==='sensitive') return null;
  const region=stateCode(raw.trim());
  if(region&&!['hi','in','or','me','ok'].includes(raw.trim().toLowerCase()))return ['region:'+region];
  const normalized=raw.normalize('NFC').toLowerCase().replaceAll('’',"'");
  const social=normalized.trim().replace(/[.!?]+$/,'').replace(/, eden$/,'').replace(/\s+/g,' ');
  // A reference to help already given is courtesy, not a new search command.
  // Anchor the entire turn so a separate, actionable request is still projected.
  if(/^(?:thanks|thank you)(?: so much| very much)?(?: for (?:your help(?: today)?|helping(?: me)?(?: find (?:that|it|this))?|finding (?:that|it|this)))?$/.test(social) ||
    /^(?:you(?:'re| are) (?:(?:really|very|so) )?helpful|i (?:really )?appreciate (?:it|that|your help))$/.test(social))return ['thanks'];
  const matches=[...normalized.matchAll(words)].map(m=>({at:m.index!,symbol:lookup.get(m[0])!}));
  const interpreted=interpretEdenCommand(raw);
  const correction=/^(?:(?:actually|sorry)[, ]+)?(?:no[, ]+)?i (?:mean|meant)\s+(.+?)(?:,?\s+not\s+.+)?[.!?]?$/.exec(normalized);
  const location=interpreted.status==='supported'&&interpreted.action.type==='search'?interpreted.action.city:
    correction?(()=>{const reduced=reduceEdenAgentInput(raw,{page:'home',synthetic:false,directory:'public',resultCount:0,resourceIds:[]});return reduced.status==='supported'&&'cityId' in reduced.intent?reduced.intent.cityId:undefined;})():undefined;
  if(location&&!EDEN_CITIES.some(c=>c.id===location))matches.push({at:correction?normalized.indexOf(correction[1]):normalized.lastIndexOf(' in ')+4,symbol:'place:'+location});
  return matches.sort((a,b)=>a.at-b.at).slice(0,36).map(m=>m.symbol);
}
// Offer a correction without executing a search or disclosing the misspelling.
export function suggestedCity(text:string) {
  const words=text.toLowerCase().match(/[a-z]{5,}/g)??[];
  const close=(word:string,name:string)=>{
    if (Math.abs(word.length-name.length)>1 || word===name) return false;
    if(word.length===name.length){
      const mismatches=[...word].map((v,i)=>v!==name[i]?i:-1).filter(i=>i>=0);
      return mismatches.length===1 || mismatches.length===2 && mismatches[1]===mismatches[0]+1 && word[mismatches[0]]===name[mismatches[1]]&&word[mismatches[1]]===name[mismatches[0]];
    }
    const [long,short]=word.length>name.length?[word,name]:[name,word];
    return [...long].some((_,i)=>long.slice(0,i)+long.slice(i+1)===short);
  };
  const hits=EDEN_CITIES.filter(c=>words.some(word=>close(word,c.label.split(',')[0].toLowerCase())));
  return hits.length===1?hits[0]:undefined;
}
export type AssistantTopic='identity'|'capabilities';
export type EdenConversationMemory=EdenAgentIntent|{topic:AssistantTopic};
export const EDEN_TEXT_FAILURE_STAGES=['provider','response-shape','tool-call','choice','social-output','grounded-output'] as const;
export type EdenTextFailureStage=typeof EDEN_TEXT_FAILURE_STAGES[number];
export function validateConversationMemory(raw:unknown):EdenConversationMemory|null {
  if(raw && typeof raw==='object' && Object.keys(raw).length===1 && 'topic' in raw && (raw.topic==='identity'||raw.topic==='capabilities'))return {topic:raw.topic};
  return validateEdenAgentIntent(raw);
}
export type PublicDecision={kind:'intent';intent:EdenAgentIntent}
  |{kind:'search-and-open';intent:Extract<EdenAgentIntent,{goal:'find-resources'}>;ordinal:number}
  |{kind:'control';control:EdenSurface}|{kind:'message';key:'greet'|'thanks'|'clarify'|'boundary'}
  |{kind:'message';key:AssistantTopic;focus:'search'|'tour'|'limits'};
export const profileFacts={
  identity:'I’m Eden, Our Ground’s AI assistant.',
  search:'I can find nearby food, healthcare, and community support and help you explore a listing.',
  tour:'I can explain this page, show results on the map, and help you find ways to give or participate as an organization.',
  limits:'I can guide you through public information. I can’t make payments, change an account, or confirm that a provider is open.'
} as const;
export function profileReply(topic:AssistantTopic,focus:unknown,corrected:boolean):string|null {
  if(focus!=='search'&&focus!=='tour'&&focus!=='limits')return null;
  const intro=topic==='identity'?profileFacts.identity:'I can help you use the public directory.';
  return (corrected?'Thanks for clarifying. ':'')+intro+' '+profileFacts[focus];
}
export const socialReply={boundary:'I can guide you through the public site. I can’t book appointments, change accounts, submit applications, or make payments.'} as const;
export function clarificationReply(symbols:readonly string[],previous?:EdenConversationMemory) {
  if(symbols.includes('hours'))return 'Which current result should I check?';
  if(symbols.includes('correction') || previous && 'goal' in previous && previous.goal==='clarify-search' && previous.missing==='city')
    return 'Which city would you like to search?';
  if(['first','second','third','fourth'].some(ordinal=>symbols.includes(ordinal)))
    return 'Which current result would you like to look at?';
  return 'Would you like to find support, give support, or learn about organizations?';
}
export const isSocialTurn=(symbols:readonly string[])=>symbols.some(symbol=>symbol==='greet'||symbol==='thanks') &&
  symbols.every(symbol=>symbol==='greet'||symbol==='thanks'||symbol==='sequence');

type SocialKind='greet'|'thanks';
// Gemini chooses and composes these neutral clauses. Whole-clause validation
// prevents allowed words from being rearranged into uncited directory claims.
export const socialClauses={
  greet:['Hi','Hey','Hello','Hi there','Hey there','Hello there','Good morning','Good afternoon','Good evening'],
  thanks:["You're welcome","You're very welcome","You're most welcome","You are welcome","You are very welcome","No problem","No worries","My pleasure","Of course","Glad I could help","I'm glad I could help","Happy to help","I'm happy to help"],
  follow_up:['How can I help','How can I help you','How can I help you today','What can I help you find','Would you like help finding support','Would you like help finding support nearby',
    'Can I help with anything else','Is there anything else I can help with','Anything else I can help with','Let me know if you need anything else',"I'm here if you need anything else"],
} as const;
const normalizeSocial=(text:string)=>text.trim().toLowerCase().replaceAll('’',"'").replace(/ +/g,' ');
const socialStarts={
  greet:new Set(socialClauses.greet.map(normalizeSocial)),
  thanks:new Set(socialClauses.thanks.map(normalizeSocial)),
};
const socialFollowUps=new Set(socialClauses.follow_up.map(normalizeSocial));
export function validSocialText(value:unknown,kind?:SocialKind):value is string {
  if(typeof value!=='string'||value.length<2||value.length>220||!/^[a-z ’'.,!?]+$/i.test(value))return false;
  const clauses=normalizeSocial(value).replace(/[.!?]$/,'').split(/[.,!?] +/);
  if(clauses.length>2)return false;
  const [start,followUp]=clauses;
  return (kind ? socialStarts[kind].has(start) : socialStarts.greet.has(start)||socialStarts.thanks.has(start)) &&
    (followUp===undefined||socialFollowUps.has(followUp)||start!==followUp&&kind!=='greet'&&socialStarts.thanks.has(start)&&socialStarts.thanks.has(followUp));
}
export function conversationChoices(symbols:string[], context:EdenAgentContext, controls:EdenSurface[], previous?:EdenConversationMemory):PublicDecision[] {
  const choices:PublicDecision[]=[{kind:'message',key:'clarify'}];
  const add=(intent:EdenAgentIntent)=>{if(validateEdenAgentIntent(intent))choices.push({kind:'intent',intent});};
  const has=(...values:string[])=>values.some(v=>symbols.includes(v));
  if(isSocialTurn(symbols)){
    const social:PublicDecision[]=[];
    if(has('greet'))social.push({kind:'message',key:'greet'});
    if(has('thanks'))social.push({kind:'message',key:'thanks'});
    return social;
  }
  if(has('continuation')){add({goal:'explain-page'});return choices;}
  const region=symbols.find(s=>s.startsWith('region:'))?.slice(7);
  if(region&&previous&&'cityId' in previous){
    const prior=parseLocationQuery(edenCityQuery(previous.cityId));
    const cityId=prior?.kind==='city'&&!prior.state?normalizeEdenCityId(prior.city+', '+region):undefined;
    if(cityId&&'category' in previous){add({goal:'find-resources',cityId,category:previous.category,...('radius'in previous&&previous.radius?{radius:previous.radius}:{})});return choices;}
  }
  if(has('restricted'))return [{kind:'message',key:'boundary'}];
  // A request verb ("give me") is not giving support. Preserve the subject
  // of a correction and distinguish an affirmative topic from a negated one.
  const affirmative=(topic:string)=>symbols.some((symbol,i)=>{
    if(symbol!==topic)return false;
    const clauseStart=Math.max(symbols.slice(0,i).lastIndexOf('correction'),symbols.slice(0,i).lastIndexOf('sequence'));
    return !symbols.slice(Math.max(clauseStart+1,i-2),i).includes('negate');
  });
  const wantsIdentity=affirmative('identity') || affirmative('intro') && !has('give','organizations','page');
  const wantsCapabilities=affirmative('capabilities') || Boolean(previous && 'topic'in previous && has('more') && !has('give','organizations'));
  if(wantsIdentity||wantsCapabilities){
    const profiles:PublicDecision[]=[];
    for(const focus of ['search','tour','limits'] as const){
      if(wantsIdentity)profiles.push({kind:'message',key:'identity',focus});
      if(wantsCapabilities)profiles.push({kind:'message',key:'capabilities',focus});
    }
    return profiles;
  }
  // A selected listing is context, not permission to open it again. Keep
  // explicit page descriptions and in-place category corrections on topic.
  if(affirmative('page')&&has('question','read')&&symbols.every(v=>['question','read','selected','page'].includes(v)))
    return [{kind:'intent',intent:{goal:'explain-page'}}];
  if(context.cityId&&['support','resource'].includes(context.page)&&has('correction','change')&&symbols.every(v=>['correction','change','support','food','healthcare','community'].includes(v))){
    const categories=(['food','healthcare','community'] as const).filter(c=>affirmative(c));
    if(categories.length===1)return [{kind:'intent',intent:{goal:'change-category',category:categories[0]}}];
  }
  if(affirmative('back')&&affirmative('map')&&symbols.every(v=>['back','map','sequence','inspect','go'].includes(v))){
    // After a category correction there may no longer be a detail to close.
    // A registered map control on the results page satisfies the same request.
    const control=context.page==='resource'?'back-to-map':context.page==='support'?'show-map':undefined;
    return control&&controls.includes(control)?[{kind:'control',control}]:choices;
  }
  if(has('negate')&&has('map')&&symbols.every(v=>['negate','back','map','sequence','inspect','go'].includes(v)))return choices;
  const radiusKey=symbols.find(v=>['five','ten','twentyfive','fifty'].includes(v));
  const radius=radiusKey?({five:5,ten:10,twentyfive:25,fifty:50} as Record<string,EdenRadius>)[radiusKey]:undefined;
  if(radius&&context.cityId&&context.category&&context.radius&&has('radius')&&symbols.every(v=>[radiusKey,'question','selected','radius','change'].includes(v)))
    return [{kind:'intent',intent:{goal:'adjust-distance',radius}}];
  const ordinals=['first','second','third','fourth'];
  const referenced=ordinals.filter(ordinal=>affirmative(ordinal));
  if(referenced.length && has('read','inspect','listing') && symbols.every(symbol=>ordinals.includes(symbol)||['read','inspect','listing','selected','question'].includes(symbol))){
    const index=ordinals.indexOf(referenced[0])+1;
    return referenced.length===1&&index<=context.resultCount ? [{kind:'intent',intent:{goal:'inspect-resource',ordinal:index,view:'details'}}] : choices;
  }
  if(has('hours') && symbols.every(symbol=>ordinals.includes(symbol)||['hours','question','read','selected','listing'].includes(symbol))){
    const index=referenced.length===1?ordinals.indexOf(referenced[0])+1:referenced.length===0?context.selectedIndex:undefined;
    return index&&index<=context.resultCount ? [{kind:'intent',intent:{goal:'check-open-now',ordinal:index}}] : choices;
  }
  if(has('greet'))choices.push({kind:'message',key:'greet'});
  if(has('thanks'))choices.push({kind:'message',key:'thanks'});
  if(has('help','page','read','question','support'))add({goal:'explain-page'});
  if(has('help','support','greet'))add({goal:'help'});
  if(affirmative('give'))add({goal:'giving-guidance'});
  for(const page of EDEN_PUBLIC_DESTINATIONS)if(affirmative(page))add({goal:'navigate-public',page});
  if(has('listing','results'))add({goal:'read-results'});
  const ordinal=symbols.find(v=>ordinals.includes(v)&&affirmative(v));
  const index=ordinal?ordinals.indexOf(ordinal)+1:context.selectedIndex;
  if(index&&index<=context.resultCount&&(ordinal||has('inspect','listing','hours'))){
    add({goal:'inspect-resource',ordinal:index,view:'details'});
    if(has('hours'))add({goal:'check-open-now',ordinal:index});
  }
  const cities=[...new Set([...EDEN_CITIES.filter(c=>affirmative(c.id)).map(c=>c.id),...symbols.filter(s=>s.startsWith('place:')&&affirmative(s)).map(s=>normalizeEdenCityId(s.slice(6))!).filter(Boolean)])];
  const categories=(['food','healthcare','community'] as EdenCategory[]).filter(c=>affirmative(c));
  const previousCity=previous&&'cityId'in previous?previous.cityId:undefined;
  const previousCategory=previous&&'category'in previous?previous.category:undefined;
  if(has('search','correction','change')||cities.length||categories.length){
    const cityChoices=cities.length?cities:[context.cityId??previousCity].filter((v):v is string=>Boolean(v && (!has(v)||affirmative(v))));
    const categoryChoices=categories.length?categories:[context.category??previousCategory].filter((v):v is EdenCategory=>Boolean(v && (!has(v)||affirmative(v))));
    for(const cityId of cityChoices){
      if(!categoryChoices.length)add({goal:'clarify-search',missing:'category',cityId});
      for(const category of categoryChoices){
        const search:Extract<EdenAgentIntent,{goal:'find-resources'}>={goal:'find-resources',cityId,category,...(radius?{radius}:{})};
        if(ordinal && affirmative(ordinal) && has('sequence') && has('listing') && (affirmative('inspect')||affirmative('go')))choices.push({kind:'search-and-open',intent:search,ordinal:index!});
        add(search);
      }
    }
    for(const category of categories){
      if(!cityChoices.length)add({goal:'clarify-search',missing:'city',category});
      if(context.cityId)add({goal:'change-category',category});
    }
  }
  if(radius&&context.cityId)add({goal:'adjust-distance',radius});
  const surfaceHints: Record<EdenSurface,string[]>={
    'scroll-results':['results','listing'],'scroll-search':['search'],'scroll-giving':['give'],'scroll-organizations':['organizations'],
    'scroll-up':['up'],'scroll-down':['down'],'focus-location':['location'],'focus-radius':['radius'],
    'show-map':['map'],'back-to-map':[],'show-list':['list'],'submit-search':['submit']
  };
  controls.filter(control=>has(...surfaceHints[control])).forEach(control=>choices.push({kind:'control',control}));
  return choices.slice(0,40);
}
