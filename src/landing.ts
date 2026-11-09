import './landing.css';
import { arrow, element } from './ui';
import { header, footer } from './navigation';
import { photograph, initializePhotographs } from './photography';
import {disposePublicPage,setPublicPageDisposer} from './public-page-lifecycle.ts';

export function mountLandingPage(root:HTMLElement=element('#app')){
disposePublicPage();
document.title = 'Our Ground — Stronger communities grow here.';

root.innerHTML = `
  <div class="og-home">${header()}
    <main id="main" tabindex="-1">
      <section class="og-home-hero" aria-labelledby="home-title">
        ${photograph('hero-courtyard-realistic-desktop', 'og-hero-photo', true)}
        <div class="og-container og-hero-body">
          <h1 class="og-display" id="home-title">Stronger<br>communities<br>grow here.</h1>
          <p class="og-hero-description">Connecting people with local food, healthcare, and essential support — and the people and organizations who make it possible.</p>
          <div class="og-hero-actions"><a class="og-button og-button--light" href="/support">Find support near you ${arrow}</a><a class="og-button og-button--outline" href="/give">Give support ${arrow}</a></div>
        </div>
        <div class="og-container og-hero-values" role="group" aria-label="Our purpose">
          <div><span>People</span><p>Real help.<br>Real neighbors.</p></div>
          <div><span>Places</span><p>Stronger<br>communities.</p></div>
          <div><span>Possibilities</span><p>A healthier,<br> more connected tomorrow.</p></div>
        </div>
      </section>
    </main>
    ${footer()}
  </div>`;

// Keep the desktop hero below the actual header, including its border and
// any height changes from responsive navigation or enlarged text.
const home = element<HTMLDivElement>('.og-home');
const siteHeader = element<HTMLElement>('.og-home .og-site-header');
const syncHeaderHeight = () => {
  home.style.setProperty('--og-home-header-height', `${siteHeader.getBoundingClientRect().height}px`);
};
syncHeaderHeight();
const observer=new ResizeObserver(syncHeaderHeight);observer.observe(siteHeader);setPublicPageDisposer(()=>observer.disconnect());

initializePhotographs();
}
