import { categories, categoryLabel, cityForResource, supportUrl, type Category, type Resource, type ResourceCategory } from './resources';
export { brand, header } from './navigation';

export const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-7 7 7-7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const pinIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" stroke-width="1.6"/></svg>';
export const searchIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
export const icons: Record<ResourceCategory | 'pantry', string> = {
  food: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 5v8a4 4 0 0 0 8 0V5M10 5v22M25 27V5c-4 2-6 6-6 12h6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  healthcare: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z" fill="currentColor"/></svg>',
  transportation: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5" y="4" width="22" height="23" rx="4" stroke="currentColor" stroke-width="2.5"/><path d="M6 17h20M9 27v2m14-2v2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="10" cy="22" r="1.5" fill="currentColor"/><circle cx="22" cy="22" r="1.5" fill="currentColor"/></svg>',
  pantry: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28 5 17C-3 8 9-2 16 7c7-9 19 1 11 10z" fill="currentColor"/></svg>',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

export function filterChips(active: Category, className = ''): string {
  return `<div class="category-filters ${className}" role="group" aria-label="Filter resources by type of support">${categories.map((category) => `<button type="button" data-category="${category.id}" aria-pressed="${category.id === active}">${category.id !== 'all' ? `<span class="category-dot category-dot--${category.id}" aria-hidden="true"></span>` : ''}${category.label}</button>`).join('')}</div>`;
}

export function resourceLink(resource: Resource, returnPath = '/support'): string {
  return `/resources/${resource.id}?return=${encodeURIComponent(returnPath)}`;
}

export function resourcePreview(resource: Resource): string {
  const city = cityForResource(resource);
  return `<span class="detail-icon${resource.category === 'healthcare' ? ' detail-icon--blue' : ''}">${icons[resource.landing === 'pantry' ? 'pantry' : resource.category]}</span><span class="dialog-eyebrow">${city.name}, ${city.state}</span><h2 id="dialogTitle">${resource.title}</h2><p>${resource.description}</p><a class="get-started form-submit" href="${escapeHtml(resourceLink(resource, supportUrl(resource.category, city.name)))}"><span>View resource details</span>${arrow}</a><a class="demo-link" href="${escapeHtml(supportUrl(resource.category, city.name))}">Find ${categoryLabel(resource.category).toLowerCase()} support ${arrow}</a><p class="prototype-note">Example listing · Not a verified service.</p>`;
}

export function createDialog(): { open: (content: string) => void } {
  const dialog = element<HTMLDialogElement>('#accessDialog');
  const close = (): void => dialog.close();
  element<HTMLButtonElement>('#dialogClose').addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) document.body.classList.remove('dialog-is-open');
  });
  return { open(content) {
    if (dialog.open) dialog.close();
    element<HTMLElement>('#dialogBody').innerHTML = content;
    dialog.showModal();
    document.body.classList.add('dialog-is-open');
  } };
}

export const dialogMarkup = `<dialog class="access-dialog" id="accessDialog" aria-labelledby="dialogTitle"><button class="dialog-close" id="dialogClose" type="button" aria-label="Close dialog"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button><div id="dialogBody"></div></dialog>`;
