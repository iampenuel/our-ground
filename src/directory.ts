import type { SearchCategory, ResourceDetail } from '../shared/contracts';
export const directoryCategories: Array<{ id: SearchCategory; label: string }> = [{ id:'all',label:'All' }, { id:'food',label:'Food' }, { id:'healthcare',label:'Healthcare' }, { id:'community',label:'Community Support' }];
export function categoryName(value: string) { return directoryCategories.find((c) => c.id === value)?.label ?? 'Support'; }
export function directoryCategory(value: string | null): SearchCategory { return value === 'food' || value === 'healthcare' || value === 'community' ? value : 'all'; }
export function searchUrl(category: SearchCategory, location: string, radius: number, keyword = '', page = 1, view = 'list') {
  const p = new URLSearchParams();
  if (location.trim()) p.set('location', location.trim());
  if (category !== 'all') p.set('category', category);
  p.set('radius_miles', String(radius));
  if (keyword.trim()) p.set('q', keyword.trim());
  if (page > 1) p.set('page', String(page));
  p.set('view', view);
  return '/support?' + p;
}
export function safeWebUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function safeReturnPath(value: string | null) {
  try { const url = new URL(value ?? '/support', 'https://our-ground.invalid'); return url.origin === 'https://our-ground.invalid' && url.pathname === '/support' ? url.pathname + url.search : '/support'; } catch { return '/support'; }
}
export function contactActions(resource: ResourceDetail) {
  if (resource.data_kind === 'fictional_demo') return { phone: null, website: null, directions: null };
  const phone = resource.contact.phone;
  return { phone: phone && /^\+?[\d().\s-]{7,30}$/.test(phone) ? 'tel:' + phone.replace(/[^\d+]/g, '') : null, website: safeWebUrl(resource.contact.website_url), directions: safeWebUrl(resource.contact.directions_url) };
}
