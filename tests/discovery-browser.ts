// Browser-only test harness; never imported by the production entry point.
import '../src/design-tokens.css';
import '../src/styles.css';
import '../src/discovery.css';
import { mountDiscoveryPage } from '../src/discovery-page';
import { initializeSiteNavigation } from '../src/navigation';
import { createGoogleDiscoveryProvider } from '../backend/google-discovery';
import { handleDiscovery } from '../backend/discovery-api';
import { mountDiscoveryMap } from '../src/google-discovery-map';
import { testEnv, geocode, googlePlace } from './discovery-fixtures.mjs';
initializeSiteNavigation();
const scenario = document.querySelector<HTMLSelectElement>('#scenario')!;
const provider = createGoogleDiscoveryProvider({ env: testEnv, timeoutMs: 60, now: () => Date.now() * 1000, fetcher: async (url, init) => {
  const value = scenario.value;
  if (value === 'quota') return new Response('', {status:429});
  if (value === 'permission') return new Response('', {status:403});
  if (value === 'timeout') return new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason), {once:true}); });
  if (String(url).includes('/geocode/')) return Response.json({ status: value === 'invalid' ? 'ZERO_RESULTS' : 'OK', results: value === 'ambiguous' ? [geocode('Middletown'), {...geocode('Middletown'),place_id:'mock_other_location',formatted_address:'Mock Middletown Township, PA, USA'}] : [geocode()] });
  if (String(url).includes(':searchText')) return Response.json({ places: value === 'empty' ? [] : [googlePlace(),googlePlace({id:'mock_second_place',displayName:{text:'Mock Second Food Pantry — test fixture, do not visit'}})] });
  if (value === 'detail') return new Response('',{status:403});
  const id = new URL(String(url)).pathname.split('/').pop();
  return Response.json(googlePlace({id,displayName:{text:id==='mock_second_place'?'Mock Second Food Pantry — test fixture, do not visit':'Mock Food Pantry — test fixture, do not visit'}}));
}});
await mountDiscoveryPage(document.querySelector('#app')!, {
  request: async (path, init) => {
    const req = new Request('http://mock/api/v1/'+path,init);
    const res = await handleDiscovery(req, '/'+path.split('?')[0], provider);
    const data = await res.json();
    if (!res.ok) throw Error(data.error.message);
    return data;
  },
  mountMap: async (container, select) => {
    if (scenario.value === 'map') throw Error('Mock map failure');
    const sdk = {
      Map: class { container: HTMLElement; constructor(el: HTMLElement) { this.container=el; const note=document.createElement('p');note.textContent='MOCK MAP SDK — no Google basemap. Test markers only.';el.append(note); } moveCamera() {} },
      AdvancedMarkerElement: class {
        button: HTMLButtonElement; mapValue: any;
        constructor(options: any) { this.button=document.createElement('button');this.button.append(options.content);this.title=options.title;this.map=options.map; }
        set title(value: string) { this.button.setAttribute('aria-label','Mock marker: '+value); }
        set map(value: any) { this.mapValue=value; if(value) value.container.append(this.button); else this.button.remove(); }
        get map() { return this.mapValue; }
        addListener(_name: string, fn: () => void) { this.button.addEventListener('click',fn); return {remove:()=>this.button.removeEventListener('click',fn)}; }
      }
    };
    return mountDiscoveryMap(sdk,container,'mock-map-id',select);
  }
});
