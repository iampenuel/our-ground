export const EDEN_PUBLIC_PAGES=['home','support','resource','discover','give','organizations','about','privacy'] as const;
export type EdenPublicPage=typeof EDEN_PUBLIC_PAGES[number];
export const EDEN_PUBLIC_DESTINATIONS=['home','support','give','organizations','about','privacy'] as const;
export type EdenPublicDestination=typeof EDEN_PUBLIC_DESTINATIONS[number];
export const EDEN_PUBLIC_PAGE_PATHS:Record<EdenPublicDestination,string>={home:'/',support:'/support',give:'/give',organizations:'/organizations',about:'/about',privacy:'/privacy'};
// Only these exact application headings may enter the provider context. A
// loaded listing title, arbitrary markup or a private page can never supply it.
const headings:Record<EdenPublicPage,readonly string[]>={
  home:['Stronger communities grow here.'],
  support:['Find support near you.','Find ways to give near you.'],
  resource:['Find support near you.','Find ways to give near you.'],discover:[],
  give:['Put your generosity to work.'],organizations:['Care for your public listing.'],
  about:['A clearer path to community support.'],privacy:['Useful information. Careful with yours.']
};
export function publicPageHeading(page:unknown,value:unknown):string|undefined{
  if(typeof page!=='string'||!EDEN_PUBLIC_PAGES.some(id=>id===page)||typeof value!=='string'||value.length>120)return;
  return headings[page as EdenPublicPage].find(heading=>heading===value);
}
export function isEdenPublicDestination(value:unknown):value is EdenPublicDestination{return typeof value==='string'&&EDEN_PUBLIC_DESTINATIONS.some(page=>page===value);}
/** Application-owned public copy, inspected against each route. These bounded
 * facts contain no scraped DOM, visitor text, account data or service claims.
 */
const descriptions:Record<EdenPublicPage,readonly string[]>={
  home:['Our Ground helps visitors explore food, healthcare, and community resource information.','The homepage links to Find Support, Give Support, and For Organizations.'],
  support:['Find Support searches food, healthcare or community support resources by location and distance.','Visitors can filter returned results, read source information and details, and use the map when available.','Listing coverage varies; confirm service information directly with the provider.'],
  resource:['Resource details show the selected listing and its available source information.','Missing hours, eligibility, availability, and other details must be confirmed directly with the provider.'],
  discover:['The legacy discovery route redirects to Find Support.','Find Support contains the current public resource search and results interface.'],
  give:['Give Support links to official food bank resources for volunteering, giving goods and financial support.','Our Ground does not process donations, book volunteer opportunities, collect card details, or guarantee tax deductibility.','Fictional demonstration listings are not real providers and cannot receive support.'],
  organizations:['For Organizations explains how representatives can sign in, request access and report a listing correction.','Administrators must approve organization access before assigned records can be edited; proposed updates require review.','Eden can explain this public process but cannot sign in, inspect private accounts, or submit access requests or changes.'],
  about:['About explains Our Ground, its public resource directory, and how residents, donors, and organizations can participate.','Sourced listings are not independent verification or a guarantee of availability; fictional demonstrations are labeled separately.'],
  privacy:['Privacy describes location search, resource sources, account information, corrections, retention, and provider processing.','Eden sends public concepts, page state and approved directory facts to Gemini after acknowledgement. Private account and form fields are excluded.','Eden cannot inspect private account information or perform account changes.'],
};
export function edenPublicPageFacts(page:EdenPublicPage):Array<{id:string;text:string}>{return(descriptions[page]??[]).map((text,index)=>({id:'page-'+page+'-'+(index+1),text}));}
