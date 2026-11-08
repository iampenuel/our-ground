import type { USStateCode } from './us-location.ts';

/** Google discovery is transient provider content, never a directory Resource. */
export const discoveryTerms = {
  food_pantry: { label: 'Food pantry', category: 'food' },
  food_bank: { label: 'Food bank', category: 'food' },
  food_assistance: { label: 'Community food assistance', category: 'food' },
  community_health: { label: 'Community health center', category: 'healthcare' },
  medical_clinic: { label: 'Medical clinic', category: 'healthcare' },
  free_clinic: { label: 'Free clinic', category: 'healthcare' }
} as const;
export type DiscoveryTerm = keyof typeof discoveryTerms;
export type DiscoveryCategory = 'food' | 'healthcare';
export type DiscoveryLocation = { place_id: string; label: string; latitude: number; longitude: number; state: USStateCode };
export type ProviderAttribution = { name: string; url: string | null };
export type DiscoveredPlace = {
  place_id: string;
  data_kind: 'google_discovered';
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: DiscoveryCategory;
  distance_miles: number | null;
  maps_url: string | null;
  directions_url: string;
  attributions: ProviderAttribution[];
};
export type DiscoveryDetail = DiscoveredPlace & { website_url: string | null; phone: string | null };
export type DiscoverySearch =
  | { status: 'choose_location'; choices: DiscoveryLocation[] }
  | { status: 'results'; location: DiscoveryLocation; items: DiscoveredPlace[]; term: DiscoveryTerm; radius_miles: number };
export type DiscoveryStatus = { enabled: boolean; terms_url: string | null; privacy_url: string | null };
export type DiscoveryInput = { query: string; term: DiscoveryTerm; radiusMiles: number; locationId?: string };
