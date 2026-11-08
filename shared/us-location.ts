export const usStates = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
} as const;
export type USStateCode = keyof typeof usStates;

export function placeText(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFC').trim().toLowerCase()
    .replace(/[.’']/g, '').replace(/\s+/g, ' ') : '';
}

const stateNames = new Map<string, USStateCode>();
for (const code of Object.keys(usStates) as USStateCode[]) {
  stateNames.set(placeText(code), code);
  stateNames.set(placeText(usStates[code]), code);
}
export function stateCode(value: unknown) {
  return stateNames.get(placeText(value));
}
export function supportedState(country: unknown, code: unknown, name: unknown, countryName?: unknown) {
  if (placeText(country) !== 'us') return undefined;
  if (countryName != null && countryName !== '' &&
    !['us','usa','united states','united states of america'].includes(placeText(countryName))) return undefined;
  const fromCode = stateCode(code);
  const fromName = stateCode(name);
  if (code != null && code !== '' && !fromCode) return undefined;
  if (name != null && name !== '' && !fromName) return undefined;
  if (fromCode && fromName && fromCode !== fromName) return undefined;
  return fromCode ?? fromName;
}
export function validPoint(lat: unknown, lng: unknown) {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
}
export type LocationQuery =
  | { kind: 'postcode'; zip: string }
  | { kind: 'city'; city: string; state?: USStateCode; county?: string };

export function parseLocationQuery(input: string): LocationQuery | null {
  const value = input.trim();
  if (/^\d{5}$/.test(value)) return {kind: 'postcode', zip: value};
  if (value.length < 2 || value.length > 80 || !/^[\p{L}][\p{L} .,'’\-]+$/u.test(value)) return null;
  if (/^(?:APO|FPO|DPO)\b/i.test(value)) return null;
  const parts = value.split(',').map(part => part.trim());
  if (parts.some(part => !part) || parts.length > 3) return null;
  if (parts.length === 1) {
    const shorthand = /^(.*?)\s+([A-Z]{2})$/.exec(value);
    if (shorthand && stateCode(shorthand[2])) {
      return {kind: 'city', city: shorthand[1], state: stateCode(shorthand[2])};
    }
    return {kind: 'city', city: value};
  }
  const state = stateCode(parts.at(-1));
  const county = parts.length === 3 || !state ? parts[1] : undefined;
  if (county && !/\b(county|parish|borough|municipality|census area)$/i.test(county)) return null;
  if (parts.length === 3 && !state) return null;
  return {kind: 'city', city: parts[0], state, county};
}
export const usLocationGuidance = 'Enter a city and state or a five-digit ZIP in the 50 U.S. states or Washington, DC. U.S. territories and overseas military addresses are outside this search.';
export const directoryScopeMessage = 'Directory coverage varies by source and location across the United States.';
