import type { USStateCode } from './us-location.ts';
import type { ReviewedGiving } from './place-evidence.ts';
/** Transient open-map discovery; never a directory resource or staff-edit identity. */
export const geoapifyTerms = {
  food_assistance: { label: 'Food assistance', category: 'food', key: 'service.social_facility.food,amenity.give_box.food' },
  medical_clinic: { label: 'Clinics and medical practices', category: 'healthcare', key: 'healthcare.clinic_or_praxis' },
  general_practice: { label: 'General medical practices', category: 'healthcare', key: 'healthcare.clinic_or_praxis.general' }
} as const;
export type GeoTerm = keyof typeof geoapifyTerms;
export type GeoCategory = 'food' | 'healthcare';
export type GeoAttribution = { name: string; url: string | null };
export type GeoLocation = { place_id: string; label: string; latitude: number; longitude: number; state?: USStateCode; attributions: GeoAttribution[] };
export type GeoPlace = {
  place_id: string; data_kind: 'geoapify_discovered'; name: string; address: string;
  latitude: number; longitude: number; category: GeoCategory; categories: string[];
  distance_miles: number; directions_url: string; attributions: GeoAttribution[];
  // Optional fields from the existing Places response; never fetched from a details API.
  state: USStateCode; website_url?: string | null; phone?: string | null;
  // External source feedback only; never an Our Ground correction-report identity.
  source_feedback_url?: string;
  reviewed_giving?: ReviewedGiving;
};
export type GeoSearch = { status: 'choose_location'; choices: GeoLocation[] } | {
  status: 'results'; location: GeoLocation; items: GeoPlace[]; term: GeoTerm; radius_miles: number;
};
export const geoapifyFeedbackUrl = 'https://www.geoapify.com/about-us/';
export type GeoStatus = { enabled: boolean; provider: 'geoapify' };
export type GeoInput = { query: string; term: GeoTerm; radiusMiles: number; locationId?: string; center?:{label:string;latitude:number;longitude:number;state?:USStateCode;source?:'provider'|'device'|'map'|'reference'} };
