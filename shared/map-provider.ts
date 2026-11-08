/** Provider-independent map rendering contract. This contains an intentionally
 * public, restricted browser key URL. Never log/telemetry the style URL.
 */
export interface MapTileConfiguration {
  provider: string;
  styleUrl: string;
  attributions: readonly Readonly<{name: string; url: string; required: true}>[];
  attributionControl: true;
  freePlanBrandingRequired: boolean;
}

export const geoapifyMapAttributions = Object.freeze([
  Object.freeze({name: 'Geoapify', url: 'https://www.geoapify.com/', required: true as const}),
  Object.freeze({name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', required: true as const}),
  Object.freeze({name: 'OpenMapTiles', url: 'https://openmaptiles.org/', required: true as const})
]);

/** Shape validation prevents URL/header injection and common wrong-provider
 * credentials. Geoapify keys have no browser/server scope encoded in their
 * shape: the caller must supply the separately restricted browser key.
 */
export function getGeoapifyStyleURL(key: unknown): string {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || /^(?:sb_|AIza|AKIA|ASIA|gh[pousr]_|github_pat_)/.test(key)) {
    throw new Error('A valid restricted map browser key is required.');
  }
  const url = new URL('https://maps.geoapify.com/v1/styles/osm-bright-smooth/style.json');
  url.searchParams.set('apiKey', key);
  return url.href;
}

export function getGeoapifyMapConfiguration(key: unknown): MapTileConfiguration {
  return Object.freeze({provider: 'geoapify', styleUrl: getGeoapifyStyleURL(key), attributions: geoapifyMapAttributions, attributionControl: true, freePlanBrandingRequired: true});
}
