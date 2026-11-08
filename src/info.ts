import './styles.css';
import './info.css';
import { arrow, element, header } from './ui';
import { footer } from './navigation';
import { photograph, initializePhotographs } from './photography';
import {disposePublicPage,setPublicPageDisposer} from './public-page-lifecycle.ts';

export function mountInfoPage(root:HTMLElement=element('#app')){
disposePublicPage();
const isAbout = window.location.pathname.replace(/\/$/, '') === '/about';
document.title = isAbout ? 'About Our Ground' : 'Page not found — Our Ground';

root.innerHTML = isAbout ? `
  <div class="page-shell">
    ${header('about')}
    <main class="about-main og-container" id="main" tabindex="-1">
      <section class="about-hero" aria-labelledby="aboutTitle">
        <div>
        <span class="page-eyebrow">ABOUT OUR GROUND</span>
        <h1 id="aboutTitle">A clearer path to community support.</h1>
        <div class="about-hero-copy"><p>Finding food or healthcare should begin with information you can understand. Our Ground brings local resources into one place, so people can take their next step with more clarity.</p><a class="search-button" href="/support">Find support ${arrow}</a></div>
        </div>
        <figure class="og-editorial-photo about-lead-photo">${photograph('community-giving', '', true)}</figure>
      </section>
      <section class="about-purpose" aria-labelledby="purposeTitle">
        <div><span class="page-eyebrow">ONE PLATFORM. THREE WAYS TO TAKE PART.</span><h2 id="purposeTitle">We all have a place<br />in a stronger community.</h2><figure class="og-editorial-photo">${photograph('healthcare-support')}</figure></div>
        <div class="about-audiences">
          <article><span class="step-number" aria-hidden="true">01</span><div><h3>For residents</h3><p>Explore food assistance and healthcare resources across the United States. Listings vary by area. Compare practical details and confirm information with the provider before visiting.</p><a class="og-text-link" href="/support">Explore resources ${arrow}</a></div></article>
          <article><span class="step-number" aria-hidden="true">02</span><div><h3>For people who want to give</h3><p>Find organizations and learn where to start. Contribution arrangements happen directly with providers; Our Ground does not process donations.</p><a class="og-text-link" href="/give">Ways to give support ${arrow}</a></div></article>
          <article><span class="step-number" aria-hidden="true">03</span><div><h3>For organizations</h3><p>Representatives can find their public listing and report corrections. Organization onboarding is currently closed.</p><a class="og-text-link" href="/organizations">For organizations ${arrow}</a></div></article>
        </div>
      </section>
      <section class="about-steps" aria-labelledby="howTitle">
        <div class="about-section-heading"><span class="page-eyebrow">A PRACTICAL STARTING POINT</span><h2 id="howTitle">From a question to a next step.</h2></div>
        <div class="about-step-grid">
          <article><h3>Start close to home.</h3><p>Choose a U.S. city and state or five-digit ZIP, then narrow your search by category and distance.</p></article>
          <article><h3>Understand your options.</h3><p>Read the available service, location, hours and eligibility information. Missing or unconfirmed details are identified.</p></article>
          <article><h3>Confirm before you go.</h3><p>For sourced listings, contact the provider to check current details. Report a correction when something needs attention.</p></article>
        </div>
      </section>
      <section class="about-prototype" aria-labelledby="todayTitle">
        <div><span class="page-eyebrow">WHERE THINGS STAND</span><h2 id="todayTitle">Useful information.<br />Honest limits.</h2></div>
        <div><p>You can browse without an account. Listings marked <strong>Fictional demo</strong> are examples, not real providers, and do not offer usable contact or directions.</p><p>Sourced listings are not independently verified. Information can change, and a listing does not confirm current availability or eligibility.</p><a class="og-text-link" href="/support">Explore the directory ${arrow}</a></div>
      </section>
      <section class="about-purpose" id="ai-and-imagery" aria-labelledby="aiTitle" tabindex="-1">
        <div><span class="page-eyebrow">AI &amp; IMAGERY</span><h2 id="aiTitle">How we use AI.</h2></div>
        <div><p>Our editorial photographs are AI-generated illustrations. They depict imagined people, places and community interactions, not actual listed organizations, service locations or documented events.</p><p>The directory uses sourced resource information, with separate labels for fictional examples and unverified information. An illustration is not evidence of a provider’s identity, partnership or services.</p><p>Public Gemini assistance is not enabled. Eden is available only in supervised adult demonstrations. It will not independently verify service availability or determine eligibility. Please confirm important hours, services, costs and requirements directly with the provider.</p></div>
      </section>
    </main>
    ${footer()}
  </div>
` : `<div class="page-shell">${header()}<main class="not-found og-container" id="main" tabindex="-1"><span class="page-eyebrow">404 · PAGE NOT FOUND</span><h1>Let’s find<br />a new starting point.</h1><p>This address may have changed, or the page may no longer be available. You can return home or explore local support.</p><div class="recovery-actions"><a class="search-button" href="/support">Find support ${arrow}</a><a class="secondary-button" href="/">Back to Our Ground</a></div></main>${footer()}</div>`;

initializePhotographs();
// This page mounts after a dynamic import, so the browser's initial fragment
// lookup may precede the disclosure. Preserve direct links and keyboard focus.
if (isAbout && window.location.hash === '#ai-and-imagery') {
  requestAnimationFrame(() => document.getElementById('ai-and-imagery')?.focus());
}
setPublicPageDisposer(()=>{});
}
