import './navigation.css';

const navArrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const destinations = [
  { id: 'support', href: '/support', label: 'Find Support' },
  { id: 'give', href: '/give', label: 'Give Support' },
  { id: 'organizations', href: '/organizations', label: 'For Organizations' },
  { id: 'about', href: '/about', label: 'About' },
];

export const brand = '<a class="og-brand" href="/" aria-label="Our Ground home">Our Ground</a>';

export function header(active = ''): string {
  const links = destinations.map(({ id, href, label }) => `<a href="${href}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const account = `<a class="og-account" href="/account"${active === 'account' ? ' aria-current="page"' : ''}>Account<span class="og-account-arrow">${navArrow}</span></a>`;
  return `<a class="og-skip-link" href="#main">Skip to content</a>
    <header class="og-site-header"><div class="og-container og-header-inner">${brand}
      <nav class="og-desktop-nav" aria-label="Main navigation">${links}${account}</nav>
      <details class="og-mobile-menu"><summary>Menu<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></summary><nav aria-label="Main navigation">${links}${account}</nav></details>
    </div></header>`;
}

export function footer(): string {
  return `<footer class="og-footer"><div class="og-container og-footer-inner">${brand}<p>One community. Many ways to help.</p><nav aria-label="Footer navigation"><a href="/support">Find Support</a><a href="/give">Give Support</a><a href="/organizations">For Organizations</a><a href="/about#ai-and-imagery">AI &amp; imagery</a><a href="/privacy">Privacy</a></nav></div></footer>`;
}

/** Native disclosure supplies keyboard behavior without an animation dependency. */
export function initializeSiteNavigation(): void {
  const closeMenus = (restoreFocus = false) => {
    document.querySelectorAll<HTMLDetailsElement>('.og-mobile-menu[open]').forEach((menu) => {
      menu.open = false;
      if (restoreFocus) menu.querySelector<HTMLElement>('summary')?.focus();
    });
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.og-mobile-menu[open]')) {
      closeMenus(true);
      event.preventDefault();
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && !event.target.closest('.og-mobile-menu')) closeMenus();
  });
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && !event.target.closest('.og-mobile-menu')) closeMenus();
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
    if (event.matches) closeMenus();
  });
}
