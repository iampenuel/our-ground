import type { LocationQuality } from './location-search.ts';
import type { USResourceStateCode } from './resource-geography.ts';
import type { ReviewedGiving } from './place-evidence.ts';
export type ServiceCategory = 'food' | 'healthcare' | 'community';
export type ServiceStatus = 'draft' | 'published' | 'hidden';
export type SearchCategory = ServiceCategory | 'all';
export interface Place { label: string; city: string; state: USResourceStateCode; latitude: number; longitude: number; quality?:LocationQuality; publicQuery?:string }
export interface ResourceProvenance {
  source_id: string; source_name: string; source_record_id: string; source_url: string;
  imported_at: string; source_updated_at: string; last_seen_at: string;
  license_name?: string | null; license_url?: string | null; attribution?: string | null;
  verification_status: 'imported_unverified' | 'stale_or_needs_review';
}
export interface ResourceCard {
  id: string; title: string; summary: string; category_slugs: ServiceCategory[];
  organization: { id: string; name: string };
  location: { city: string; state: USResourceStateCode; address_label: string; latitude: number; longitude: number };
  contact?: { website_url: string | null; phone: string | null };
  reviewed_giving?: ReviewedGiving;
  provenance?: ResourceProvenance;
  detail_level?: 'basic' | 'substantive';
  distance_miles: number; data_kind: 'fictional_demo' | 'sourced_unverified' | 'imported_unverified'; source_recorded_at: string | null;
}
export interface ResourceDetail extends Omit<ResourceCard, 'distance_miles'> {
  description: string; eligibility_text: string | null; cost_summary: string | null;
  hours: Array<{ weekday: number; opens_at: string; closes_at: string; notes: string | null }>;
  contact: { phone: string | null; website_url: string | null; directions_url: string | null };
  source: { url: string | null; recorded_at: string | null };
}
export interface Collection<T> { items: T[]; page: number; page_size: number; total: number; has_next: boolean }
export interface SearchResults extends Collection<ResourceCard> { search_center: { latitude: number; longitude: number } }
export interface CurrentAccount {
  id: string; role: 'user' | 'admin'; organizations: Array<{ id: string; name: string; role: 'editor' }>;
}
export interface EditableService {
  id: string; organization_id: string; location_id: string; title: string; summary: string;
  eligibility_text: string | null; cost_summary: string | null; status: ServiceStatus; version: number; updated_at: string;
}
export type ServiceUpdate = Pick<EditableService, 'title' | 'summary' | 'eligibility_text' | 'cost_summary' | 'status'>;
