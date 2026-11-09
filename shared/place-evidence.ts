/** Reviewed links originate in the server's editorial collection. */
export interface ReviewedGiving {
  official_website: string;
  donation_url: string | null;
  source_url: string;
  checked_on: string;
}
/** Category membership is search evidence, never verification of current services. */
export function hasMappedCategory(categories: string[], category: string) {
  return categories.some(value => value === category || value.startsWith(category + '.'));
}
export function mappedCategoryLabel(categories: string[]) {
  const food = hasMappedCategory(categories, 'service.social_facility.food');
  const sharing = hasMappedCategory(categories, 'amenity.give_box.food');
  if (sharing && !food) return 'Mapped category: community food-sharing box';
  const healthcare = hasMappedCategory(categories, 'healthcare');
  if (food && healthcare) return 'Mapped categories: food-related support & healthcare';
  if (food) return 'Mapped category: food-related support';
  if (hasMappedCategory(categories, 'healthcare.clinic_or_praxis.general')) return 'Mapped category: general medical practice';
  if (hasMappedCategory(categories, 'healthcare.clinic_or_praxis')) return 'Mapped category: clinic / medical practice';
  return 'Mapped location · category unconfirmed';
}
/** Only explicit, well-formed contacts from the source can become browser actions. */
export function sourceWebsite(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function sourcePhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[\d(). -]{7,30}$/.test(value.trim())) return null;
  const number = value.trim().replace(/[^\d+]/g, '');
  return /^\+?\d{7,15}$/.test(number) ? number : null;
}
export function coordinateDirections(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return 'https://www.google.com/maps/dir/?' + new URLSearchParams({api: '1', destination: latitude + ',' + longitude});
}
