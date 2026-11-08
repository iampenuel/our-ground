import { EDEN_CITIES, EDEN_MAX_COMMAND_LENGTH, EDEN_NOTICE_VERSION, interpretEdenCommand, validateEdenAction, validateEdenPageContext } from './eden-assistant.ts';
import type { EdenAction, EdenCategory, EdenCityId, EdenPageContext, EdenRadius } from './eden-assistant.ts';
import { isEdenSpeechPhrase } from './eden-speech.ts';
import type { EdenSpeechPhrase } from './eden-speech.ts';
import {publicPageHeading,isEdenPublicDestination} from './eden-public-pages.ts';
import type {EdenPublicDestination} from './eden-public-pages.ts';

export const EDEN_AGENT_RESOURCE_IDS = ['11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777'] as const;
// Imported service IDs are stable UUIDv5 values minted by the reviewed importers.
export type EdenAgentResourceId = string;
export const isImportedResourceId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export type EdenAgentContext = EdenPageContext & { directory?: 'public'; heading?:string; filtered?:true; view?:'list'|'map'; mappedCount?:number; cityId?: EdenCityId; resourceIds: EdenAgentResourceId[]; selectedIndex?:number; searchState?:'idle'|'loading'|'ready'|'error';mapState?:'not-shown'|'loading'|'ready'|'unavailable' };

/** A map finishing its tiles does not change which published listing a command describes. */
export function sameDirectoryView(a:EdenAgentContext,b:EdenAgentContext|null,includeMapState=false):boolean {
  return b!==null && a.page===b.page && a.category===b.category && a.cityId===b.cityId &&
    a.radius===b.radius && a.heading===b.heading && a.filtered===b.filtered && a.mappedCount===b.mappedCount && a.view===b.view && a.directory===b.directory && a.synthetic===b.synthetic &&
    a.searchState===b.searchState && a.resultCount===b.resultCount && a.selectedIndex===b.selectedIndex &&
    a.resourceIds.length===b.resourceIds.length && a.resourceIds.every((id,i)=>id===b.resourceIds[i]) &&
    (!includeMapState||a.mapState===b.mapState);
}
export type EdenAgentIntent =
  | { goal: 'find-resources'; category: EdenCategory; cityId: EdenCityId; radius?: EdenRadius }
  | { goal: 'adjust-distance'; radius: EdenRadius }
  | { goal: 'inspect-resource'; ordinal: number; view: 'details' | 'map' }
  | { goal: 'change-category'; category: EdenCategory }
  | { goal:'explain-page' }
  | { goal:'giving-guidance' }
  | { goal:'platform-guidance' }
  | { goal:'navigate-public';page:EdenPublicDestination }
  | { goal:'check-open-now';ordinal:number }
  | { goal: 'clarify-search'; missing: 'city'; category: EdenCategory }
  | { goal: 'clarify-search'; missing: 'category'; cityId: EdenCityId }
  | { goal: 'clarify-search'; missing: 'city-and-category'; area: 'pennsylvania' }
  | { goal: 'clear-filters' | 'read-results' | 'navigate-support' | 'help' };
export type EdenAgentRequest = { intent: EdenAgentIntent; context: EdenAgentContext; noticeVersion: typeof EDEN_NOTICE_VERSION };
export type EdenAgentResultRequest = { turnToken: string; outcome: 'done' | 'failed'; resourceIds: EdenAgentResourceId[]; noticeVersion: typeof EDEN_NOTICE_VERSION;context?:EdenAgentContext };
export type EdenAgentActionResponse = { engine: 'gemini'; turnToken: string; action: EdenAction };
export type EdenAgentClarificationResponse = { engine: 'gemini'; clarification: { field: 'city' | 'category' | 'city-and-category'; question: string } };
export type EdenAgentPlanResponse = EdenAgentActionResponse | EdenAgentClarificationResponse;
export const EDEN_AGENT_CLARIFICATION_QUESTIONS = Object.freeze({
  city: Object.freeze(['Which city should I search in?', 'Would you like to search in Harrisburg or Philadelphia?']),
  category: Object.freeze(['Would you like food, healthcare or community support?', 'Would you like food resources or healthcare resources?', 'Should I look for food resources or healthcare resources?']),
  'city-and-category': Object.freeze(['Which Pennsylvania city should I search in, and would you like food or healthcare resources?', 'Would you like food or healthcare resources in Harrisburg or Philadelphia?']),
});
export type EdenAgentReplyResponse = { engine: 'gemini'; reply: string; sources: Array<{ id: string; text: string }>; phrase: EdenSpeechPhrase };

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some(key => typeof key !== 'string' || !('value' in descriptors[key]))) return null;
    return Object.fromEntries(keys.map(key => [key, descriptors[key as string].value]));
  } catch { return null; }
}
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const city = (value: unknown): value is EdenCityId => EDEN_CITIES.some(item => item.id === value);
const category = (value: unknown): value is EdenCategory => value === 'food' || value === 'healthcare' || value === 'community';
const radius = (value: unknown): value is EdenRadius => [5, 10, 25, 50].includes(value as number) && typeof value === 'number';
export function validateEdenAgentResourceIds(value: unknown, directory = false): EdenAgentResourceId[] | null {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > (directory ? 20 : 2) || Reflect.ownKeys(value).length !== value.length + 1) return null;
    const values: EdenAgentResourceId[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || !(directory ? isImportedResourceId(descriptor.value) : EDEN_AGENT_RESOURCE_IDS.includes(descriptor.value)) || values.includes(descriptor.value)) return null;
      values.push(descriptor.value);
    }
    return values;
  } catch { return null; }
}
export function validateEdenAgentContext(value: unknown): EdenAgentContext | null {
  const input = object(value);
  if (!input || !only(input, ['page', 'category', 'radius', 'resultCount', 'synthetic', 'directory', 'cityId', 'resourceIds','selectedIndex','searchState','mapState','filtered','view','mappedCount','heading']) || (Object.hasOwn(input, 'cityId') && !city(input.cityId))) return null;
  const safe = validateEdenPageContext({ page: input.page, resultCount: input.resultCount, synthetic: input.synthetic,
    ...(Object.hasOwn(input, 'category') ? { category: input.category } : {}), ...(Object.hasOwn(input, 'radius') ? { radius: input.radius } : {}) });
  const directory = input.directory === 'public' && input.synthetic === false;
  const resourceIds = validateEdenAgentResourceIds(input.resourceIds, directory);
  const heading=publicPageHeading(input.page,input.heading);
  if (Object.hasOwn(input,'heading')&&(!directory||!heading))return null;
  if ((Object.hasOwn(input,'filtered') && (!directory || input.filtered!==true)) ||
    (Object.hasOwn(input,'view') && (!directory || !['map','list'].includes(String(input.view)))) ||
    (Object.hasOwn(input,'mappedCount') && (!directory || !Number.isInteger(input.mappedCount) || Number(input.mappedCount)<0 || Number(input.mappedCount)>20))) return null;
  if (!safe || (Object.hasOwn(input,'directory') ? !directory : !safe.synthetic) || !resourceIds || safe.resultCount !== resourceIds.length
    || !['support','resource'].includes(safe.page)&&(resourceIds.length>0||Object.hasOwn(input,'selectedIndex'))
    || Object.hasOwn(input,'selectedIndex')&&(!Number.isInteger(input.selectedIndex)||Number(input.selectedIndex)<1||Number(input.selectedIndex)>safe.resultCount)
    || Object.hasOwn(input,'searchState')&&(typeof input.searchState!=='string'||!['idle','loading','ready','error'].includes(input.searchState))
    || Object.hasOwn(input,'mapState')&&(typeof input.mapState!=='string'||!['not-shown','loading','ready','unavailable'].includes(input.mapState))) return null;
  return { ...safe, ...(heading?{heading}:{}), ...(input.filtered===true?{filtered:true as const}:{}), ...(input.view==='map'||input.view==='list'?{view:input.view}:{}), ...(Number.isInteger(input.mappedCount)?{mappedCount:Number(input.mappedCount)}:{}), ...(directory ? { directory: 'public' as const } : {}), ...(city(input.cityId) ? { cityId: input.cityId } : {}), resourceIds,...(Object.hasOwn(input,'selectedIndex')?{selectedIndex:Number(input.selectedIndex)}:{}),...(Object.hasOwn(input,'searchState')?{searchState:input.searchState as EdenAgentContext['searchState']}:{}),...(Object.hasOwn(input,'mapState')?{mapState:input.mapState as EdenAgentContext['mapState']}:{}) };
}
export function validateEdenAgentIntent(value: unknown): EdenAgentIntent | null {
  const input = object(value);
  if (!input) return null;
  switch (input.goal) {
    case 'find-resources': return only(input, ['goal', 'category', 'cityId', 'radius']) && category(input.category) && city(input.cityId)
      && (!Object.hasOwn(input, 'radius') || radius(input.radius)) ? { goal: input.goal, category: input.category, cityId: input.cityId, ...(radius(input.radius) ? { radius: input.radius } : {}) } : null;
    case 'adjust-distance': return only(input, ['goal', 'radius']) && radius(input.radius) ? { goal: input.goal, radius: input.radius } : null;
    case 'inspect-resource': return only(input, ['goal', 'ordinal', 'view']) && Number.isInteger(input.ordinal) && Number(input.ordinal) >= 1 && Number(input.ordinal) <= 20
      && (input.view === 'details' || input.view === 'map') ? { goal: input.goal, ordinal: Number(input.ordinal), view: input.view } : null;
    case 'change-category': return only(input, ['goal', 'category']) && category(input.category) ? { goal: input.goal, category: input.category } : null;
    case 'explain-page':return only(input,['goal'])?{goal:'explain-page'}:null;
    case 'giving-guidance':return only(input,['goal'])?{goal:'giving-guidance'}:null;
    case 'platform-guidance':return only(input,['goal'])?{goal:'platform-guidance'}:null;
    case 'navigate-public':return only(input,['goal','page'])&&isEdenPublicDestination(input.page)?{goal:'navigate-public',page:input.page}:null;
    case 'check-open-now':return only(input,['goal','ordinal'])&&Number.isInteger(input.ordinal)&&Number(input.ordinal)>=1&&Number(input.ordinal)<=20?{goal:'check-open-now',ordinal:Number(input.ordinal)}:null;
    case 'clarify-search':
      if (input.missing === 'city' && only(input, ['goal', 'missing', 'category']) && category(input.category)) return { goal: input.goal, missing: 'city', category: input.category };
      if (input.missing === 'category' && only(input, ['goal', 'missing', 'cityId']) && city(input.cityId)) return { goal: input.goal, missing: 'category', cityId: input.cityId };
      if (input.missing === 'city-and-category' && only(input, ['goal', 'missing', 'area']) && input.area === 'pennsylvania') return { goal: input.goal, missing: 'city-and-category', area: 'pennsylvania' };
      return null;
    case 'clear-filters': case 'read-results': case 'navigate-support': case 'help': return only(input, ['goal']) ? { goal: input.goal } : null;
    default: return null;
  }
}
export function validateEdenAgentRequest(value: unknown): EdenAgentRequest | null {
  const input = object(value);
  if (!input || Object.keys(input).length !== 3 || !only(input, ['intent', 'context', 'noticeVersion']) || input.noticeVersion !== EDEN_NOTICE_VERSION) return null;
  const intent = validateEdenAgentIntent(input.intent), context = validateEdenAgentContext(input.context);
  if (!intent || !context || ((intent.goal === 'inspect-resource'||intent.goal==='check-open-now') && intent.ordinal > context.resultCount)
    || (['adjust-distance', 'change-category', 'inspect-resource', 'read-results', 'clear-filters'].includes(intent.goal) && (!context.cityId || !context.category || !context.radius))) return null;
  return { intent, context, noticeVersion: EDEN_NOTICE_VERSION };
}
export function validateEdenAgentResultRequest(value: unknown): EdenAgentResultRequest | null {
  const input = object(value);
  if (!input || ![4,5].includes(Object.keys(input).length) || !only(input, ['turnToken', 'outcome', 'resourceIds', 'noticeVersion','context']) || input.noticeVersion !== EDEN_NOTICE_VERSION
    || typeof input.turnToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.turnToken) || (input.outcome !== 'done' && input.outcome !== 'failed')) return null;
  const context=Object.hasOwn(input,'context')?validateEdenAgentContext(input.context):undefined;
  const resourceIds = validateEdenAgentResourceIds(input.resourceIds, context?.directory === 'public');
  return resourceIds&&context!==null&&(!context||resourceIds.length===context.resourceIds.length&&resourceIds.every((id,index)=>id===context.resourceIds[index])) ? { turnToken: input.turnToken, outcome: input.outcome, resourceIds, noticeVersion: EDEN_NOTICE_VERSION,...(context?{context}:{}) } : null;
}
export function validateEdenAgentAction(value: unknown, intent: EdenAgentIntent, context: EdenAgentContext): EdenAction | null {
  const action = validateEdenAction(value);
  if (!action) return null;
  switch (intent.goal) {
    case 'clarify-search': return null;
    case 'find-resources': return action.type === 'search' && action.category === intent.category && action.city === intent.cityId && action.radius !== undefined && (intent.radius === undefined || action.radius === intent.radius) ? action : null;
    case 'adjust-distance': return action.type === 'radius' && action.radius === intent.radius ? action : null;
    case 'inspect-resource': return action.type === (intent.view === 'details' ? 'details' : 'select') && 'index' in action && action.index === intent.ordinal && action.index <= context.resultCount ? action : null;
    case 'change-category': return action.type === 'refine' && action.category === intent.category ? action : null;
    case 'explain-page':return action.type==='read-page'?action:null;
    case 'giving-guidance':return action.type==='read-page'?action:null;
    case 'platform-guidance':return action.type==='read-page'?action:null;
    case 'navigate-public':return action.type==='navigate-public'&&action.page===intent.page?action:null;
    case 'check-open-now':return action.type==='read-hours'&&action.index===intent.ordinal&&action.index<=context.resultCount?action:null;
    default: return action.type === intent.goal ? action : null;
  }
}
export function validateEdenAgentActionResponse(value: unknown, intent: EdenAgentIntent, context: EdenAgentContext): EdenAgentPlanResponse | null {
  const input = object(value);
  if (intent.goal === 'clarify-search') {
    const clarification = input ? object(input.clarification) : null;
    if (!input || Object.keys(input).length !== 2 || !only(input, ['engine', 'clarification']) || input.engine !== 'gemini'
      || !clarification || Object.keys(clarification).length !== 2 || !only(clarification, ['field', 'question']) || clarification.field !== intent.missing
      || typeof clarification.question !== 'string' || !EDEN_AGENT_CLARIFICATION_QUESTIONS[intent.missing].includes(clarification.question)) return null;
    return { engine: 'gemini', clarification: { field: intent.missing, question: clarification.question } };
  }
  if (!input || Object.keys(input).length !== 3 || !only(input, ['engine', 'turnToken', 'action']) || input.engine !== 'gemini'
    || typeof input.turnToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.turnToken)) return null;
  const action = validateEdenAgentAction(input.action, intent, context);
  return action ? { engine: 'gemini', turnToken: input.turnToken, action } : null;
}

type CityCorrection = {status:'supported'; intent:EdenAgentIntent} | {status:'clarify'; message:string; localOnly:true};
function cityCorrection(text:string, category:EdenCategory|undefined, radius:EdenRadius|undefined):CityCorrection|undefined {
  // Recognize which clause affirms the city before removing unknown words.
  // "Berkley, not Harrisburg" must never turn into a Harrisburg search.
  const clarify:CityCorrection={status:'clarify',localOnly:true,message:'Which city and state should I search? Please enter just the place you want.'};
  const prefix=/^(?:no[, ]+)?i (?:mean|meant)\s+/;
  const cityKey=(phrase:string)=>phrase.toLowerCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
  const known=(phrase:string)=>EDEN_CITIES.find(city=>[city.label,city.query,...city.aliases].some(alias=>cityKey(alias)===cityKey(phrase)));
  if(!prefix.test(text)){
    // A lone negation or a reversed correction is not a request for the
    // recognized city. Ask for one affirmative choice.
    if(/^no[, ]+not\s+/.test(text) || /^(?:no[, ]+)?not\s+/.test(text) && (/\bi (?:mean|meant)\b/.test(text)||known(text.replace(/^(?:no[, ]+)?not\s+/,''))))return clarify;
    return;
  }
  const [affirmed,excluded,...extra]=text.replace(prefix,'').split(/(?:,?\s+|,)not\s+/);
  const city=known(affirmed);
  // "I meant" also corrects the subject, category, listing or page. Only
  // unmatched place-like choices should trigger the city/state question.
  if(!city && /\b(?:introduc(?:e|ing|tion)|intro|yourself|your self|yourslef|who (?:you are|are you)|what you can do|your (?:name|role|purpose)|capabilities|assistant|map|list|listing|result|page|give|giving|donor|donation|organization|healthcare|food|radius|miles)\b/.test(affirmed))return;
  if(!city || extra.length || (excluded!==undefined && (
    !/^[a-z]+(?:[ -][a-z]+){0,2}$/.test(cityKey(excluded)) ||
    /\b(?:and|or|but|not)\b/.test(excluded)||known(excluded)?.id===city.id)))return clarify;
  return category?{status:'supported',intent:{goal:'find-resources',cityId:city.id,category,...(radius?{radius}:{})}}
    :{status:'supported',intent:{goal:'clarify-search',missing:'category',cityId:city.id}};
}

/** Local parsing is solely a privacy reducer. It returns a semantic request for
 * real model inference, never an assistant answer or an executed action.
 */
export function reduceEdenAgentInput(raw: unknown, context: EdenAgentContext, pending?: EdenAgentIntent): { status: 'supported'; intent: EdenAgentIntent } | { status: 'sensitive' | 'unsupported' | 'clarify'; message: string; localOnly?:true } {
  const safe = validateEdenAgentContext(context);
  if (!safe || typeof raw !== 'string' || raw.length > EDEN_MAX_COMMAND_LENGTH || /[\u0000-\u001f\u007f\p{Cf}]/u.test(raw)) return { status: 'unsupported', message: 'This request cannot be processed safely. Please use a resource category, city, distance or numbered result.' };
  const checkedPending = pending === undefined ? undefined : validateEdenAgentIntent(pending);
  if (pending !== undefined && checkedPending?.goal !== 'clarify-search') return { status: 'unsupported', message: 'Please send a complete resource request.' };
  // Clarification memory contributes only already validated public enums to
  // reduction. It never fabricates the actual page context sent to the server.
  const { category: _category, cityId: _actualCity, ...rest } = safe;
  const reduction = checkedPending?.goal === 'clarify-search'
    ? { ...rest, page: 'home' as const, ...(checkedPending.missing === 'city' ? { category: checkedPending.category }
      : checkedPending.missing === 'category' ? { cityId: checkedPending.cityId } : {}) }
    : safe;
  const { cityId: _city, resourceIds: _ids, directory:_directory, heading:_heading, filtered:_filtered,view:_view,mappedCount:_mapped, selectedIndex:_selected,searchState:_search,mapState:_map, ...page } = reduction;
  const interpreted = interpretEdenCommand(raw, page);
  if (interpreted.status === 'sensitive') return interpreted;
  const normalized = raw.normalize('NFC').replace(/’/g, "'").trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(?:hey )?eden(?:,|:)?\s+/, '').replace(/^please\s+/, '').replace(/[.!?]$/, '').trim();
  const correction=cityCorrection(normalized,reduction.category,safe.radius);
  if(correction)return correction;
  if(/^(?:i want to give(?: support)?|i(?:'d| would) like to give(?: support)?|how can i give(?: support)?)$/.test(normalized))return{status:'supported',intent:{goal:'giving-guidance'}};
  if(/^(?:what is our ground about|what does our ground do)$/.test(normalized))return{status:'supported',intent:{goal:'platform-guidance'}};
  if(/^(?:(?:(?:i'm|i am) confused[.!?] )?what can i do here|what can i do (?:on|with) (?:this|the current) page|(?:can you )?explain (?:this|the current) page|what is this page(?: for)?|where am i)$/.test(normalized))return{status:'supported',intent:{goal:'explain-page'}};
  const navigation=/^(?:take me to|go to|navigate to|open)(?: the)? (give support|for organizations|organizations|about(?: our ground)?|privacy(?: policy)?|home(?:page)?|find support|support)(?: page)?$/.exec(normalized);
  if(navigation){const pages:Record<string,EdenPublicDestination>={'give support':'give','for organizations':'organizations',organizations:'organizations','about':'about','about our ground':'about',privacy:'privacy','privacy policy':'privacy',home:'home',homepage:'home','find support':'support',support:'support'};return{status:'supported',intent:{goal:'navigate-public',page:pages[navigation[1]]}};}
  if(/^(?:show(?: me)?|focus|select) (?:that|this|the selected) (?:resource|place|listing|one) on (?:the )?map$/.test(normalized))return safe.selectedIndex?{status:'supported',intent:{goal:'inspect-resource',ordinal:safe.selectedIndex,view:'map'}}:{status:'clarify',message:'Select a current resource or name its result number first.'};
  if(/^(?:is|check if) (?:(?:this|that|the selected) (?:resource|place|listing)|it) open (?:right )?now$/.test(normalized))return safe.selectedIndex?{status:'supported',intent:{goal:'check-open-now',ordinal:safe.selectedIndex}}:{status:'clarify',message:'Which current result should I check?'};
  // Local English recognition can omit possessive apostrophes or choose “these clinics”.
  const asksForHours=[
    /^(?:what are|what is|what's|what're|tell me) (?:this|that|the|these|those|the selected) (?:clinic|listing|resource)(?:'s|s'?)? (?:opening |office |operating )?(?:hours|ours)$/,
    /^(?:what are|what is|what's|tell me) (?:its|their|the) (?:opening |office |operating )?hours$/,
    /^(?:what are )?(?:the )?(?:opening |office |operating )?hours (?:for|of|at) (?:this|that|the selected) (?:clinic|listing|resource)$/,
    /^(?:clinic |opening |office )?hours$/
  ].some(pattern=>pattern.test(normalized));
  if (asksForHours) {
    return safe.selectedIndex ? {status:'supported',intent:{goal:'check-open-now',ordinal:safe.selectedIndex}}
      : {status:'clarify',message:'Select the clinic you want to check first.'};
  }
  const statewide=/^(?:find|show(?: me)?|search(?: for)?) (food(?: resources?| support| assistance)?|health ?care(?: resources?| support)?|medical clinics?) (?:in|across|throughout) pennsylvania$/.exec(normalized);
  if(statewide)return{status:'supported',intent:{goal:'clarify-search',missing:'city',category:/^(?:health|medical)/.test(statewide[1])?'healthcare':'food'}};
  if (/^(?:find|show(?: me)?|search(?: for)?) (?:places|resources|support) (?:in|across|throughout) pennsylvania$/.test(normalized)) {
    return { status: 'supported', intent: { goal: 'clarify-search', missing: 'city-and-category', area: 'pennsylvania' } };
  }
  let action = interpreted.status === 'supported' ? interpreted.action : null;
  if (!action && checkedPending?.goal === 'clarify-search') {
    // A full safe answer such as "food in Harrisburg" uses the same anchored
    // grammar as an ordinary search; no answer text becomes provider context.
    const completeAnswer = interpretEdenCommand('find ' + normalized, page);
    if (completeAnswer.status === 'supported' && completeAnswer.action.type === 'search') action = completeAnswer.action;
  }
  if (!action) {
    const value = normalized;
    const narrow = /^(?:(?:can you )?(?:narrow|expand|change)(?: that| it| the search)? to|only within) (five|ten|twenty[ -]five|fifty|\d{1,3}) miles?$/.exec(value);
    const more = /^(?:tell me (?:more )?about|give me details about|explain)(?: the)? (first|second|third|fourth|fifth|\d{1,2}) (?:one|result|resource|listing)$/.exec(value);
    const numbers: Record<string, number> = { five: 5, ten: 10, 'twenty five': 25, 'twenty-five': 25, fifty: 50, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
    if (narrow) { const number = numbers[narrow[1]] ?? Number(narrow[1]); if (radius(number)) action = { type: 'radius', radius: number }; }
    if (more) { const number = numbers[more[1]] ?? Number(more[1]); if (Number.isInteger(number) && number >= 1 && number <= safe.resultCount) action = { type: 'details', index: number }; }
  }
  if (!action) {
    const cityText = (value: string) => value.replace(/,/g, '').replace(/\.$/, '').replace(/\s+/g, ' ').trim();
    const knownCity = EDEN_CITIES.find(item => item.aliases.some(alias => cityText(alias) === cityText(normalized)));
    if (knownCity && !reduction.category) return { status: 'supported', intent: { goal: 'clarify-search', missing: 'category', cityId: knownCity.id } };
    return interpreted.status === 'supported' ? { status: 'unsupported', message: 'This request cannot be processed safely.' } : interpreted;
  }
  let intent: EdenAgentIntent;
  switch (action.type) {
    case 'search': {
      const location = action.city ?? reduction.cityId;
      if (!location) return { status: 'supported', intent: { goal: 'clarify-search', missing: 'city', category: action.category } };
      intent = { goal: 'find-resources', category: action.category, cityId: location, ...(action.radius ? { radius: action.radius } : {}) }; break;
    }
    case 'radius': intent = { goal: 'adjust-distance', radius: action.radius }; break;
    case 'details': case 'select': intent = { goal: 'inspect-resource', ordinal: action.index, view: action.type === 'details' ? 'details' : 'map' }; break;
    case 'refine': intent = { goal: 'change-category', category: action.category }; break;
    case 'read-page':intent={goal:'explain-page'};break;
    case 'navigate-public':intent={goal:'navigate-public',page:action.page};break;
    case 'read-hours':intent={goal:'check-open-now',ordinal:action.index};break;
    default: intent = { goal: action.type };
  }
  return validateEdenAgentRequest({ intent, context: safe, noticeVersion: EDEN_NOTICE_VERSION }) ? { status: 'supported', intent }
    : { status: 'clarify', message: 'Run a resource search before asking about its distance or results.' };
}
export const interpretEdenAgentRequest = reduceEdenAgentInput;
export const validateAgentPlanResponse = validateEdenAgentActionResponse;
export function validateAgentReplyResponse(value: unknown): EdenAgentReplyResponse | null {
  const input = object(value);
  if (!input || Object.keys(input).length !== 4 || !only(input, ['engine', 'reply', 'sources', 'phrase']) || input.engine !== 'gemini') return null;
  if (typeof input.reply !== 'string' || input.reply.length < 1 || input.reply.length > 1200 || /[\u0000-\u001f\u007f<>]/u.test(input.reply) || !isEdenSpeechPhrase(input.phrase) || !Array.isArray(input.sources) || input.sources.length > 10) return null;
  const sources: Array<{ id: string; text: string }> = [];
  for (const item of input.sources) {
    const source = object(item);
    if (!source || Object.keys(source).length !== 2 || !only(source, ['id', 'text']) || typeof source.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(source.id)
      || typeof source.text !== 'string' || source.text.length < 1 || source.text.length > 500) return null;
    sources.push({ id: source.id, text: source.text });
  }
  return { engine: 'gemini', reply: input.reply, sources, phrase: input.phrase };
}
