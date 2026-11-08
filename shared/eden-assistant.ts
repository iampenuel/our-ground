/** EDEN's initial navigation vocabulary is deliberately finite. This module is
 * shared by the local interpreter and server validators; it contains no provider
 * key, SDK, visitor text storage or network operation.
 */
import {usStates} from './us-location.ts';
import {EDEN_PUBLIC_PAGES,isEdenPublicDestination} from './eden-public-pages.ts';
import type {EdenPublicDestination,EdenPublicPage} from './eden-public-pages.ts';
export const EDEN_NOTICE_VERSION = 'eden-public-conversation-2026-11-08';
export const EDEN_MAX_COMMAND_LENGTH = 240;
export const EDEN_RADII = [5, 10, 25, 50] as const;
export type EdenRadius = typeof EDEN_RADII[number];
export type EdenCategory = 'food' | 'healthcare' | 'community';

const stateCities = [
  ['AL', 'Birmingham'],
  ['AK', 'Anchorage'],
  ['AZ', 'Phoenix'],
  ['AR', 'Little Rock'],
  ['CA', 'Sacramento'],
  ['CO', 'Denver'],
  ['CT', 'Hartford'],
  ['DE', 'Dover'],
  ['FL', 'Miami'],
  ['GA', 'Savannah'],
  ['HI', 'Honolulu'],
  ['ID', 'Boise'],
  ['IL', 'Springfield'],
  ['IN', 'Indianapolis'],
  ['IA', 'Des Moines'],
  ['KS', 'Topeka'],
  ['KY', 'Frankfort'],
  ['LA', 'Baton Rouge'],
  ['ME', 'Portland'],
  ['MD', 'Annapolis'],
  ['MA', 'Worcester'],
  ['MI', 'Lansing'],
  ['MN', 'Minneapolis'],
  ['MS', 'Jackson'],
  ['MO', 'Jefferson City'],
  ['MT', 'Helena'],
  ['NE', 'Lincoln'],
  ['NV', 'Las Vegas'],
  ['NH', 'Concord'],
  ['NJ', 'Trenton'],
  ['NM', 'Albuquerque'],
  ['NY', 'Albany'],
  ['NC', 'Raleigh'],
  ['ND', 'Bismarck'],
  ['OH', 'Columbus'],
  ['OK', 'Oklahoma City'],
  ['OR', 'Salem'],
  ['PA', 'Erie'],
  ['RI', 'Providence'],
  ['SC', 'Columbia'],
  ['SD', 'Pierre'],
  ['TN', 'Nashville'],
  ['TX', 'Austin'],
  ['UT', 'Salt Lake City'],
  ['VT', 'Montpelier'],
  ['VA', 'Richmond'],
  ['WA', 'Seattle'],
  ['WV', 'Charleston'],
  ['WI', 'Madison'],
  ['WY', 'Cheyenne'],
] as const;
export const EDEN_CITIES = [
  { id: 'harrisburg-pa', label: 'Harrisburg, Pennsylvania', query: 'Harrisburg, PA', aliases: ['harrisburg', 'harrisburg pa', 'harrisburg pennsylvania'] },
  { id: 'philadelphia-pa', label: 'Philadelphia, Pennsylvania', query: 'Philadelphia, PA', aliases: ['philadelphia', 'philly', 'philadelphia pa', 'philadelphia pennsylvania'] },
  { id: 'pittsburgh-pa', label: 'Pittsburgh, Pennsylvania', query: 'Pittsburgh, PA', aliases: ['pittsburgh', 'pittsburgh pa', 'pittsburgh pennsylvania'] },
  { id: 'lancaster-pa', label: 'Lancaster, Pennsylvania', query: 'Lancaster, PA', aliases: ['lancaster', 'lancaster pa', 'lancaster pennsylvania'] },
  { id: 'new-york-ny', label: 'New York, New York', query: 'New York, NY', aliases: ['new york', 'new york city', 'nyc', 'new york ny'] },
  { id: 'baltimore-md', label: 'Baltimore, Maryland', query: 'Baltimore, MD', aliases: ['baltimore', 'baltimore md', 'baltimore maryland'] },
  { id: 'washington-dc', label: 'Washington, DC', query: 'Washington, DC', aliases: ['washington dc', 'washington d.c.', 'dc', 'd.c.'] },
  { id: 'boston-ma', label: 'Boston, Massachusetts', query: 'Boston, MA', aliases: ['boston', 'boston ma', 'boston massachusetts'] },
  { id: 'chicago-il', label: 'Chicago, Illinois', query: 'Chicago, IL', aliases: ['chicago', 'chicago il', 'chicago illinois'] },
  { id: 'detroit-mi', label: 'Detroit, Michigan', query: 'Detroit, MI', aliases: ['detroit', 'detroit mi', 'detroit michigan'] },
  { id: 'atlanta-ga', label: 'Atlanta, Georgia', query: 'Atlanta, GA', aliases: ['atlanta', 'atlanta ga', 'atlanta georgia'] },
  { id: 'los-angeles-ca', label: 'Los Angeles, California', query: 'Los Angeles, CA', aliases: ['los angeles', 'los angeles ca', 'los angeles california', 'la'] },
  ...stateCities.map(([state,name]) => ({
    id: name.toLowerCase().replaceAll(' ','-')+'-'+state.toLowerCase(), label: name+', '+usStates[state], query: name+', '+state,
    aliases: [name.toLowerCase()+' '+state.toLowerCase(), name.toLowerCase()+' '+usStates[state].toLowerCase()],
  })),
] as const;
export type EdenCityId = typeof EDEN_CITIES[number]['id'];

/** These commands operate only through the local application adapter. They are
 * deliberately outside the Gemini function vocabulary and cannot be projected.
 */
export type EdenLocalOnlyAction =
  | { type: 'navigate-support' }
  | { type: 'read-results' }
  | { type: 'clear-filters' }
  | { type: 'read-page' }
  | { type: 'navigate-public'; page:EdenPublicDestination }
  | { type: 'read-hours'; index:number };
export type EdenAction =
  | { type: 'search'; category: EdenCategory; city?: EdenCityId; radius?: EdenRadius }
  | { type: 'radius'; radius: EdenRadius }
  | { type: 'refine'; category: EdenCategory }
  | { type: 'details' | 'select'; index: number }
  | { type: 'help' }
  | EdenLocalOnlyAction;

/** Provider actions have no city, resident input or arbitrary descriptive field. */
export type EdenProviderAction =
  | { type: 'search'; category: EdenCategory; radius?: EdenRadius }
  | Exclude<EdenAction, { type: 'search' } | EdenLocalOnlyAction>;

export type EdenPageContext = {
  page: EdenPublicPage;
  category?: EdenCategory;
  radius?: EdenRadius;
  resultCount: number;
  synthetic: boolean;
};
export type EdenInterpretation =
  | { status: 'supported'; action: EdenAction }
  | { status: 'sensitive' | 'unsupported' | 'clarify'; message: string };

const isRadius = (value: unknown): value is EdenRadius => typeof value === 'number' && EDEN_RADII.some(radius => radius === value);
const isCategory = (value: unknown): value is EdenCategory => value === 'food' || value === 'healthcare' || value === 'community';
const isCity = (value: unknown): value is EdenCityId => typeof value === 'string' && EDEN_CITIES.some(city => city.id === value);
const owns = (value: Record<string, unknown>, key: string) => Object.hasOwn(value, key);

/** JSON-shaped own data properties only. No getters, prototypes, symbols, arrays,
 * inherited parameters or coercion are accepted as executable command data.
 */
function dataObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some(key => !('value' in descriptors[key as string]))) return null;
    // Capture data values once, including non-enumerable fields, so validation
    // neither invokes getters nor overlooks a hidden unknown property.
    return Object.fromEntries(keys.map(key => [key, descriptors[key as string].value]));
  } catch { return null; }
}
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));

export function validateEdenAction(value: unknown): EdenAction | null {
  const action = dataObject(value);
  if (!action || typeof action.type !== 'string') return null;
  switch (action.type) {
    case 'search': {
      if (!only(action, ['type', 'category', 'city', 'radius']) || !isCategory(action.category)
        || (owns(action, 'city') && !isCity(action.city)) || (owns(action, 'radius') && !isRadius(action.radius))) return null;
      return { type: 'search', category: action.category, ...(isCity(action.city) ? { city: action.city } : {}), ...(isRadius(action.radius) ? { radius: action.radius } : {}) };
    }
    case 'radius':
      return only(action, ['type', 'radius']) && isRadius(action.radius) ? { type: 'radius', radius: action.radius } : null;
    case 'refine':
      return only(action, ['type', 'category']) && isCategory(action.category) ? { type: 'refine', category: action.category } : null;
    case 'details': case 'select': case 'read-hours':
      return only(action, ['type', 'index']) && typeof action.index === 'number' && Number.isInteger(action.index) && action.index >= 1 && action.index <= 20
        ? { type: action.type, index: action.index } : null;
    case 'help':
      return only(action, ['type']) ? { type: 'help' } : null;
    case 'navigate-support': case 'read-results': case 'clear-filters': case 'read-page':
      return only(action, ['type']) ? { type: action.type } : null;
    case 'navigate-public':return only(action,['type','page'])&&isEdenPublicDestination(action.page)?{type:'navigate-public',page:action.page}:null;
    default: return null;
  }
}

export function validateEdenProviderAction(value: unknown): EdenProviderAction | null {
  const action = dataObject(value);
  // Reject, rather than strip, a city or other extra visitor-supplied field at the
  // server's incoming provider boundary. City removal happens locally, explicitly.
  if (!action || owns(action, 'city')) return null;
  const safe = validateEdenAction(action);
  if (!safe || ['navigate-support','read-results','clear-filters','read-page','read-hours','navigate-public'].includes(safe.type)) return null;
  return safe as EdenProviderAction;
}

/** Local-only actions are intentionally not projectable. Runtime callers get
 * the same constant validation error used for malformed actions, without any
 * reflected visitor input or accidental expansion of provider permissions.
 */
export function providerEdenAction(action: EdenAction): EdenProviderAction {
  const safe = validateEdenAction(action);
  if (!safe || safe.type === 'navigate-support' || safe.type === 'read-results' || safe.type === 'clear-filters'||safe.type==='read-page'||safe.type==='read-hours'||safe.type==='navigate-public') throw new Error('Invalid EDEN action.');
  if (safe.type !== 'search') return safe;
  return { type: 'search', category: safe.category, ...(safe.radius !== undefined ? { radius: safe.radius } : {}) };
}

export function validateEdenPageContext(value: unknown): EdenPageContext | null {
  const context = dataObject(value);
  if (!context || !only(context, ['page', 'category', 'radius', 'resultCount', 'synthetic'])
    || typeof context.page !== 'string' || !EDEN_PUBLIC_PAGES.some(page=>page===context.page)
    || typeof context.synthetic !== 'boolean' || typeof context.resultCount !== 'number'
    || !Number.isInteger(context.resultCount) || context.resultCount < 0 || context.resultCount > 20
    || (owns(context, 'category') && !isCategory(context.category)) || (owns(context, 'radius') && !isRadius(context.radius))) return null;
  return {
    page: context.page as EdenPageContext['page'], resultCount: context.resultCount, synthetic: context.synthetic,
    ...(isCategory(context.category) ? { category: context.category } : {}), ...(isRadius(context.radius) ? { radius: context.radius } : {}),
  };
}

const normalizeCity = (value: string) => value.toLowerCase().replace(/,/g, '').replace(/\.$/, '').replace(/\s+/g, ' ').trim();
const cityAliases = new Map<string, EdenCityId>();
for (const city of EDEN_CITIES) for (const alias of city.aliases) cityAliases.set(normalizeCity(alias), city.id);
const cityFor = (value: string) => cityAliases.get(normalizeCity(value));
const categoryFor = (value: string): EdenCategory => /^(?:health ?care|medical|clinic)/.test(value) ? 'healthcare' : /^(?:community|housing)/.test(value) ? 'community' : 'food';

const messages = {
  sensitive: 'Please keep personal, health, financial and insurance details out of this prototype. Use a resource category and a supported city instead.',
  unsupported: 'I can help with food, healthcare or community resources, a supported city, search distance, and numbered results. Try “Find food assistance in Harrisburg.”',
  city: 'Choose a supported city, or use the page’s location search for another area. Street addresses and personal locations stay out of this assistant.',
  category: 'Would you like food resources or healthcare resources?',
  radius: 'Choose a distance of 5, 10, 25 or 50 miles.',
  results: 'Run a search first, then choose a numbered result that is currently shown.',
};

/** Classification is an additional local signal, not the privacy boundary. Even
 * text not detected here must match an entire finite grammar before any action
 * can be produced. The original input is never returned in a parsed action.
 */
const sensitivePattern = /\b(?:ssn|social security|date of birth|dob|passport|password|access token|api key|bearer|insurance|medicare|medicaid|policy number|bank account|bank balance|routing number|credit card|debit card|card number|income|salary|debt|diagnos(?:is|ed|es)|symptoms?|prescriptions?|medications?|medical records?|medical history|mental health|cancer|diabetes|hiv|pregnan(?:t|cy)|depression|bipolar|suicid\w*|overdose|immigration|undocumented|my address|my name is|i live at|my child|my children|my daughter|my son|under ?18|underage|minor)\b|\b(?:i am|i'm|im)\s+(?:[0-9]|1[0-7])(?:\s*(?:years? old|yo))?\b|\b\d{3}[- .]\d{2}[- .]\d{4}\b|\b(?:\+?1[- .]?)?(?:\(\d{3}\)|\d{3})[- .]?\d{3}[- .]?\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{2,}\s+[a-z]+(?:\s+[a-z]+){0,3}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b|\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/i;
const categoryWords = '(?:food(?: assistance(?: resources?)?| resources?| support| pantr(?:y|ies)| banks?)?|groceries|community (?:support|resources)|housing counseling|health ?care(?: resources?| services?| assistance)?|medical clinics?|clinics?)';
const radiusWords = '(?:\\d{1,3}|five|ten|twenty[ -]five|fifty)';
const searchPattern = new RegExp('^(?:find|search(?: for)?|look for|show(?: me)?) (?:a |an )?(' + categoryWords + ')(?: (?:in|near) (.+?))?(?: (?:within|in a radius of) (' + radiusWords + ') miles?)?$');
const categoryPattern = new RegExp('^' + categoryWords + '$');
const refinePattern = new RegExp('^(?:(?:switch|change)(?: the)?(?: category)? to|refine(?: search)? to|show only) (' + categoryWords + ')$');
const radiusPattern = new RegExp('^(?:(?:change|set)(?: the)? (?:search )?(?:radius|distance) to|(?:expand|narrow)(?: search)? to|(?:search )?within|make it|(?:only )?show(?: me)? (?:places|resources|results) within) (' + radiusWords + ') miles?$');
const categorySelectionPattern = new RegExp('^(?:select|choose)(?: the)?(?: category)? (' + categoryWords + ')$');
function radiusNumber(value: string): number {
  const words: Record<string, EdenRadius> = { five: 5, ten: 10, 'twenty five': 25, 'twenty-five': 25, fifty: 50 };
  return Object.hasOwn(words, value) ? words[value] : Number(value);
}
const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
function resultNumber(value: string): number | null {
  const ordinal = ordinals.indexOf(value);
  if (ordinal >= 0) return ordinal + 1;
  if (!/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= 20 ? number : null;
}
function indexedAction(type: 'details' | 'select', token: string, context?: EdenPageContext): EdenInterpretation {
  const index = resultNumber(token);
  if (index === null || (context && index > context.resultCount)) return { status: 'clarify', message: messages.results };
  return { status: 'supported', action: { type, index } };
}
function searchAction(category: EdenCategory, cityText?: string, radiusText?: string): EdenInterpretation {
  const city = cityText ? cityFor(cityText) : undefined;
  if (cityText && !city) return { status: 'clarify', message: messages.city };
  const radius = radiusText === undefined ? undefined : radiusNumber(radiusText);
  if (radius !== undefined && !isRadius(radius)) return { status: 'clarify', message: messages.radius };
  return { status: 'supported', action: { type: 'search', category, ...(city ? { city } : {}), ...(isRadius(radius) ? { radius } : {}) } };
}

/** Recognizes one complete public-navigation command. It deliberately cannot
 * pass through arbitrary city strings, clauses, descriptions or original chat.
 */
export function interpretEdenCommand(raw: unknown, context?: EdenPageContext): EdenInterpretation {
  if (typeof raw !== 'string' || raw.length > EDEN_MAX_COMMAND_LENGTH || /[\u0000-\u001f\u007f\p{Cf}]/u.test(raw)) return { status: 'unsupported', message: messages.unsupported };
  const checkedContext = context === undefined ? undefined : validateEdenPageContext(context);
  if (checkedContext === null) return { status: 'unsupported', message: messages.unsupported };
  let value = raw.normalize('NFC').replace(/’/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');
  if (sensitivePattern.test(value)) return { status: 'sensitive', message: messages.sensitive };
  value = value.replace(/^(?:hey )?eden(?:,|:)?\s+/, '').replace(/^please\s+/, '').replace(/\s+please[.!?]?$/, '').replace(/[.!?]$/, '').trim();
  if (!value) return { status: 'clarify', message: messages.unsupported };
  if (/^(?:help|hello|hi|hey|what can you do|what can i ask|show commands|get started|start)$/.test(value)) return { status: 'supported', action: { type: 'help' } };
  if (/^(?:(?:go(?: to)?|navigate to|open) )?find support$/.test(value)) return { status: 'supported', action: { type: 'navigate-support' } };
  if (/^(?:clear|reset|remove)(?: the| all)? (?:search )?filters$/.test(value)) return { status: 'supported', action: { type: 'clear-filters' } };
  if (/^(?:read(?: out)?(?: the)? (?:current )?results|show(?: the)? current results)$/.test(value)) return { status: 'supported', action: { type: 'read-results' } };
  if (/\b(?:near me|current location|my location)\b/.test(value)) return { status: 'clarify', message: 'Choose a city or use the page’s location controls. I do not infer or request your device location.' };

  const categorySelection = categorySelectionPattern.exec(value);
  if (categorySelection) return { status: 'supported', action: { type: checkedContext?.page === 'support' ? 'refine' : 'search', category: categoryFor(categorySelection[1]) } };

  const map = /^(?:select|highlight|map)(?: the)? (?:(?:resource|result|listing) )?([a-z0-9]+)(?: (?:resource|result|listing))?(?: on(?: the)? map)?$/.exec(value)
    ?? /^(?:show|find)(?: the)? (?:(?:resource|result|listing) )?([a-z0-9]+)(?: (?:resource|result|listing))? on(?: the)? map$/.exec(value);
  if (map) return indexedAction('select', map[1], checkedContext ?? undefined);
  const details = /^(?:open|view|show)(?: the)? (?:(?:resource|result|listing) )?([a-z0-9]+)(?: (?:resource|result|listing))?(?: details)?$/.exec(value)
    ?? /^(?:(?:open|view|show) )?details(?: for| of)?(?: the)? (?:(?:resource|result|listing) )?([a-z0-9]+)(?: (?:resource|result|listing))?$/.exec(value);
  if (details) return indexedAction('details', details[1], checkedContext ?? undefined);

  const radius = radiusPattern.exec(value);
  if (radius) return isRadius(radiusNumber(radius[1])) ? { status: 'supported', action: { type: 'radius', radius: radiusNumber(radius[1]) as EdenRadius } } : { status: 'clarify', message: messages.radius };
  const refine = refinePattern.exec(value);
  if (refine) return { status: 'supported', action: { type: 'refine', category: categoryFor(refine[1]) } };
  const search = searchPattern.exec(value);
  if (search) return searchAction(categoryFor(search[1]), search[2], search[3]);
  if (categoryPattern.test(value)) return { status: 'supported', action: { type: checkedContext?.page === 'support' ? 'refine' : 'search', category: categoryFor(value) } };

  const cityChange = new RegExp('^(?:search(?: in)?|(?:change|set)(?: the)? city to) (.+?)(?: within (' + radiusWords + ') miles?)?$').exec(value);
  if (cityChange) {
    if (!checkedContext?.category) return { status: 'clarify', message: messages.category };
    return searchAction(checkedContext.category, cityChange[1], cityChange[2]);
  }
  const city = cityFor(value);
  if (city) return checkedContext?.category ? { status: 'supported', action: { type: 'search', category: checkedContext.category, city } } : { status: 'clarify', message: messages.category };
  return { status: 'unsupported', message: messages.unsupported };
}
