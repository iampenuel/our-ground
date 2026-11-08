import './landing.css';
import { arrow, element } from './ui';
import { footer, header } from './navigation';
import { photograph, initializePhotographs } from './photography';
import { disposePublicPage, setPublicPageDisposer } from './public-page-lifecycle.ts';

const opportunities = [
  {
    title: 'Volunteer your time.',
    description: 'Find a food bank near you, then check its calendar for shifts and registration.',
    label: 'Find volunteer opportunities',
    href: 'https://www.feedingamerica.org/take-action/volunteer',
  },
  {
    title: 'Give food.',
    description: 'Ask a local food bank which items it can accept and where to bring them.',
    label: 'Plan a food donation',
    href: 'https://www.feedingamerica.org/ways-to-give/food-donations',
  },
  {
    title: 'Give money.',
    description: 'Explore ways to contribute directly through Feeding America’s official website.',
    label: 'Explore financial gifts',
    href: 'https://www.feedingamerica.org/ways-to-give',
  },
];

function givePage() {
  return `
    <section class="og-entry-intro og-entry-intro--give" aria-labelledby="entry-title">
      <div><p class="og-eyebrow">Give support</p>
        <h1 class="og-display" id="entry-title">Put your generosity<br>to work.</h1>
        <p class="og-entry-lead">Give time, food, or money to support people in your community. Start with a food bank and arrange your contribution directly with the organization.</p>
        <div class="og-entry-actions"><a class="og-button og-button--dark" href="#ways-to-give">Explore ways to give ${arrow}</a></div>
      </div><figure class="og-editorial-photo">${photograph('community-health-outreach-editorial', '', true)}</figure>
    </section>
    <section class="og-giving" aria-labelledby="ways-to-give">
      <h2 class="og-display" id="ways-to-give" tabindex="-1">Choose how to give.</h2>
      <p>These links open Feeding America’s official site. Our Ground does not handle payments or volunteer registrations.</p>
      <div class="og-giving-paths">${opportunities.map(item => `
        <article><h3 class="og-display">${item.title}</h3><p>${item.description}</p>
          <a class="og-text-link" href="${item.href}" rel="external noreferrer">${item.label} ${arrow}</a></article>`).join('')}</div>
    </section>`;
}

function organizationPage() {
  return `
    <section class="og-entry-intro og-entry-intro--organizations" aria-labelledby="entry-title">
      <div><p class="og-eyebrow">For organizations</p>
        <h1 class="og-display" id="entry-title">Care for your<br>public listing.</h1>
        <p class="og-entry-lead">Help residents find your services and know what to expect. Sign in to see your assigned listings, propose changes, or check an access request.</p>
        <div class="og-entry-actions"><a class="og-button og-button--dark" href="/account#accessTitle">Organization sign in ${arrow}</a>
          <a class="og-button og-button--paper" href="#organization-access">Request access ${arrow}</a></div>
      </div><figure class="og-editorial-photo">${photograph('community-resource-exterior-editorial', '', true)}</figure>
    </section>
    <div class="og-entry-sections">
      <section aria-labelledby="organization-access"><h2 class="og-display" id="organization-access" tabindex="-1">Request listing access.</h2>
        <p>Sign in and tell us which organization and location you represent. An administrator reviews the request. Once approved, you can propose updates to that listing and follow their review in your account.</p>
        <a class="og-text-link" href="/account?intent=request#accessTitle">Start an access request ${arrow}</a></section>
      <section aria-labelledby="listing-corrections"><h2 class="og-display" id="listing-corrections" tabindex="-1">Check a public listing.</h2>
        <p>Find your organization’s listing, review its source, and use the correction option when available. You can check public information without an account.</p>
        <a class="og-text-link" href="/support">Find your public listing ${arrow}</a></section>
    </div>`;
}

export function mountParticipationPage(root: HTMLElement = element('#app')) {
  disposePublicPage();
  const organizations = window.location.pathname.replace(/\/$/, '') === '/organizations';
  document.title = organizations ? 'For Organizations — Our Ground' : 'Give Support — Our Ground';
  root.innerHTML = `<div class="og-entry">${header(organizations ? 'organizations' : 'give')}
    <main class="og-container og-entry-main" id="main" tabindex="-1">${organizations ? organizationPage() : givePage()}</main>${footer()}</div>`;
  initializePhotographs();
  setPublicPageDisposer(() => {});
}
