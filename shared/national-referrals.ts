/** Public referral destinations, not imported listings or verified local services.
 * No location is appended: the user chooses what to share on the destination site.
 */
export type NationalFoodReferral = Readonly<{
  id: 'feeding-america' | '211' | 'national-hunger-hotline';
  data_kind: 'external_referral';
  name: string;
  description: string;
  action_label: string;
  url: string;
  phone_actions: readonly Readonly<{label: string; url: string}>[];
  source_urls: readonly string[];
  checked_at: string;
  coverage_note: string;
}>;

export const foodCoverageMessage = 'Our Ground’s local food listings are incomplete. Food help may still be available. Start with these trusted referral services.';

export const nationalFoodReferrals: readonly NationalFoodReferral[] = Object.freeze(([
  {
    id: 'feeding-america', data_kind: 'external_referral', name: 'Feeding America',
    description: 'Find a food bank in the Feeding America network by ZIP code, then contact it about nearby pantries and meal programs.',
    action_label: 'Find a local food bank', url: 'https://www.feedingamerica.org/find-your-local-foodbank',
    phone_actions: [], source_urls: ['https://www.feedingamerica.org/find-your-local-foodbank'], checked_at: '2026-11-05',
    coverage_note: 'A network locator, not a complete list of every food program. Confirm local services, hours and requirements directly.'
  },
  {
    id: '211', data_kind: 'external_referral', name: '211',
    description: 'Contact a local 211 service for food assistance and other community-support information.',
    action_label: 'Find your local 211', url: 'https://www.211.org/about-us/your-local-211',
    phone_actions: [{label: 'Call 211', url: 'tel:211'}],
    source_urls: ['https://211.org/get-help/food-programs-food-benefits', 'https://www.211.org/about-us/your-local-211'], checked_at: '2026-11-05',
    coverage_note: 'Available contact methods, operating hours and local information vary. If 211 does not connect, use the local contact finder.'
  },
  {
    id: 'national-hunger-hotline', data_kind: 'external_referral', name: 'USDA National Hunger Hotline',
    description: 'Speak with the National Hunger Hotline about food resources. USAGov also explains government and community food-help options.',
    action_label: 'View government food-help options', url: 'https://www.usa.gov/emergency-food-assistance',
    phone_actions: [{label: 'Call 1-866-348-6479', url: 'tel:+18663486479'}, {label: 'Spanish: 1-877-842-6273', url: 'tel:+18778426273'}],
    source_urls: ['https://www.usa.gov/emergency-food-assistance', 'https://www.fns.usda.gov/national-hunger-hotline'], checked_at: '2026-11-05',
    coverage_note: 'A referral service, not a guarantee of food or eligibility. Check the linked official guidance for current availability.'
  }
] satisfies NationalFoodReferral[]).map(item => Object.freeze({...item, phone_actions: Object.freeze(item.phone_actions.map(action => Object.freeze(action))), source_urls: Object.freeze(item.source_urls)})));

/** Official external healthcare locator; no resident location is forwarded. */
export type NationalHealthcareReferral = Omit<NationalFoodReferral, 'id'> & Readonly<{id:'hrsa-health-center-locator'}>;
export const healthcareCoverageMessage = 'Our Ground has no matching healthcare listings for these filters and this area. That does not mean healthcare is unavailable. Try a wider radius, remove a filter, or use the official locator below.';
export const nationalHealthcareReferrals: readonly NationalHealthcareReferral[] = Object.freeze([Object.freeze({
  id:'hrsa-health-center-locator',data_kind:'external_referral',name:'HRSA Find a Health Center',
  description:'Use the official HRSA locator to look for health center locations and their public contact information.',
  action_label:'Open HRSA health center locator',url:'https://findahealthcenter.hrsa.gov/',
  phone_actions:Object.freeze([]),source_urls:Object.freeze(['https://findahealthcenter.hrsa.gov/','https://bphc.hrsa.gov/sites/default/files/bphc/about/health-center-handout.pdf']),checked_at:'2026-11-05',
  coverage_note:'An external health-center locator, not a complete list of every healthcare provider or a guarantee of appointments, services, eligibility or cost. Confirm details with the provider.'
})]);

export const communityCoverageMessage = 'Local community listings are incomplete. Housing and other support may be available through the external directories below.';
export const nationalCommunityReferrals: readonly (Omit<NationalFoodReferral,'id'> & {id:string})[] = [
  { id:'hud-counseling', data_kind:'external_referral', name:'HUD housing counseling agencies', description:'Search for HUD-approved counselors who help renters and homeowners understand housing options.', action_label:'Find housing counseling', url:'https://data.hud.gov/housing_counseling.html', phone_actions:[], source_urls:['https://data.hud.gov/housing_counseling.html'], checked_at:'2026-11-07', coverage_note:'Agency locations may be approximate. Confirm available services, languages and appointments with the agency.' },
  { ...nationalFoodReferrals[1], description:'Find a local 211 service for information about housing, utilities and other community needs.', coverage_note:'Local programs, eligibility and availability vary.' }
];
