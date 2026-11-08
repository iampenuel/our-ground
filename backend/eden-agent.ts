import { createEdenDirectory, directoryModelFacts } from './eden-directory.ts';
import type { DirectoryCityLookup } from './directory-city.ts';
import { GoogleGenAI } from '@google/genai';
import { createHash, randomBytes } from 'node:crypto';
import { EDEN_CITIES, validateEdenAction } from '../shared/eden-assistant.ts';
import type { EdenAction, EdenCategory, EdenCityId, EdenRadius } from '../shared/eden-assistant.ts';
import { EDEN_AGENT_CLARIFICATION_QUESTIONS, validateEdenAgentAction, validateEdenAgentRequest, validateEdenAgentResultRequest, validateEdenAgentActionResponse, validateEdenAgentContext } from '../shared/eden-agent.ts';
import type { EdenAgentPlanResponse, EdenAgentContext, EdenAgentReplyResponse, EdenAgentRequest, EdenAgentResourceId, EdenAgentResultRequest } from '../shared/eden-agent.ts';
import type { EdenSpeechPhrase } from '../shared/eden-speech.ts';
import { createEdenProvider, EdenProviderError } from './eden-provider.ts';
import type { EdenModelRequest, EdenTextModel } from './eden-provider.ts';
import type { Repository } from './app.ts';
import { EDEN_LIVE_TOOL_DEFINITIONS } from '../shared/eden-live.ts';
import { conversationChoices, profileFacts, profileReply, validateConversationMemory, socialWords, validSocialText, validSymbols, isEdenSurface, type EdenSurface } from '../shared/eden-conversation.ts';
import { edenPublicPageFacts } from '../shared/eden-public-pages.ts';

export type EdenAgentRepository = Pick<Repository, 'search' | 'detail'>;
export interface EdenHostedTurnStore {
  model: EdenTextModel;
  save(key:string, turn:Pending):Promise<void>;
  take(key:string, binding:string):Promise<Pending|null>;
}
export type EdenAgentOptions = { hostedTurns?: EdenHostedTurnStore; repository?: EdenAgentRepository; directoryCity?: DirectoryCityLookup; now?: () => number; create?: (payload: EdenModelRequest, signal: AbortSignal) => Promise<unknown> };
export const EDEN_AGENT_TURN_TTL_MS = 120_000;
export const EDEN_AGENT_ACTION_TOOL = 'perform_public_resource_action';
export const EDEN_AGENT_REPLY_TOOL = 'compose_verified_reply';
export const EDEN_AGENT_CLARIFICATION_TOOL = 'ask_clarification';
type Query = { cityId: EdenCityId; category: EdenCategory; radius: EdenRadius };
type Pending = { binding: string; expiresAt: number; request: EdenAgentRequest; action: EdenAction; query?: Query; expectedIds?: EdenAgentResourceId[] };
type Fact = { id: string; text: string };
const known = {
  '11111111-1111-4111-8111-111111111111': { title: 'Demo Community Pantry — fictional', summary: 'Fictional food support example.', city: 'Harrisburg', organization: 'Demo Community Organization' },
  '77777777-7777-4777-8777-777777777777': { title: 'Demo Neighborhood Health Desk — fictional', summary: 'Fictional healthcare navigation example.', city: 'Philadelphia', organization: 'Demo Neighborhood Clinic' },
} as const;
const centers: Partial<Record<EdenCityId, [number, number]>> = { 'harrisburg-pa': [40.2732, -76.8867], 'philadelphia-pa': [39.9526, -75.1636] };
const outcomeMessages: Record<EdenAction['type'], string> = {
  search: 'Your search is ready.',
  radius: 'The search distance has been updated.',
  details: 'The listing details are open.',
  select: 'The resource is selected.',
  refine: 'Your search filters have been updated.',
  'clear-filters': 'Your search filters have been cleared.',
  'read-results': 'Your current results are ready to review.',
  'navigate-support': 'Find Support is open.',
  help: 'You can search for resources or ask about listed results.',
  'read-page': 'Here is what you can do on this page.',
  'navigate-public': 'The page is open.',
  'read-hours': 'Current opening status is not verified.',
};
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function projectVisibleIds(ids:string[],context:EdenAgentContext) {
  if(!context.filtered)return ids;
  // Filter text is private. Verify the reported rows, membership and order
  // against the actual public server query without ever requesting that text.
  return ids.filter(id=>context.resourceIds.includes(id));
}
const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
export const EDEN_AGENT_CONNECTIVE_PHRASES = Object.freeze([
  'Here is what the listing says:',
  'Based on the listing,',
  'The listing says:',
  'Here are the confirmed details:',
  'Here is the confirmed update:',
  'Here is what I found:',
  'For the selected result,',
  'For your search,',
  'For details, review the listing.',
  'Please review the listing.',
  'Also,',
]);
export const EDEN_AGENT_CONNECTIVES = Object.freeze(EDEN_AGENT_CONNECTIVE_PHRASES.map((text, index) => Object.freeze({ id: `connector-${index + 1}`, text })));
function connectivesFor(facts: readonly Fact[]) {
  // An audience page is not a directory listing. Do not attribute its copy to one.
  return facts.some(fact => fact.id.startsWith('resource-')) ? EDEN_AGENT_CONNECTIVES
    : EDEN_AGENT_CONNECTIVES.filter(item => !/listing|selected result/i.test(item.text));
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Exact cited extracts carry every factual assertion. The model may choose
 * extracts and choose neutral connective phrases, but cannot add vocabulary,
 * numbers, links, advice or an uncited claim. No rewritten fallback is returned.
 */
export function validateEdenGroundedReply(value: unknown, facts: readonly Fact[]): { reply: string; sources: Fact[] } | null {
  const body = object(value);
  if (!body || Object.keys(body).sort().join(',') !== 'citations,reply' || typeof body.reply !== 'string' || body.reply.length < 1 || body.reply.length > 1200
    || /[\u0000-\u001f\u007f<>@]|https?:|www\./iu.test(body.reply) || !Array.isArray(body.citations) || body.citations.length < 1 || body.citations.length > 6
    || new Set(body.citations).size !== body.citations.length) return null;
  let remaining = body.reply;
  const sources: Fact[] = [];
  for (const id of body.citations) {
    const fact = facts.find(item => item.id === id);
    if (!fact || !remaining.toLowerCase().includes(fact.text.toLowerCase())) return null;
    remaining = remaining.replace(new RegExp(escapeRegex(fact.text), 'gi'), ' ');
    sources.push({ ...fact });
  }
  // Whole phrases, never a word bag: words such as "resource", "available"
  // and "now" must not be recombined into an uncited availability claim.
  for (const connective of EDEN_AGENT_CONNECTIVE_PHRASES) remaining = remaining.replace(new RegExp(escapeRegex(connective), 'gi'), ' ');
  if (/[^\s.,:;!?"'“”‘’()—–-]/u.test(remaining)) return null;
  // Resource-bearing answers must retain the explicit fictional-data boundary.
  if (facts.some(fact => fact.id.startsWith('resource-')) && !/fictional|demonstration/iu.test(body.reply)) return null;
  return { reply: body.reply, sources };
}

type CompositionRequirements = { requiredFactIds: string[]; requiredOneOfFactIds: string[][] };
type CompositionCheck = { ok: true; reply: string; sources: Fact[] } | { ok: false; code: 'EDEN_AGENT_COMPOSITION_SHAPE' | 'EDEN_AGENT_COMPOSITION_SOURCE' | 'EDEN_AGENT_COMPOSITION_REQUIRED' | 'EDEN_AGENT_COMPOSITION_LENGTH' };
/** The model selects and orders immutable fact/connector IDs. Rendering this
 * validated composition is the response path itself, never a repair or canned
 * replacement for failed prose. No model-authored factual text is accepted.
 */
export function validateEdenAgentComposition(value: unknown, facts: readonly Fact[], requirements: CompositionRequirements): CompositionCheck {
  const body = object(value);
  if (!body || Object.keys(body).join(',') !== 'segments' || !Array.isArray(body.segments) || body.segments.length < 1 || body.segments.length > 12) return { ok: false, code: 'EDEN_AGENT_COMPOSITION_SHAPE' };
  const sources: Fact[] = [], pieces: string[] = [], selected = new Set<string>();
  let connectors = 0;
  for (const raw of body.segments) {
    const segment = object(raw);
    if (!segment || Object.keys(segment).sort().join(',') !== 'id,kind' || typeof segment.id !== 'string') return { ok: false, code: 'EDEN_AGENT_COMPOSITION_SHAPE' };
    if (segment.kind === 'fact') {
      const fact = facts.find(item => item.id === segment.id);
      if (!fact || selected.has(fact.id) || sources.length >= 6) return { ok: false, code: 'EDEN_AGENT_COMPOSITION_SOURCE' };
      selected.add(fact.id); sources.push({ ...fact });
      pieces.push(fact.text + (/[.!?]$/.test(fact.text) ? '' : '.'));
    } else if (segment.kind === 'connector') {
      const connective = connectivesFor(facts).find(item => item.id === segment.id);
      if (!connective || ++connectors > 6) return { ok: false, code: 'EDEN_AGENT_COMPOSITION_SOURCE' };
      pieces.push(connective.text);
    } else return { ok: false, code: 'EDEN_AGENT_COMPOSITION_SOURCE' };
  }
  if (requirements.requiredFactIds.some(id => !selected.has(id)) || requirements.requiredOneOfFactIds.some(group => !group.some(id => selected.has(id)))) return { ok: false, code: 'EDEN_AGENT_COMPOSITION_REQUIRED' };
  const reply = pieces.join(' ');
  return reply.length > 1200 ? { ok: false, code: 'EDEN_AGENT_COMPOSITION_LENGTH' } : { ok: true, reply, sources };
}

function phrase(action: EdenAction, failed: boolean): EdenSpeechPhrase {
  if (failed) return 'unavailable';
  return action.type === 'search' ? 'search_ready' : action.type === 'radius' ? 'radius_ready' : action.type === 'details' ? 'details_ready'
    : action.type === 'select' ? 'select_ready' : action.type === 'refine' || action.type === 'clear-filters' ? 'refine_ready' : 'help_ready';
}
function rememberedQuery(context: EdenAgentContext): Query | undefined {
  if (!context.cityId || !context.category || !context.radius) return undefined;
  return {cityId:context.cityId,category:context.category,radius:context.radius};
}
function displayedQuery(context: EdenAgentContext): Query | undefined {
  return ['support','resource'].includes(context.page) && (context.directory ? context.searchState==='ready' : !['loading','error'].includes(context.searchState??'')) ? rememberedQuery(context) : undefined;
}
function queryFor(action: EdenAction, context: EdenAgentContext): Query | undefined {
  if (action.type === 'search' && action.city && action.radius) return { cityId: action.city, category: action.category, radius: action.radius };
  if(action.type==='navigate-public')return action.page==='support'?rememberedQuery(context):undefined;
  if(action.type==='navigate-support')return rememberedQuery(context);
  const query=displayedQuery(context);if(!query)return undefined;
  return {...query,category:action.type==='refine'?action.category:query.category,radius:action.type==='radius'?action.radius:query.radius};
}
function confirmDirectoryAction(action:EdenAction,before:EdenAgentContext,after:EdenAgentContext|undefined,query:Query|undefined,ids:string[]) {
  const reject = () => { throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409); };
  if (before.directory !== 'public' || after?.directory !== 'public') return reject();
  if (query && (after.searchState !== 'ready' || !['support','resource'].includes(after.page) ||
    after.cityId !== query.cityId || after.category !== query.category || after.radius !== query.radius)) return reject();
  if (action.type === 'details' || action.type === 'select' || action.type === 'read-hours') {
    if (!ids[action.index-1] || before.resourceIds[action.index-1] !== ids[action.index-1]) return reject();
    if ((action.type !== 'read-hours' || before.selectedIndex !== undefined) && after.selectedIndex !== action.index) return reject();
    if (action.type === 'details' && after.page !== 'resource') return reject();
  }
}
function contextFacts(context:EdenAgentContext):Fact[]{
  const facts=edenPublicPageFacts(context.page);
  facts.push({id:'platform-purpose',text:'Our Ground helps visitors explore food, healthcare, and community resource information.'},
    {id:'platform-actions',text:'You can find support, explore giving information, or learn how organizations participate.'},
    {id:'giving-purpose',text:'Give Support helps you explore local providers and confirm their identity and current needs through official channels.'},
    {id:'giving-boundary',text:'Our Ground does not process donations or book volunteer opportunities.'});
  if(context.searchState==='error')facts.push({id:'search-state',text:'The website reports that its current search is unavailable. No completed results are confirmed.'});
  else if(context.searchState==='loading')facts.push({id:'search-state',text:'The current resource search is still loading; results are not confirmed yet.'});
  if(context.mapState==='unavailable')facts.push({id:'map-state',text:'The map is unavailable. The resource list and details remain the available alternative.'});
  else if(context.mapState==='ready')facts.push({id:'map-state',text:'The website reports that its map is ready.'});
  else if(context.mapState==='not-shown')facts.push({id:'map-state',text:'The map is not currently shown.'});
  if(context.directory==='public'&&context.view){
    facts.push({id:'current-view',text:context.view==='map'?'The map section is open.':'The results list is in view.'});
    if(context.searchState==='ready')facts.push({id:'visible-results',text:`The current view shows ${context.resultCount} public directory listing${context.resultCount===1?'':'s'}${context.mappedCount?' and '+context.mappedCount+' mapped lead'+(context.mappedCount===1?'':'s'):''}${context.filtered?' after filtering':''}.`});
  }
  return facts;
}

export function createEdenAgent(environment: Record<string, string | undefined>, options: EdenAgentOptions = {}) {
  const env = { ...environment }, localStatus = createEdenProvider(env).status, now = options.now ?? Date.now;
  const providerStatus = options.hostedTurns ? () => ({available:true,model:options.hostedTurns!.model}) : localStatus;
  const pending = new Map<string, Pending>();
  const operations = new Map<string, { controller: AbortController; done: Promise<void>; complete: () => void }>();
  let client: GoogleGenAI | undefined;
  const directory = env.BACKEND_DATA_MODE === 'postgres' && env.ALLOW_DEMO_DATA === 'false' && (options.hostedTurns || env.EDEN_LOCAL_DIRECTORY_ENABLED === 'true')
    && env.DATABASE_URL && options.repository && options.directoryCity ? createEdenDirectory(options.repository,options.directoryCity) : undefined;
  const status = () => ({ available: providerStatus().available && Boolean(options.repository) &&
    (Boolean(directory) || env.BACKEND_DATA_MODE === 'demo' && env.ALLOW_DEMO_DATA === 'true'), dataKind: directory ? 'public_directory' as const : 'fictional_demo' as const });
  const modeMatches = (context:EdenAgentContext) => Boolean(directory) === (context.directory === 'public');
  const dataFact = () => ({ id: 'data-kind', text: directory ? 'These are public directory listings, not independently verified operating services.' : 'These records are fictional demonstration data, not real services.' });
  const hoursFact = () => ({ id:'hours-unverified',text:directory ? 'Published hours do not establish whether this service is open now. Confirm hours and eligibility with the provider.' : 'These fictional listing hours cannot establish whether a real service is open now. Confirm current hours, time zone and availability directly with the provider.' });
  const countFact = (n:number) => ({id:'result-count',text:directory ? `${n} matching directory listing${n===1?'':'s'} within the search distance.${n>20?' The first 20 are shown.':n===0?' This does not mean local support is unavailable.':''}` : `The current search returned ${n} resource${n===1?'':'s'}.`});
  const purge = () => { for (const [key, item] of pending) if (item.expiresAt <= now()) pending.delete(key); };
  let cooldownUntil = 0;
  async function recordFacts(id: EdenAgentResourceId, position: number): Promise<Fact[]> {
    if (directory) return directory.facts(id,position);
    const record = object(await options.repository!.detail(id, true)), expected = known[id as keyof typeof known];
    const organization = object(record?.organization), location = object(record?.location);
    if (!record || record.id !== id || record.data_kind !== 'fictional_demo' || record.title !== expected.title || record.summary !== expected.summary
      || organization?.name !== expected.organization || location?.city !== expected.city || record.description !== 'No real service is offered at this map point.'
      || record.eligibility_text !== 'Fictional example; no eligibility claim.' || record.cost_summary !== 'Fictional example') throw new EdenProviderError('EDEN_SOURCE_NOT_APPROVED', 503);
    return [
      { id: `resource-${position}-title`, text: expected.title }, { id: `resource-${position}-summary`, text: expected.summary },
      { id: `resource-${position}-description`, text: 'No real service is offered at this map point.' },
      { id: `resource-${position}-eligibility`, text: 'Fictional example; no eligibility claim.' },
      { id: `resource-${position}-organization`, text: expected.organization },
    ];
  }
  async function snapshot(query?: Query): Promise<{ids:EdenAgentResourceId[];total:number}> {
    if (!query) return {ids:[],total:0};
    if (directory) return directory.search(query);
    const center = centers[query.cityId];
    if (!center) throw new EdenProviderError('EDEN_AREA_NOT_APPROVED', 422);
    const result = await options.repository!.search({ lat: center[0], lng: center[1], radiusMiles: query.radius, category: query.category, page: 1, pageSize: 20, allowDemo: true });
    if (!Array.isArray(result.items) || result.items.length > 2 || result.total !== result.items.length) throw new EdenProviderError('EDEN_SOURCE_NOT_APPROVED', 503);
    const ids: EdenAgentResourceId[] = [];
    for (const item of result.items) {
      const row = object(item), id = row?.id;
      if (typeof id !== 'string' || !Object.hasOwn(known, id) || row?.data_kind !== 'fictional_demo' || ids.includes(id as EdenAgentResourceId)) throw new EdenProviderError('EDEN_SOURCE_NOT_APPROVED', 503);
      await recordFacts(id as EdenAgentResourceId, ids.length + 1);
      ids.push(id as EdenAgentResourceId);
    }
    return {ids,total:ids.length};
  }
  async function idsFor(query?: Query) { return (await snapshot(query)).ids; }
  const featured = (i:number, selected?:number) => selected ? selected === i + 1 : !directory || i < 2;
  async function invoke(input: unknown, instruction: string, toolName: string, parameters: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const eligibility = providerStatus();
    if (!status().available || !eligibility.model) throw new EdenProviderError('EDEN_DISABLED', 403);
    if(now()<cooldownUntil)throw new EdenProviderError('EDEN_PROVIDER_QUOTA',429);
    const combined = AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]);
    const payload: EdenModelRequest = { model: eligibility.model, input: JSON.stringify(input), system_instruction: instruction,
      tools: [{ type: 'function', name: toolName, description: toolName === EDEN_AGENT_ACTION_TOOL ? 'Choose a public resource application action from a semantic request.'
        : toolName === EDEN_AGENT_CLARIFICATION_TOOL ? 'Ask one approved question for the missing public search field.' : 'Compose a grounded natural reply using exact verified extracts.', parameters }],
      generation_config: { max_output_tokens: 1024, thinking_level: 'low', thinking_summaries: 'none', tool_choice: { allowed_tools: { mode: 'any', tools: [toolName] } } },
      store: false, automatic_continuation: false };
    let response: unknown;
    let removeAbort = () => {};
    try {
      combined.throwIfAborted();
      const stopped = new Promise<never>((_resolve, reject) => {
        const stop = () => reject(new Error('EDEN request stopped.'));
        combined.addEventListener('abort', stop, { once: true });
        removeAbort = () => combined.removeEventListener('abort', stop);
        if (combined.aborted) stop();
      });
      let outbound: Promise<unknown>;
      if (options.create) outbound = options.create(payload, combined);
      else {
        client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1beta', enterprise: false, vertexai: false,
          httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com', timeout: 15_000, retryOptions: { attempts: 1 } } });
        outbound = client.interactions.create(payload, { retries: { strategy: 'none' }, timeout_ms: 15_000, signal: combined });
      }
      response = await Promise.race([outbound, stopped]);
      combined.throwIfAborted();
    } catch (error) {
      if (signal?.aborted) throw new EdenProviderError('EDEN_AGENT_CANCELLED', 409);
      const errorBody = object(error), code = Number(errorBody?.status ?? errorBody?.code);
      if (code===429) cooldownUntil=now()+30_000;
      const reason=code===429?'EDEN_PROVIDER_QUOTA':code===401||code===403?'EDEN_PROVIDER_AUTH':code===404?'EDEN_PROVIDER_MODEL':code===400?'EDEN_PROVIDER_SCHEMA':combined.aborted?'EDEN_PROVIDER_TIMEOUT':'EDEN_PROVIDER_UNAVAILABLE';
      throw new EdenProviderError(reason,code===429?429:503);
    } finally { removeAbort(); }
    const body = object(response);
    if (!body || !['completed', 'requires_action'].includes(String(body.status)) || !Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 8) throw new EdenProviderError('EDEN_INVALID_AGENT_OUTPUT', 502);
    const steps = body.steps.map(object);
    if (steps.some(step => !step || !['function_call', 'thought'].includes(String(step.type)))) throw new EdenProviderError('EDEN_INVALID_AGENT_OUTPUT', 502);
    const calls = steps.filter(step => step?.type === 'function_call');
    if (calls.length !== 1 || calls[0]?.name !== toolName) throw new EdenProviderError('EDEN_INVALID_AGENT_OUTPUT', 502);
    return calls[0].arguments;
  }
  function operation(binding: string, signal?: AbortSignal) {
    if (operations.has(binding) || operations.size >= 100) throw new EdenProviderError('EDEN_AGENT_TURN_PENDING', 409);
    const controller = new AbortController();
    let complete = () => {};
    const done = new Promise<void>(resolve => { complete = resolve; });
    const record = { controller, done, complete };
    operations.set(binding, record);
    return { signal: AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]),
      finish() { if (operations.get(binding) === record) operations.delete(binding); complete(); } };
  }
  return {
    status,
    async understand(symbols:unknown, contextValue:unknown, controls:unknown, previousValue:unknown, signal:AbortSignal) {
      const context=validateEdenAgentContext(contextValue);
      const previous=previousValue===null?undefined:validateConversationMemory(previousValue);
      if(!context || !modeMatches(context) || !validSymbols(symbols) || !Array.isArray(controls) || controls.length>12 || !controls.every(isEdenSurface) || previous===null)throw new EdenProviderError('EDEN_INVALID_AGENT_REQUEST',422);
      const choices=conversationChoices(symbols,context,controls as EdenSurface[],previous);
      const {resourceIds:_ids,...publicContext}=context;
      const keys=choices.map((_,index)=>'choice-'+index);
      const args=object(await invoke({signals:symbols, previous_public_intent:previous, page:publicContext, available_controls:controls, social_words:socialWords, assistant_profile:profileFacts, choices:choices.map((choice,i)=>({id:keys[i],...choice}))},
        'You are Eden, the Our Ground guide. Interpret the visitor’s ordered public concepts in context. A correction replaces the old city: use the named intended city, not a city following negation. Distinguish a request to introduce yourself (identity) or explain your own capabilities from a donor request. A request verb is not a donation. A correction about Eden’s identity is not a city question. Choose search-and-open when the visitor explicitly requests both the search and a numbered result; the website will independently confirm both. Back then map from a resource detail uses back-to-map, not an arbitrary history destination. Respect map versus list and scroll versus opening a listing. Prefer a conversational greeting or thanks for small talk. For joining as an organization, choose the organizations page. Choose clarify when intent or city is ambiguous. Do not invent facts. Choose exactly one listed id. This is only a proposal. The app validates and executes actions and confirms their result. When choosing a greet or thanks message, write a short friendly greeting or reply in social_text (max 220 characters). Use only social_words and plain punctuation, e.g. Hi there! How can I help you today? Do not describe a service as available or promise anything. The clarify choice opens an application-owned clarifying question. Identity and capabilities use the verified assistant_profile. Select the listed profile choice with the most helpful focus (search, tour or limits). Return only the choice ID for profile answers.',
        'choose_public_step',{type:'object',properties:{choice:{type:'string',enum:keys},social_text:{type:'string'}},additionalProperties:false,required:['choice']},signal));
      if(!args || Object.keys(args).some(k=>k!=='choice'&&k!=='social_text') || typeof args.choice!=='string' || !keys.includes(args.choice))throw new EdenProviderError('EDEN_INVALID_AGENT_ACTION',502);
      const choice=choices[keys.indexOf(args.choice)];
      if(choice.kind==='message'&&(choice.key==='identity'||choice.key==='capabilities')){
        const reply=profileReply(choice.key,choice.focus,symbols.includes('correction'));
        if(!reply)throw new EdenProviderError('EDEN_INVALID_AGENT_OUTPUT',502);
        return {engine:'gemini' as const,choice,reply};
      }
      if(choice.kind==='message'&&choice.key==='clarify'){
        // Gemini selected the clarification tool. Its question comes from the UI's
        // public vocabulary; arbitrary tool prose cannot disclose text or make claims.
        const reply=symbols.includes('correction')||previous && 'goal' in previous && previous.goal==='clarify-search'&&previous.missing==='city'
          ? 'Which city would you like to search?' : 'Would you like to find support, give support, or learn about organizations?';
        return {engine:'gemini' as const,choice,reply};
      }
      if(choice.kind==='message'&&choice.key!=='boundary'){
        if(!validSocialText(args.social_text))throw new EdenProviderError('EDEN_INVALID_AGENT_OUTPUT',502);
        return {engine:'gemini' as const,choice,reply:args.social_text};
      }
      return {engine:'gemini' as const,choice};
    },
    async inspectLiveContext(value: unknown) {
      if (!status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
      const context = validateEdenAgentContext(value);
      if (!context || !modeMatches(context)) throw new EdenProviderError('EDEN_LIVE_INVALID_CONTEXT', 422);
      const query = displayedQuery(context);
      const {ids:actual,total} = await snapshot(query);
      if (!same(actual, context.resourceIds)) throw new EdenProviderError('EDEN_AGENT_CONTEXT_CHANGED', 409);
      const facts: Fact[] = [...contextFacts(context),dataFact(),
        ...(query?[countFact(total)]:[])];
      if (query) facts.push({ id: 'search-area', text: `The search area is ${EDEN_CITIES.find(city => city.id === query.cityId)!.label}.` },
        { id: 'search-radius', text: `The search distance is ${query.radius} miles.` });
      for (let index = 0; index < actual.length; index++) if(featured(index,context.selectedIndex)) facts.push(...await recordFacts(actual[index], index + 1));
      return { context, facts:directory ? directoryModelFacts(facts) : facts };
    },
    async prepareLiveAction(value: unknown, contextValue: unknown) {
      if (!status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
      const action = validateEdenAction(value), context = validateEdenAgentContext(contextValue);
      if (action?.type === 'read-hours' && context?.selectedIndex !== undefined && action.index !== context.selectedIndex) throw new EdenProviderError('EDEN_AGENT_CONTEXT_CHANGED',409);
      if (!action || !context || !modeMatches(context) || (action.type === 'search' && (!action.city || !action.radius))
        || (['radius', 'refine', 'details', 'select', 'read-results', 'clear-filters','read-hours'].includes(action.type) && !displayedQuery(context))
        || ((action.type === 'details' || action.type === 'select'||action.type==='read-hours') && action.index > context.resultCount)) throw new EdenProviderError('EDEN_LIVE_INVALID_ACTION', 422);
      const beforeQuery = displayedQuery(context);
      if (action.type !== 'clear-filters' && !same(await idsFor(beforeQuery), context.resourceIds)) throw new EdenProviderError('EDEN_AGENT_CONTEXT_CHANGED', 409);
      if (!directory) await idsFor(queryFor(action, context));
      return { action, context };
    },
    async reconcileLiveAction(action: EdenAction, before: EdenAgentContext, outcome: 'done' | 'failed', value: unknown) {
      if (!status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
      const context = validateEdenAgentContext(value);
      if (!context || !modeMatches(context)) throw new EdenProviderError('EDEN_LIVE_INVALID_CONTEXT', 422);
      if (outcome === 'failed') return { outcome, context, facts: [{ id: 'outcome', text: 'That action could not be completed.' }] };
      const query = queryFor(action, before), {ids:actual,total} = await snapshot(query);
      if (directory) confirmDirectoryAction(action,before,context,query,actual);
      if(outcome==='done'&&action.type==='navigate-public'&&context.page!==action.page)throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
      if (outcome === 'done' && (!same(actual, context.resourceIds) || (query && (context.cityId !== query.cityId || context.category !== query.category || context.radius !== query.radius)))) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED', 409);
      const facts: Fact[] = [{ id: 'outcome', text: outcomeMessages[action.type] }, ...contextFacts(context),dataFact(),
        ...(query?[countFact(total)]:[])];
      if (query) facts.push({ id: 'search-area', text: `The search area is ${EDEN_CITIES.find(city => city.id === query.cityId)!.label}.` }, { id: 'search-radius', text: `The search distance is ${query.radius} miles.` });
      const selected = action.type === 'details' || action.type === 'select'||action.type==='read-hours' ? action.index : undefined;
      for (let index = 0; index < actual.length; index++) if (featured(index,selected)) facts.push(...await recordFacts(actual[index], index + 1));
      if(action.type==='read-hours')facts.push(hoursFact());
      return { outcome, context, facts: directory ? directoryModelFacts(facts) : facts };
    },
    hasPendingTurn(turnToken: string, binding: string) { purge(); const item = pending.get(hash(turnToken)); return Boolean(item && item.binding === binding && item.expiresAt > now()); },
    cancel(binding: string) {
      const active = operations.get(binding); active?.controller.abort();
      for (const [key, item] of pending) if (item.binding === binding) pending.delete(key);
      return active?.done ?? Promise.resolve();
    },
    async begin(value: EdenAgentRequest, binding: string, signal?: AbortSignal): Promise<EdenAgentPlanResponse> {
      if (!status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
      const request = validateEdenAgentRequest(value);
      if (!request || !modeMatches(request.context)) throw new EdenProviderError('EDEN_INVALID_AGENT_REQUEST', 422);
      purge();
      if (pending.size >= 100 || [...pending.values()].some(item => item.binding === binding)) throw new EdenProviderError('EDEN_AGENT_TURN_PENDING', 409);
      const active = operation(binding, signal);
      try {
      active.signal.throwIfAborted();
      if (request.intent.goal === 'clarify-search') {
        const args = await invoke({ semantic_request: request.intent },
          'The validated public resource request is missing search fields. Select the field matching semantic_request.missing and one whole approved question using ask_clarification. city-and-category means a broad Pennsylvania request needs both a city and a food or healthcare category; statewide search is not supported and must not be invented. Ask only for the missing city and/or resource category. Do not propose an application action, ask for a street address or personal information, or add prose. Return the exact approved question without changes.',
          EDEN_AGENT_CLARIFICATION_TOOL, { type: 'object', additionalProperties: false, required: ['field', 'question'], properties: {
            field: { type: 'string', enum: ['city', 'category', 'city-and-category'] }, question: { type: 'string', enum: Object.values(EDEN_AGENT_CLARIFICATION_QUESTIONS).flat() },
          } }, active.signal);
        const validated = validateEdenAgentActionResponse({ engine: 'gemini', clarification: args }, request.intent, request.context);
        if (!validated || !('clarification' in validated)) throw new EdenProviderError('EDEN_INVALID_AGENT_CLARIFICATION', 502);
        return validated;
      }
      const contextQuery = displayedQuery(request.context);
      // Clearing a local text filter can legitimately start with a filtered
      // subset (including zero rows). Validate the fresh target query below;
      // no filter text or arbitrary browser record is transmitted to the model.
      if (request.intent.goal !== 'clear-filters' && (request.context.resourceIds.length || request.intent.goal !== 'find-resources')) {
        const actual = await idsFor(contextQuery);
        if (!same(projectVisibleIds(actual,request.context), request.context.resourceIds)) throw new EdenProviderError('EDEN_AGENT_CONTEXT_CHANGED', 409);
      }
      const { resourceIds: _ids, ...pageContext } = request.context;
      const args = object(await invoke({ semantic_request: request.intent, page_context: pageContext },
        'You are Eden, Our Ground’s AI resource agent. Interpret semantic_request together with the current page context, then choose the appropriate public application tool action. This is an actual tool proposal, not an echo of a supplied action. find-resources requires search with the requested category and city; select a sensible radius from 5,10,25,50 if none was requested. adjust-distance requires radius and retains the existing city/category. inspect-resource requires details for details view or select for map view at the requested ordinal. change-category requires refine. explain-page, platform-guidance and giving-guidance require read-page; platform-guidance explains the platform mission and capabilities; giving-guidance explains the verified giving facts and offers navigation without executing it. navigate-public requires navigate-public with the requested page enum; check-open-now requires read-hours with the requested ordinal as index and never an open-now assertion. Other goals map to the corresponding safe public action. Function arguments MUST be an object with ONLY the root key action, containing the selected action object: {"action":{"type":"radius","radius":10}} is the argument shape for a ten-mile distance request. Never return a bare action as the arguments. Include only fields for the selected action: search has type/category/city/radius; radius has type/radius and MUST NOT repeat the retained city or category; details, select and read-hours have type/index; navigate-public has type/page; refine has type/category; all remaining actions have type only. Never include unused fields or nulls. Never change accounts, donate, submit applications, invent resources or give medical advice. Return only the function call. Do not claim the action has succeeded: the application has not executed it yet.',
        EDEN_AGENT_ACTION_TOOL, { type: 'object', additionalProperties: false, required: ['action'], properties: {
          // Share the already reviewed, closed per-action variants with Live.
          // The typed protocol retains its root action wrapper and independent
          // semantic-request validation after the real model chooses an action.
          action: structuredClone(EDEN_LIVE_TOOL_DEFINITIONS.find(tool => tool.name === EDEN_AGENT_ACTION_TOOL)!.parametersJsonSchema),
        } }, active.signal));
      if (!args || Object.keys(args).length !== 1) throw new EdenProviderError('EDEN_INVALID_AGENT_ACTION', 502);
      const action = validateEdenAgentAction(args.action, request.intent, request.context);
      if (!action) throw new EdenProviderError('EDEN_INVALID_AGENT_ACTION', 502);
      const query = queryFor(action, request.context), expectedIds = directory ? undefined : await idsFor(query);
      active.signal.throwIfAborted();
      const turnToken = randomBytes(32).toString('base64url');
      const item = { binding, expiresAt: now() + EDEN_AGENT_TURN_TTL_MS, request, action, query, expectedIds };
      if (options.hostedTurns) await options.hostedTurns.save(hash(turnToken), item);
      else pending.set(hash(turnToken), item);
      return { engine: 'gemini', turnToken, action };
      } finally { active.finish(); }
    },
    async complete(value: EdenAgentResultRequest, binding: string, signal?: AbortSignal): Promise<EdenAgentReplyResponse> {
      if (!status().available) throw new EdenProviderError('EDEN_DISABLED', 403);
      purge();
      const result = validateEdenAgentResultRequest(value), key = result ? hash(result.turnToken) : '';
      const item = options.hostedTurns && result ? await options.hostedTurns.take(key,binding) : pending.get(key);
      if (!result || !item || item.binding !== binding || item.expiresAt <= now()) throw new EdenProviderError('EDEN_AGENT_TURN_EXPIRED', 409);
      const active = operation(binding, signal);
      try {
      active.signal.throwIfAborted();
      pending.delete(key); // One shot, including mismatches and provider failures.
      const {ids:serverIds,total} = await snapshot(directory && result.outcome === 'failed' ? undefined : item.query);
      const currentIds=directory && result.context?.filtered ? projectVisibleIds(serverIds,result.context) : serverIds;
      if ((item.expectedIds && !same(currentIds, item.expectedIds)) || (result.outcome === 'done' && !same(result.resourceIds, currentIds)) || (result.outcome === 'failed' && result.resourceIds.length)) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED', 409);
      const failed = result.outcome === 'failed';
      const confirmedContext = result.context ?? item.request.context;
      if (['navigate-public','read-page','read-hours'].includes(item.action.type) && !result.context) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
      if (directory && !failed) confirmDirectoryAction(item.action,item.request.context,result.context,item.query,currentIds);
      if (result.context && !same(result.context.resourceIds,result.resourceIds)) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
      if (!failed && item.action.type==='navigate-public' && confirmedContext.page!==item.action.page) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
      if (!failed && (item.action.type==='read-page'||item.action.type==='read-hours') && confirmedContext.page!==item.request.context.page) throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
      const giving=item.request.intent.goal==='giving-guidance',orientation=item.request.intent.goal==='platform-guidance';
      const facts: Fact[] = failed ? [{ id: 'outcome', text: 'That action could not be completed.' }]
        : [{ id: 'outcome', text: giving?'You can explore ways to support local providers.':orientation?'Here is what Our Ground offers.':outcomeMessages[item.action.type] }, ...contextFacts(confirmedContext),
          dataFact(),
          ...(item.query?[countFact(total)]:[])];
      if (!failed && item.query) {
        facts.push({ id: 'search-area', text: `The search area is ${EDEN_CITIES.find(city => city.id === item.query!.cityId)!.label}.` },
          { id: 'search-radius', text: `The search distance is ${item.query.radius} miles.` });
        const selected = item.action.type === 'details' || item.action.type === 'select' || item.action.type==='read-hours' ? item.action.index : undefined;
        for (let index = 0; index < currentIds.length; index++) if (featured(index,selected)) facts.push(...await recordFacts(currentIds[index], index + 1));
      }
      if (!failed && item.action.type==='read-hours') facts.push(hoursFact());
      // Gemini already planned the action. Read the selected record directly for this factual reply.
      if (!failed && directory && options.hostedTurns && item.action.type==='read-hours') {
        const prefix=`resource-${item.action.index}-`;
        const title=facts.find(f=>f.id===prefix+'title'),hours=facts.find(f=>f.id===prefix+'hours');
        if(!title||!hours)throw new EdenProviderError('EDEN_AGENT_RESULT_UNCONFIRMED',409);
        return {engine:'gemini',reply:title.text+'. '+hours.text,sources:[title,hours],phrase:phrase(item.action,false)};
      }
      const requirements: CompositionRequirements = { requiredFactIds: ['outcome'], requiredOneOfFactIds: [] };
      if (!failed && giving){facts.push({id:'giving-next',text:'Would you like me to open Give Support?'});requirements.requiredFactIds.push('giving-purpose','giving-boundary','giving-next');}
      else if(!failed&&orientation)requirements.requiredFactIds.push('platform-purpose','platform-actions');
      else if (!failed && (item.action.type==='read-page'||item.action.type==='navigate-public')) requirements.requiredFactIds.push('page-'+confirmedContext.page+'-1');
      if(!failed && item.request.intent.goal==='explain-page' && confirmedContext.view){
        requirements.requiredFactIds.push('current-view');
        if(confirmedContext.searchState==='ready')requirements.requiredFactIds.push('visible-results');
        else if(confirmedContext.searchState==='error'||confirmedContext.searchState==='loading')requirements.requiredFactIds.push('search-state');
      }
      if (!failed && item.action.type==='read-hours') requirements.requiredFactIds.push('hours-unverified');
      if (!failed && directory && item.action.type==='read-hours') requirements.requiredFactIds.push(`resource-${item.action.index}-hours`);
      if (!failed && (item.action.type === 'search' || item.action.type === 'radius')) requirements.requiredFactIds.push('result-count');
      if (!failed && item.action.type === 'radius') requirements.requiredFactIds.push('search-radius');
      if (!failed && item.action.type === 'details') {
        requirements.requiredFactIds.push(`resource-${item.action.index}-title`);
        requirements.requiredOneOfFactIds.push([`resource-${item.action.index}-summary`, `resource-${item.action.index}-description`]);
      }
      if (!failed && item.action.type === 'search' && currentIds.length) requirements.requiredOneOfFactIds.push(facts.filter(fact => /^resource-\d+-title$/.test(fact.id)).map(fact => fact.id));
      if (directory && facts.some(fact => fact.id.startsWith('resource-'))) requirements.requiredFactIds.push('data-kind');
      else if (facts.some(fact => fact.id.startsWith('resource-'))) requirements.requiredOneOfFactIds.push(facts.filter(fact => /fictional|demonstration/i.test(fact.text)).map(fact => fact.id));
      const connectives = connectivesFor(facts);
      const args = await invoke({ confirmed_outcome: result.outcome, semantic_request: item.request.intent, source_facts: directory ? directoryModelFacts(facts) : facts,
        connective_phrases: connectives, required_fact_ids: requirements.requiredFactIds, required_one_of_fact_ids: requirements.requiredOneOfFactIds },
        'Compose Eden’s concise grounded answer by selecting and ordering segments. A fact segment references an exact source_facts ID; a connector segment references an exact connective_phrases ID. The website renders the selected immutable text, so return no prose or copied text. Include every required_fact_ids entry, and at least one entry from EACH required_one_of_fact_ids group. Select relevant listing facts for the user’s semantic request. Choose the fewest useful facts that satisfy the requirements, usually two or three; maximum six facts and two connectors. Never repeat a fact or a connector. Prefer no connectors to a repeated Also. For page explanations describe actual permitted capabilities; for missing hours say current status is not verified, without guessing. A brief fictional qualifier in a resource title is sufficient; do not repeat a long disclaimer. Order the facts and optional connectors into a readable answer. Never invent an ID, an availability claim, medical advice, or any additional action. If the confirmed outcome failed, select only its outcome fact and optional neutral connectors. Call compose_verified_reply with segments only.',
        EDEN_AGENT_REPLY_TOOL, { type: 'object', additionalProperties: false, required: ['segments'], properties: {
          segments: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: {
            kind: { type: 'string', enum: ['fact', 'connector'] }, id: { type: 'string', enum: [...facts.map(fact => fact.id), ...connectives.map(item => item.id)] },
          } } },
        } }, active.signal);
      const composition = validateEdenAgentComposition(args, facts, requirements);
      if (!composition.ok) throw new EdenProviderError(composition.code, 502);
      return { engine: 'gemini', reply: composition.reply, sources: composition.sources, phrase: phrase(item.action, failed) };
      } finally { active.finish(); }
    },
  };
}
export type EdenAgent = ReturnType<typeof createEdenAgent>;
