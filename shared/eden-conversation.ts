// Only application-owned symbols cross the text privacy boundary. Preserve their
// order (including corrections and negations) without sending unrecognized words.
import { EDEN_CITIES, EDEN_MAX_COMMAND_LENGTH, interpretEdenCommand } from './eden-assistant.ts';
import type { EdenCategory, EdenRadius } from './eden-assistant.ts';
import { validateEdenAgentIntent } from './eden-agent.ts';
import type { EdenAgentContext, EdenAgentIntent } from './eden-agent.ts';
import { EDEN_PUBLIC_DESTINATIONS } from './eden-public-pages.ts';

const vocabulary = {
  greet: ['hi','hey','hello','hiya','hii','heyy','morning','afternoon','evening'],
  thanks:['thanks','thank','appreciate'], help:['help','assist','confused','guide','guidance'],
  search:['search','find','near','around','within','looking','need','locate','nearby','close'],
  change:['switch','change','instead','narrow','update','refine'], correction:['meant','actually','correction','sorry'],
  negate:['not','no','never'], page:['page','site','here','website','looking at','this screen'],
  food:['food','pantries','pantry','groceries','meals','hunger'], healthcare:['healthcare','health care','clinic','clinics','medical care'],
  community:['community','housing'], give:['donor','donate','volunteer','give','donations','giving','goods'],
  organizations:['organization','organisation','organizations','join','onboard','onboarding'],
  home:['home','homepage'], about:['about'], privacy:['privacy'], support:['support','directory','resident'],
  go:['take','open','navigate','visit','bring','go'], read:['explain','read','describe','tell','what','how','where'],
  map:['map'], list:['list'], results:['results','matches'], listing:['listing','provider','resource','one','record'],
  hours:['hours','open now'], scroll:['scroll','jump'], down:['down','below'], up:['up','above','top'],
  focus:['focus','cursor'], location:['location','city'], radius:['radius','distance','miles','mile'], submit:['submit','run'],
  restricted:['pay','payment','purchase','transfer','submit application','delete','credentials','password','login','medical advice'],
  first:['first','1'], second:['second','2'], third:['third','3'], fourth:['fourth','4'],
  five:['5','five'], ten:['10','ten'], twentyfive:['25','twenty five','twenty-five'], fifty:['50','fifty'],
  question:['can','could','would','should','possible'], selected:['selected','current','this','that','those','its','their']
} as const;
const surfaceNames = ['scroll-results','scroll-search','scroll-giving','scroll-organizations','scroll-up','scroll-down','focus-location','focus-radius','show-map','show-list','submit-search'] as const;
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
  return Array.isArray(value)&&value.length<=36&&value.every(v=>typeof v==='string'&&approved.has(v));
}
export function projectPublicRequest(raw:string): string[] | null {
  if (!raw.trim() || raw.length>EDEN_MAX_COMMAND_LENGTH || /[\p{Cc}\p{Cf}<>@]/u.test(raw) || interpretEdenCommand(raw).status==='sensitive') return null;
  const normalized=raw.normalize('NFC').toLowerCase();
  return [...normalized.matchAll(words)].slice(0,36).map(m=>lookup.get(m[0])!);
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
export type PublicDecision={kind:'intent';intent:EdenAgentIntent}|{kind:'control';control:EdenSurface}|{kind:'message';key:'greet'|'thanks'|'clarify'|'boundary'};
export const socialReply={boundary:'I can guide you through the public site. Account changes, applications and payments need to be handled directly.'} as const;

// Model-generated social wording can greet, thank, and ask about a public
// journey. It cannot introduce people, providers, claims, addresses or links.
export const socialWords='a about access an and are around assistance at be can care chat city community could details directory do Eden explore find finding food for from get give giving glad go good Ground guide happy healthcare hello help helpful here hey hi how I in is it learn like local look looking me more my need nearby next of on or organization organizations Our page please public resources search show site start support thanks thank that the there this through to today together us ways welcome what where which with would you your you’re'
  .toLowerCase().split(' ');
export function validSocialText(value:unknown):value is string {
  if(typeof value!=='string'||value.length<2||value.length>220||!/^([a-z ’'.,!?])+$/i.test(value))return false;
  const words=value.toLowerCase().replaceAll("'",'’').match(/[a-z]+(?:’[a-z]+)?/g)??[];
  return words.length>0 && words.every(word=>socialWords.includes(word));
}
export function conversationChoices(symbols:string[], context:EdenAgentContext, controls:EdenSurface[], previous?:EdenAgentIntent):PublicDecision[] {
  const choices:PublicDecision[]=[{kind:'message',key:'clarify'}];
  const add=(intent:EdenAgentIntent)=>{if(validateEdenAgentIntent(intent))choices.push({kind:'intent',intent});};
  const has=(...values:string[])=>values.some(v=>symbols.includes(v));
  if(has('restricted'))return [{kind:'message',key:'boundary'}];
  if(has('greet'))choices.push({kind:'message',key:'greet'});
  if(has('thanks'))choices.push({kind:'message',key:'thanks'});
  if(has('help','page','read','question','support'))add({goal:'explain-page'});
  if(has('help','support','greet'))add({goal:'help'});
  if(has('give'))add({goal:'giving-guidance'});
  for(const page of EDEN_PUBLIC_DESTINATIONS)if(has(page==='give'?'give':page))add({goal:'navigate-public',page});
  if(has('listing','results'))add({goal:'read-results'});
  const ordinal=symbols.find(v=>['first','second','third','fourth'].includes(v));
  const index=ordinal?['first','second','third','fourth'].indexOf(ordinal)+1:context.selectedIndex;
  if(index&&index<=context.resultCount){
    add({goal:'inspect-resource',ordinal:index,view:'details'});
    if(has('hours'))add({goal:'check-open-now',ordinal:index});
  }
  const cities=EDEN_CITIES.filter(c=>has(c.id)).map(c=>c.id);
  const categories=(['food','healthcare','community'] as EdenCategory[]).filter(c=>has(c));
  const radiusKey=symbols.find(v=>['five','ten','twentyfive','fifty'].includes(v));
  const radius=radiusKey?({five:5,ten:10,twentyfive:25,fifty:50} as Record<string,EdenRadius>)[radiusKey]:undefined;
  const previousCity=previous&&'cityId'in previous?previous.cityId:undefined;
  const previousCategory=previous&&'category'in previous?previous.category:undefined;
  if(has('search','correction','change')||cities.length||categories.length){
    const cityChoices=cities.length?cities:[context.cityId??previousCity].filter((v):v is string=>Boolean(v));
    const categoryChoices=categories.length?categories:[context.category??previousCategory].filter((v):v is EdenCategory=>Boolean(v));
    for(const cityId of cityChoices){
      if(!categoryChoices.length)add({goal:'clarify-search',missing:'category',cityId});
      for(const category of categoryChoices)add({goal:'find-resources',cityId,category,...(radius?{radius}:{})});
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
    'show-map':['map'],'show-list':['list'],'submit-search':['submit']
  };
  controls.filter(control=>has(...surfaceHints[control])).forEach(control=>choices.push({kind:'control',control}));
  return choices.slice(0,40);
}
