import type { DiscoveredPlace } from '../shared/discovery.ts';

/** The list and map share IDs and one selection; stale callbacks cannot select removed places. */
export function createDiscoverySelection(onChange: (place: DiscoveredPlace | null) => void) {
  return createKeyedSelection((place: DiscoveredPlace) => place.place_id, onChange);
}
export function createKeyedSelection<T>(key: (item: T) => string, onChange: (item: T | null) => void) {
  let places: T[] = [], selected: string | null = null;
  return {
    replace(items: T[], preserve = false) { places = items; if (preserve && places.some(p => key(p) === selected)) return; selected = null; onChange(null); },
    select(id: string) {
      const place = places.find(p => key(p) === id);
      if (!place || selected === id) return false;
      selected = id; onChange(place); return true;
    },
    current: () => selected
  };
}
