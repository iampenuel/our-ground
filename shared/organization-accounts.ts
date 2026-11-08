export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type OrganizationClaim = {
  id: string; user_id: string; organization_name: string; website_url: string | null;
  location: string; applicant_role: string; contact_email: string; contact_phone: string | null;
  explanation: string | null; status: ReviewStatus; created_at: string;
  reviewed_at: string | null; reviewer_id: string | null; review_note: string | null;
  service_id?: string | null; organization_id?: string | null; access_active?: boolean; evidence_url?: string | null;
};
export type ListingHours = { weekday: number; opens_at: string; closes_at: string; notes: string | null };
export type ListingPatch = Partial<{
  title: string; summary: string; description: string; eligibility_text: string | null;
  cost_summary: string | null; appointment_note: string | null; contact_phone: string | null;
  contact_url: string | null; organization_description: string; website_url: string | null;
  public_phone: string | null; site_name: string; street_address: string | null; city: string;
  state: string; postal_code: string | null; latitude: number; longitude: number;
  category_slugs: Array<'food' | 'healthcare'>; hours: ListingHours[];
}>;
export type OrganizationListing = Required<ListingPatch> & {
  id: string; organization_id: string; location_id: string; organization_name: string;
  status: 'draft' | 'published' | 'hidden'; source_url: string | null; source_recorded_at: string | null;
  updated_at?: string | null; version: number; organization_version: number; location_version: number;
  is_demo: boolean;
};
export type ListingRevision = {
  id: string; user_id: string; service_id: string; organization_id: string;
  patch: ListingPatch; status: ReviewStatus; created_at: string; reviewed_at: string | null;
  reviewer_id: string | null; review_note: string | null;
  before_snapshot?: OrganizationListing; current?: OrganizationListing; expected_version?: number; expected_organization_version?: number; expected_location_version?: number;
};
export type OrganizationMembership = {
  user_id: string; organization_id: string; organization_name?: string; service_id?: string;
  service_ids?: string[]; granted_at?: string; granted_by?: string; name?: string;
};
export type AccountAudit = { id: number; actor_id: string; action: string; target_id?: string; request_id?:string; result?:string; organization_id?:string; created_at: string };
export type OrganizationAccount = {
  id: string; role: 'user' | 'admin'; email?: string;
  organizations: Array<{ id: string; name: string; role: 'editor' }>;
  claims: OrganizationClaim[]; listings: OrganizationListing[]; revisions: ListingRevision[];
};
export type OrganizationAdministration = {
  claims: OrganizationClaim[]; revisions: ListingRevision[]; listings: OrganizationListing[];
  memberships: OrganizationMembership[]; audit: AccountAudit[];
  suspended_users?:Array<{id:string;account_status:string}>;suspended_organizations?:Array<{id:string;name:string}>;
};
