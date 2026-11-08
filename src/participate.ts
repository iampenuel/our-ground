import './landing.css';
import { arrow, element } from './ui';
import { footer, header } from './navigation';
import { photograph, initializePhotographs } from './photography';
import {disposePublicPage,setPublicPageDisposer} from './public-page-lifecycle.ts';

export function mountParticipationPage(root:HTMLElement=element('#app')){
disposePublicPage();
const organizations = window.location.pathname.replace(/\/$/, '') === '/organizations';
document.title = organizations ? 'For Organizations — Our Ground' : 'Give Support — Our Ground';

const content = organizations ? `
  <section class="og-entry-intro og-entry-intro--organizations" aria-labelledby="entry-title"><div><p class="og-eyebrow">For organizations</p><h1 class="og-display" id="entry-title">Local knowledge.<br>A shared starting point.</h1><p class="og-entry-lead">Check how your organization appears in the directory. Each listing links to its source and includes a way to report information that needs review.</p><div class="og-entry-actions"><a class="og-button og-button--dark" href="/support">Find your public listing ${arrow}</a></div><p class="og-entry-note">New organization accounts and editing access are currently closed.</p></div><figure class="og-editorial-photo">${photograph('community-resource-exterior-editorial', '', true)}</figure></section>
  <div class="og-entry-sections"><section><h2 class="og-display">Update listing information.</h2><p>Open a listing and choose Report a correction. Include the relevant public information and its source. Leave out personal information about people using your services.</p><a class="og-text-link" href="/support">Explore the directory ${arrow}</a></section></div>
` : `
  <section class="og-entry-intro og-entry-intro--give" aria-labelledby="entry-title"><div><p class="og-eyebrow">Give support</p><h1 class="og-display" id="entry-title">A stronger community<br>starts with connection.</h1><p class="og-entry-lead">Looking to give food, time, or financial support? Start by exploring local food, healthcare and community support providers, then confirm their identity and current needs directly.</p><div class="og-entry-actions"><a class="og-button og-button--dark" href="/support?intent=give">Explore local providers ${arrow}</a><a class="og-button og-button--paper" href="/about">About Our Ground ${arrow}</a></div><p class="og-entry-note">Our Ground does not process donations, book volunteer opportunities, or verify organizations. The directory is a starting point for your own checks. Fictional demo listings do not represent real providers and cannot receive support.</p></div><figure class="og-editorial-photo">${photograph('community-health-outreach-editorial', '', true)}</figure></section>
  <div class="og-entry-sections og-entry-sections--give"><section><h2 class="og-display">Find a starting point.</h2><ol><li>Search a U.S. city and state or five-digit ZIP for food, healthcare or community support resources.</li><li>Read the listing’s source information and contact details. A sourced listing is not an endorsement.</li><li>Confirm the organization’s identity, official website, and current needs before deciding how to contribute.</li></ol></section><section><h2 class="og-display">Give with context.</h2><p>Contact a provider through its official channels to ask what is useful now. Donations take place on the organization’s website or its authorized provider’s site. Our Ground does not collect card details, receive funds, issue receipts, process refunds, or guarantee tax deductibility.</p><a class="og-text-link" href="/support?intent=give">Find resource information ${arrow}</a></section></div>
`;

root.innerHTML = `<div class="og-entry">${header(organizations ? 'organizations' : 'give')}<main class="og-container og-entry-main" id="main" tabindex="-1">${content}</main>${footer()}</div>`;

initializePhotographs();
setPublicPageDisposer(()=>{});
}
