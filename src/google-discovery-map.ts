import type { DiscoveredPlace } from '../shared/discovery.ts';
export type MapPoint = Pick<DiscoveredPlace, 'place_id' | 'name' | 'latitude' | 'longitude'>;
type Point = { lat: number; lng: number };
type MapInstance = { moveCamera(options: { center: Point; zoom?: number }): void };
type Marker = { map: MapInstance | null; title: string; addListener(name: string, listener: () => void): { remove(): void } };
export type GoogleSdk = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => MapInstance;
  AdvancedMarkerElement: new (options: Record<string, unknown>) => Marker;
};
type GoogleWindow = Window & {
  google?: { maps: { importLibrary(name: string): Promise<Record<string, unknown>> } };
  __ourGroundGoogleReady?: () => void;
  gm_authFailure?: () => void;
};
export type DiscoveryMap = ReturnType<typeof mountDiscoveryMap>;

/** Dependency boundary lets deterministic tests exercise marker/list wiring without Google calls. */
export function mountDiscoveryMap(sdk: GoogleSdk, container: HTMLElement, mapId: string, select: (id: string) => void,
  makePin = (number: number) => { const pin = document.createElement('span'); pin.className = 'discovery-pin'; pin.textContent = String(number); return pin; }) {
  const map = new sdk.Map(container, { mapId, center: { lat: 40.27, lng: -76.89 }, zoom: 11, colorScheme: 'LIGHT', gestureHandling: 'cooperative', mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
  let entries: Array<{ marker: Marker; pin: HTMLElement; place: MapPoint; remove(): void }> = [];
  const clear = () => { for (const entry of entries) { entry.remove(); entry.marker.map = null; } entries = []; };
  return {
    update(items: MapPoint[]) {
      clear();
      entries = items.map((place, index) => {
        const pin = makePin(index + 1);
        const marker = new sdk.AdvancedMarkerElement({ map, position: { lat: place.latitude, lng: place.longitude }, title: `${index+1}. ${place.name}. Show details`, content: pin, gmpClickable: true });
        const listener = marker.addListener('click', () => select(place.place_id));
        return { marker, pin, place, remove: () => listener.remove() };
      });
      if (items.length) {
        const minLat = Math.min(...items.map(p => p.latitude)), maxLat = Math.max(...items.map(p => p.latitude));
        const minLng = Math.min(...items.map(p => p.longitude)), maxLng = Math.max(...items.map(p => p.longitude));
        const span = Math.max(maxLat-minLat, (maxLng-minLng)*.77, .025);
        // Nonanimated camera changes also respect reduced-motion preferences.
        map.moveCamera({ center: { lat: (minLat+maxLat)/2, lng: (minLng+maxLng)/2 }, zoom: Math.min(13, Math.max(7, Math.floor(Math.log2(180/span)))) });
      }
    },
    select(id: string | null) {
      for (const entry of entries) {
        const selected = entry.place.place_id === id;
        entry.pin.dataset.selected = String(selected);
        entry.marker.title = `${entry.place.name}${selected ? '. Selected' : '. Show details'}`;
      }
    },
    destroy() { clear(); container.replaceChildren(); }
  };
}

let sdkPromise: Promise<GoogleSdk> | undefined;
export function loadGoogleSdk(key: string, onFailure: () => void): Promise<GoogleSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const win = window as GoogleWindow;
    const script = document.createElement('script');
    let settled = false;
    const fail = () => { onFailure(); if (!settled) { settled = true; clearTimeout(timer); script.remove(); reject(new Error('Google map unavailable')); } };
    const timer = window.setTimeout(fail, 10000);
    win.gm_authFailure = fail;
    win.__ourGroundGoogleReady = () => {
      if (settled || !win.google) return;
      void Promise.all([win.google.maps.importLibrary('maps'), win.google.maps.importLibrary('marker')]).then(([maps, marker]) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        resolve({ Map: maps.Map, AdvancedMarkerElement: marker.AdvancedMarkerElement } as GoogleSdk);
      }).catch(fail);
    };
    script.async = true;
    script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key, v: 'quarterly', loading: 'async', callback: '__ourGroundGoogleReady', language: 'en', region: 'US' });
    script.onerror = fail;
    document.head.append(script);
  });
  return sdkPromise;
}
