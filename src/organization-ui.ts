import { escapeHtml as esc } from './ui';
import type { ListingRevision, OrganizationClaim, OrganizationListing } from '../shared/organization-accounts';

export const dateLabel = (value: string | null | undefined) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not recorded';
};
export function safeLink(value: string | null | undefined, label: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  } catch { return ''; }
}
export function reviewBadge(status: string) {
  const label = status === 'pending' ? 'Pending review' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Review status unavailable';
  return `<span class="review-badge" data-review="${esc(status)}">${label}</span>`;
}
export function claimCards(claims: OrganizationClaim[]) {
  if (!claims.length) return '<div class="account-empty"><h3>No requests yet.</h3><p>Request access to your organization below. An administrator reviews every request before assigning access.</p></div>';
  return claims.map(claim => `<article class="account-request" data-claim-id="${esc(claim.id)}"><div class="account-request-heading"><h3>${esc(claim.organization_name)}</h3>${reviewBadge(claim.status)}</div><p>${esc(claim.location)}</p><p class="account-record-meta">Requested ${dateLabel(claim.created_at)} · ${esc(claim.applicant_role)}</p>${claim.review_note ? `<p class="review-note"><strong>Reviewer’s note</strong><br>${esc(claim.review_note)}</p>` : ''}${claim.reviewed_at ? `<p class="account-record-meta">Reviewed ${dateLabel(claim.reviewed_at)}</p>` : ''}${claim.status === 'approved' && claim.access_active === false ? '<p class="account-status" data-state="warning">Access is no longer active. Contact the reviewing administrator before submitting another request.</p>' : ''}</article>`).join('');
}
export function listingCards(listings: OrganizationListing[]) {
  if (!listings.length) return '<div class="account-empty"><h3>Your listings will appear here.</h3><p>Approved access applies to the specific organization and location reviewed by an administrator. A pending request does not grant editing permission.</p></div>';
  return listings.map(listing => `<a class="account-record account-request" href="/staff/services/${encodeURIComponent(listing.id)}"><div><h3>${esc(listing.organization_name)}</h3><p>${esc(listing.site_name || listing.title)} · ${esc(listing.city)}, ${esc(listing.state)}</p><span class="account-record-meta">${esc(listing.title)} · ${esc(listing.status)} · Version ${listing.version}</span></div><span class="account-record-action">Open listing <span aria-hidden="true">↗</span></span></a>`).join('');
}
export function revisionCards(revisions: ListingRevision[], listings: OrganizationListing[] = []) {
  if (!revisions.length) return '<p class="account-status">No proposed updates yet.</p>';
  return revisions.map(revision => {
    const listing = listings.find(item => item.id === revision.service_id);
    return `<article class="account-request" data-revision-id="${esc(revision.id)}"><div class="account-request-heading"><h3>${esc(listing?.title || 'Listing update')}</h3>${reviewBadge(revision.status)}</div><p class="account-record-meta">Submitted ${dateLabel(revision.created_at)} · ${Object.keys(revision.patch).length} proposed field${Object.keys(revision.patch).length === 1 ? '' : 's'}</p>${revision.review_note ? `<p class="review-note"><strong>Reviewer’s note</strong><br>${esc(revision.review_note)}</p>` : ''}${revision.reviewed_at ? `<p class="account-record-meta">Reviewed ${dateLabel(revision.reviewed_at)}</p>` : ''}</article>`;
  }).join('');
}
export const listingLabels: Record<string, string> = {
  title: 'Service title', summary: 'Summary', description: 'Service description', eligibility_text: 'Eligibility',
  cost_summary: 'Cost information', appointment_note: 'Appointments', contact_phone: 'Service phone',
  contact_url: 'Service website', organization_description: 'Organization description', website_url: 'Organization website',
  public_phone: 'Organization phone', site_name: 'Location name', street_address: 'Street address', city: 'City',
  state: 'State', postal_code: 'ZIP code', latitude: 'Latitude', longitude: 'Longitude', category_slugs: 'Service categories', hours: 'Hours'
};
export function proposedValue(key: string, value: unknown) {
  if (value === null || value === '') return 'Not provided';
  if (key === 'hours' && Array.isArray(value)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return value.length ? value.map(row => `${days[row.weekday] ?? 'Day'} ${String(row.opens_at).slice(0, 5)}–${String(row.closes_at).slice(0, 5)}${row.notes ? ' · ' + row.notes : ''}`).join('\n') : 'Hours not provided';
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
}
