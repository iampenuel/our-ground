import { EDEN_CITIES } from '../../shared/eden-assistant.ts';
import { getEdenReviewScenario } from '../../shared/eden-review.ts';
import type { EdenReviewCandidate, EdenReviewScenarioId } from '../../shared/eden-review.ts';
import type { ResourceCard, ResourceDetail } from '../../shared/contracts.ts';
import type { SupportRequest } from '../support-search.ts';

const centers = [
  [40.2732,-76.8867,'PA'],[39.9526,-75.1652,'PA'],[40.4406,-79.9959,'PA'],[40.0379,-76.3055,'PA'],
  [40.7128,-74.006,'NY'],[39.2904,-76.6122,'MD'],[38.9072,-77.0369,'DC'],[42.3601,-71.0589,'MA'],
  [41.8781,-87.6298,'IL'],[42.3314,-83.0458,'MI'],[33.749,-84.388,'GA'],[34.0522,-118.2437,'CA'],
] as const;
export function edenSampleFacts(candidate: EdenReviewCandidate): string {
  return `${candidate.access === 'step-free' ? 'Step-free access' : 'Stairs at entrance'} · ${candidate.hours === 'open-now' ? 'Open now' : 'Opens later today'} · ${candidate.distanceMiles} miles. Sample facts only; not real service information.`;
}
function delay(signal: AbortSignal | null | undefined, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Interrupted', 'AbortError')); return; }
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Interrupted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
/** Browser-local sample directory. This transport never calls a resource or AI service. */
export function createEdenSampleResources(options: { latencyMs?: number } = {}) {
  let cityIndex = 0, scenarioId: EdenReviewScenarioId = 'food-step-free';
  let records: ResourceCard[] = [];
  const facts = new Map<string, string>();
  const request: SupportRequest = async <T>(path: string, init: RequestInit = {}) => {
    await delay(init.signal, options.latencyMs ?? 180);
    const url = new URL(path, 'https://sample.invalid/');
    let value: unknown;
    if (url.pathname === '/geoapify/status') value = { enabled: false };
    else if (url.pathname === '/locations/status') value = { configured: false, referenceConfigured: false };
    else if (url.pathname === '/places/resolve') {
      const normalized = (text: string) => text.toLowerCase().replace(/[^a-z ]/g, '').trim();
      const query = normalized(url.searchParams.get('q') ?? '');
      cityIndex = EDEN_CITIES.findIndex(city => city.aliases.some(alias => normalized(alias) === query) || normalized(city.query) === query);
      if (cityIndex < 0) { cityIndex = 0; throw new Error('Try a sample city such as Harrisburg, Philadelphia, or Pittsburgh.'); }
      const [latitude, longitude, state] = centers[cityIndex];
      value = { place: { label: `${EDEN_CITIES[cityIndex].query} · sample area`, city: EDEN_CITIES[cityIndex].query.split(',')[0], state, latitude, longitude } };
    } else if (url.pathname === '/resources') {
      const category = url.searchParams.get('category') === 'community' ? 'community' : url.searchParams.get('category') === 'healthcare' ? 'healthcare' : 'food';
      const [latitude, longitude, state] = centers[cityIndex];
      const city = EDEN_CITIES[cityIndex].query.split(',')[0];
      const scenario = getEdenReviewScenario(scenarioId)!;
      const radius = Number(url.searchParams.get('radius_miles') ?? 25);
      const keyword = (url.searchParams.get('q') ?? '').toLowerCase().trim();
      facts.clear();
      records = scenario.candidates.map((candidate): ResourceCard => {
        const id = `e0300000-0000-4000-8000-00000000000${candidate.index}`;
        const fact = edenSampleFacts(candidate); facts.set(id, fact);
        // Opposing directions keep markers distinct; distances are fictional catalog facts.
        const angle = [-.8, .7, 2.1][candidate.index - 1];
        const north = Math.cos(angle) * candidate.distanceMiles / 69;
        const east = Math.sin(angle) * candidate.distanceMiles / (69 * Math.cos(latitude * Math.PI / 180));
        return {
          id, title: category === 'food' ? candidate.label : candidate.label.replace('Pantry', 'Community Clinic'),
          summary: fact, category_slugs: [category], organization: { id: 'e0300000-0000-4000-8000-100000000001', name: 'Our Ground sample neighborhood' },
          location: { city, state, address_label: 'Illustrative sample location · do not visit', latitude: latitude + north, longitude: longitude + east },
          distance_miles: candidate.distanceMiles, data_kind: 'fictional_demo', source_recorded_at: null,
          contact: { website_url: null, phone: null },
        };
      }).filter(card => card.distance_miles <= radius && (!keyword || `${card.title} ${card.summary}`.toLowerCase().includes(keyword)));
      value = { items: records, page: 1, page_size: 20, total: records.length, has_next: false, search_center: { latitude, longitude } };
    } else if (/^\/resources\/[a-f0-9-]+$/.test(url.pathname)) {
      const card = records.find(record => record.id === url.pathname.split('/').at(-1));
      if (!card) throw new Error('This sample is not in the current results. Run a sample search first.');
      const { distance_miles: _distance, ...base } = card;
      const detail: ResourceDetail = {
        ...base, description: `${facts.get(card.id)} This invented listing demonstrates the Our Ground details view. It does not represent an actual organization, current schedule, access conditions, or service.`,
        eligibility_text: 'Sample listing only. No real eligibility requirements are represented.',
        cost_summary: 'Sample listing only. No real costs are represented.', hours: [],
        contact: { phone: null, website_url: null, directions_url: null }, source: { url: null, recorded_at: null },
      };
      value = detail;
    } else throw new Error('This action is outside the sample resource guide.');
    return value as T;
  };
  return {
    request,
    setScenario(id: EdenReviewScenarioId) {
      const scenario = getEdenReviewScenario(id);
      if (!scenario) throw new Error('Choose an available sample comparison.');
      scenarioId = scenario.id;
    },
  };
}
