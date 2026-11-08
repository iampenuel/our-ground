export const EDEN_PUBLIC_PAGES=['home','support','resource','discover','give','organizations','about','privacy'] as const;
export type EdenPublicPage=typeof EDEN_PUBLIC_PAGES[number];
export const EDEN_PUBLIC_DESTINATIONS=['home','support','give','organizations','about','privacy'] as const;
export type EdenPublicDestination=typeof EDEN_PUBLIC_DESTINATIONS[number];
export const EDEN_PUBLIC_PAGE_PATHS:Record<EdenPublicDestination,string>={home:'/',support:'/support',give:'/give',organizations:'/organizations',about:'/about',privacy:'/privacy'};
export function isEdenPublicDestination(value:unknown):value is EdenPublicDestination{return typeof value==='string'&&EDEN_PUBLIC_DESTINATIONS.some(page=>page===value);}
/** Application-owned public copy, inspected against each route. These bounded
 * facts contain no scraped DOM, visitor text, account data or service claims.
 */
const descriptions:Record<EdenPublicPage,readonly string[]>={
  home:['Our Ground helps visitors explore food, healthcare, and community resource information.','The homepage links to Find Support, Give Support, and For Organizations.'],
  support:['Find Support searches food, healthcare or community support resources by location and distance.','Visitors can filter returned results, read source information and details, and use the map when available.','Listing coverage varies; confirm service information directly with the provider.'],
  resource:['Resource details show the selected listing and its available source information.','Missing hours, eligibility, availability, and other details must be confirmed directly with the provider.'],
  discover:['The legacy discovery route redirects to Find Support.','Find Support contains the current public resource search and results interface.'],
  give:['Give Support explains how to explore local providers and confirm their identity and current needs through official channels.','Our Ground does not process donations, book volunteer opportunities, collect card details, or guarantee tax deductibility.','Fictional demonstration listings are not real providers and cannot receive support.'],
  organizations:['For Organizations helps representatives find their public listing and report corrections. New organization access is currently closed.','Administrators must approve organization access before assigned records can be edited; proposed updates require review.','Eden can explain this public process but cannot sign in, inspect private accounts, or submit access requests or changes.'],
  about:['About explains Our Ground, its public resource directory, and how residents, donors, and organizations can participate.','Sourced listings are not independent verification or a guarantee of availability; fictional demonstrations are labeled separately.'],
  privacy:['Privacy describes location search, resource sources, account information, corrections, retention, and provider processing.','Typed Eden requests use finite structured intent; local Live microphone audio is sent directly to Google while Listening and is not redacted before transmission.','Eden cannot inspect private account information or perform account changes.'],
};
export function edenPublicPageFacts(page:EdenPublicPage):Array<{id:string;text:string}>{return(descriptions[page]??[]).map((text,index)=>({id:'page-'+page+'-'+(index+1),text}));}
