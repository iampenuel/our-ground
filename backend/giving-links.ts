import type { ReviewedGiving } from '../shared/place-evidence.ts';
import { sourceWebsite } from '../shared/place-evidence.ts';
import { placeText } from '../shared/us-location.ts';
import type { USStateCode } from '../shared/us-location.ts';

type Binding = {
  source: 'geoapify' | 'directory';
  id: string;
  name: string;
  street: string;
  city: string;
  state: USStateCode;
  postcode: string;
  website: string | null;
};
interface Review extends ReviewedGiving {
  organization: string;
  location_source: string;
  binding: Binding | null;
  status_evidence: string | null;
  notes: string;
}

const reviews: readonly Review[] = [
  {
    organization: 'Mazzoni Center — Washington West',
    binding: {
      source: 'geoapify',
      id: '51a439b2f24bca52c059350c1f1153f94340f00103f9011c6e3c940200000092030e4d617a7a6f6e692043656e746572',
      name: 'Mazzoni Center', street: '1201 Locust Street', city: 'Philadelphia', state: 'PA', postcode: '19107',
      website: 'https://www.mazzonicenter.org/'
    },
    official_website: 'https://www.mazzonicenter.org/',
    donation_url: 'https://www.mazzonicenter.org/donate-mazzoni-center',
    source_url: 'https://www.mazzonicenter.org/',
    location_source: 'https://www.mazzonicenter.org/sexual-health/washington-west',
    checked_on: '2026-11-04', status_evidence: null,
    notes: 'Require the official Washington West address including ZIP 19107. The archived Locust Street record lists 19103 and the separate 1334 Bainbridge record conflicts with the published street number. Neither may inherit the donation link.'
  },
  {
    organization: 'Saint John’s Hospice — 1221 Race Street, Philadelphia, PA',
    binding: {
      source: 'geoapify',
      id: '518ccf64ff3cca52c0597558ff1e61fa4340f00103f9015da85da40000000092031253742e204a6f686e277320486f7370696365',
      name: "St. John's Hospice", street: '1221 Race Street', city: 'Philadelphia', state: 'PA', postcode: '19107',
      website: 'https://saintjohnshospice.org/'
    },
    official_website: 'https://saintjohnshospice.org/',
    donation_url: 'https://saintjohnshospice.org/donate/',
    source_url: 'https://saintjohnshospice.org/',
    location_source: 'https://saintjohnshospice.org/contact/',
    checked_on: '2026-11-04', status_evidence: null,
    notes: 'Use the organization’s own giving page. An exact mapped ID and matching street and domain are required.'
  }
];

function hostname(value: string | null) {
  const url = sourceWebsite(value);
  return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : null;
}
function streetKey(value: string) {
  return placeText(value).replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd');
}

export function reviewedGivingFor(record: Binding): ReviewedGiving | undefined {
  const review = reviews.find(({binding}) => binding?.source === record.source && binding.id === record.id);
  const match = review?.binding;
  if (!review || !match || !record.website || hostname(record.website) !== hostname(match.website)) return;
  if (record.state !== match.state || record.postcode !== match.postcode || placeText(record.name) !== placeText(match.name)
    || placeText(record.city) !== placeText(match.city) || streetKey(record.street) !== streetKey(match.street)) return;
  const {official_website, donation_url, source_url, checked_on} = review;
  if (!sourceWebsite(official_website) || hostname(source_url) !== hostname(official_website)) return;
  if (donation_url && (!sourceWebsite(donation_url) || !donation_url.startsWith('https://'))) return;
  return {official_website, donation_url, source_url, checked_on};
}
