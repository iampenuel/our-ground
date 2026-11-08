// Retained legacy Google page/test harness. The public /discover route redirects to unified /support.
import { discoveryTerms } from '../shared/discovery.ts';
import type { DiscoveredPlace, DiscoveryDetail, DiscoverySearch, DiscoveryStatus } from '../shared/discovery.ts';
import { header, footer } from './navigation';
import { apiRequest } from './api-client';
import { escapeHtml as esc } from './ui';
import { createDiscoverySelection } from './discovery-selection';
import { discoveryCards, discoveryDetail, googleAttribution } from './discovery-view';
import type { DiscoveryMap } from './google-discovery-map';

type PageOptions = {
  request?: typeof apiRequest;
  mapKey?: string;
  mapId?: string;
  mountMap?: (container: HTMLElement, select: (id: string) => void, failure: () => void) => Promise<DiscoveryMap>;
};
export async function mountDiscoveryPage(root: HTMLElement, options: PageOptions = {}) {
  const request = options.request ?? apiRequest;
  document.title = 'Discover places — Our Ground';
  root.innerHTML = `<div class="page-shell">${header('support')}<main id="main" tabindex="-1" class="og-container discovery-main">
    <nav class="directory-modes" aria-label="Support search"><a href="/support">Resource directory</a><a href="/discover" aria-current="page">Discover places</a></nav>
    <section class="discovery-intro" aria-labelledby="discoveryTitle"><span class="page-eyebrow">United States · place discovery</span><h1 id="discoveryTitle">Find a local starting point.</h1><p>Look for food assistance and healthcare establishments using Google Maps. These listings are separate from the Our Ground resource directory. Confirm that the services you need are available before visiting.</p></section>
    <form class="discovery-form" id="discoveryForm" role="search" aria-label="Discover United States places">
      <label>City or ZIP code<input id="discoveryLocation" name="q" type="search" required minlength="2" maxlength="80" autocomplete="off" placeholder="U.S. city and state or ZIP" aria-describedby="discoveryPrivacy" /></label>
      <label>Type of support<select id="discoveryTerm" name="term">${['food','healthcare'].map(category => `<optgroup label="${category === 'food' ? 'Food assistance' : 'Healthcare'}">${Object.entries(discoveryTerms).filter(([,term]) => term.category === category).map(([key,term]) => `<option value="${key}">${term.label}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Distance<select id="discoveryRadius" name="radius_miles"><option value="5">Within 5 miles</option><option value="10" selected>Within 10 miles</option><option value="25">Within 25 miles</option></select></label>
      <button type="submit" class="search-button" id="discoverySubmit" disabled>Search places</button>
    </form>
    <p id="discoveryPrivacy" class="discovery-note">Submitting a search sends your city or ZIP and support search term to Google through Our Ground. No device location is requested. Opening the map connects your browser to Google. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy<span class="visually-hidden"> (opens in a new tab)</span></a> · <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer">Google Maps terms<span class="visually-hidden"> (opens in a new tab)</span></a><span id="discoveryPolicies"></span></p>
    <div id="discoveryStatus" class="status-message discovery-status" role="status" tabindex="-1">Checking place discovery…</div>
    <div id="discoveryAttribution" hidden>${googleAttribution}</div>
    <div id="discoveryChoices" class="discovery-choice" role="group" aria-label="Choose a United States location"></div>
    <section id="discoveryResultsSection" aria-label="Google-discovered results" hidden>
      <div class="discovery-tools"><button id="showDiscoveryMap" type="button" class="secondary-button" aria-expanded="false" aria-controls="discoveryMapFrame">Show Google map</button></div>
      <p class="discovery-note">Up to 10 results per search, in Google’s returned order. Our location and category checks may exclude places. This is not a complete list of assistance programs. Try another approved search term or the resource directory.</p>
      <div class="discovery-content"><section aria-label="Matching places" class="discovery-results" id="discoveryResults"></section><div class="discovery-side">
        <section id="discoveryMapFrame" class="discovery-map-frame" aria-label="Google map of matching places" hidden><div id="discoveryMap" class="discovery-map"></div><p id="discoveryMapState" class="discovery-map-state" role="status" hidden></p></section>
        <section id="placeDetail" class="discovery-detail" aria-label="Selected place details" hidden></section>
      </div></div>
    </section>
  </main>${footer()}</div>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#'+id)!;
  const form = el<HTMLFormElement>('discoveryForm'), submit = el<HTMLButtonElement>('discoverySubmit'), status = el('discoveryStatus');
  const results = el('discoveryResults'), detail = el('placeDetail'), mapButton = el<HTMLButtonElement>('showDiscoveryMap');
  let available = false, busy = false, items: DiscoveredPlace[] = [], map: DiscoveryMap | null = null, mapLoading = false, mapFailed = false;
  let searchController: AbortController | null = null, detailController: AbortController | null = null;
  let submitted = new URLSearchParams();
  function announce(text: string, focus = false) { status.textContent = text; if (focus) status.focus(); }
  function mapFailure() {
    mapFailed = true; map?.destroy(); map = null;
    el('discoveryMap').hidden = true;
    el('discoveryMapState').hidden = false;
    el('discoveryMapState').textContent = 'Google map unavailable. Every matching place and its details remain available in the list.';
  }
  function backToResult() {
    const button = Array.from(results.querySelectorAll<HTMLButtonElement>('[data-place-id]')).find(b => b.dataset.placeId === selection.current());
    button?.focus();
  }
  function wireDetail() { el('backToPlaces')?.addEventListener('click', backToResult); }
  const selection = createDiscoverySelection((place) => {
    detailController?.abort();
    results.querySelectorAll<HTMLButtonElement>('[data-place-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.placeId === place?.place_id)));
    map?.select(place?.place_id ?? null);
    detail.hidden = !place;
    if (!place) { detail.replaceChildren(); return; }
    // Render the selected search record immediately; contact details are fetched once on selection.
    detail.innerHTML = discoveryDetail(place, true); wireDetail(); el('placeDetailTitle').focus();
    const controller = new AbortController(); detailController = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void request<DiscoveryDetail>('discovery/places/'+encodeURIComponent(place.place_id)+'?category='+place.category, { signal }).then(data => {
      if (controller.signal.aborted || selection.current() !== place.place_id) return;
      const focused = detail.contains(document.activeElement) ? document.activeElement : null;
      const focusedHref = focused instanceof HTMLAnchorElement ? focused.getAttribute('href') : null;
      const focusedId = focused?.id;
      detail.innerHTML = discoveryDetail(data); wireDetail();
      const restore = focusedHref ? Array.from(detail.querySelectorAll<HTMLAnchorElement>('a')).find(a => a.getAttribute('href') === focusedHref) : focusedId ? el(focusedId) : null;
      if (focused) (restore ?? el('placeDetailTitle')).focus({ preventScroll: true });
    }).catch(error => {
      if (controller.signal.aborted) return;
      // A failed revalidation must not leave stale contact/directions actions active.
      const message = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Place details took too long. Select another place or search again.';
      const focusInside = detail.contains(document.activeElement);
      detail.innerHTML = `<h2 id="placeDetailTitle" tabindex="-1">Details unavailable</h2><p role="status">${esc(message)}</p><button class="secondary-button" type="button" id="backToPlaces">Back to selected result</button>`;
      wireDetail(); if (focusInside) el('placeDetailTitle').focus({ preventScroll: true });
    });
  });
  async function search(input: URLSearchParams) {
    if (!available || busy) return;
    busy = true; submit.disabled = true;
    searchController?.abort(); const controller = new AbortController(); searchController = controller;
    items = []; selection.replace([]); map?.update([]); el('discoveryResultsSection').hidden = true;
    el('discoveryChoices').replaceChildren(); results.replaceChildren();
    el('discoveryAttribution').hidden = true;
    announce('Searching United States places…'); results.setAttribute('aria-busy', 'true');
    try {
      const data = await request<DiscoverySearch>('discovery/places?'+input, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted) return;
      el('discoveryAttribution').hidden = false;
      if (data.status === 'choose_location') {
        announce('More than one United States location matched. Choose the one you mean.', true);
        el('discoveryChoices').innerHTML = data.choices.map(c => `<button type="button" class="secondary-button" data-location-id="${esc(c.place_id)}">${esc(c.label)}</button>`).join('');
      } else {
        items = data.items; selection.replace(items); results.innerHTML = discoveryCards(items); map?.update(items);
        el('discoveryResultsSection').hidden = !items.length;
        announce(items.length ? `${items.length} matching ${items.length === 1 ? 'place' : 'places'} within ${data.radius_miles} miles of ${data.location.label}. Select a place for details.` : `No matching places passed the checks near ${data.location.label}. Try another search term or distance. No fictional results have been substituted.`, true);
      }
    } catch (error) {
      if (!controller.signal.aborted) announce(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Discovery took too long. Please try again.', true);
    } finally { if (searchController === controller) { busy = false; submit.disabled = !available; results.removeAttribute('aria-busy'); } }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    submitted = new URLSearchParams({ q: el<HTMLInputElement>('discoveryLocation').value.trim(), term: el<HTMLSelectElement>('discoveryTerm').value, radius_miles: el<HTMLSelectElement>('discoveryRadius').value });
    void search(submitted);
  });
  el('discoveryChoices').addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-location-id]');
    if (button?.dataset.locationId) { const input = new URLSearchParams(submitted); input.set('location_id', button.dataset.locationId); void search(input); }
  });
  results.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-place-id]');
    if (button?.dataset.placeId && !selection.select(button.dataset.placeId)) el('placeDetailTitle')?.focus();
  });
  mapButton.addEventListener('click', () => {
    const open = mapButton.getAttribute('aria-expanded') !== 'true';
    mapButton.setAttribute('aria-expanded', String(open)); mapButton.textContent = open ? 'Hide Google map' : 'Show Google map';
    el('discoveryMapFrame').hidden = !open;
    if (!open || map || mapLoading || mapFailed || !items.length) return;
    if (!options.mountMap && (!options.mapKey || !options.mapId)) { mapFailure(); return; }
    mapLoading = true;
    el('discoveryMapState').hidden = false; el('discoveryMapState').textContent = 'Loading Google map…';
    const select = (id: string) => { if (!selection.select(id)) el('placeDetailTitle')?.focus(); };
    const mount = options.mountMap ?? (async (container, onSelect, onFailure) => {
      const { loadGoogleSdk, mountDiscoveryMap } = await import('./google-discovery-map');
      return mountDiscoveryMap(await loadGoogleSdk(options.mapKey!, onFailure), container, options.mapId!, onSelect);
    });
    void mount(el('discoveryMap'), select, mapFailure).then(instance => {
      if (mapFailed) { instance.destroy(); return; }
      map = instance; map.update(items); map.select(selection.current()); el('discoveryMapState').hidden = true;
    }).catch(mapFailure).finally(() => { mapLoading = false; });
  });
  window.addEventListener('pagehide', () => { searchController?.abort(); detailController?.abort(); map?.destroy(); }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  try {
    const data = await request<DiscoveryStatus>('discovery/status', { signal: AbortSignal.timeout(10000) });
    available = data.enabled; submit.disabled = !available;
    if (data.terms_url && data.privacy_url) el('discoveryPolicies').innerHTML = ` · <a href="${esc(data.terms_url)}">Our Ground terms</a> · <a href="${esc(data.privacy_url)}">Our Ground privacy</a>`;
    announce(available ? 'Choose a U.S. city and state or ZIP to begin. Choose the returned location you mean.' : 'Google place discovery is not available yet. No live place search is running. You can still browse the resource directory.');
  } catch { announce('Could not check place discovery. Reload this page to retry, or use the resource directory.'); }
}
