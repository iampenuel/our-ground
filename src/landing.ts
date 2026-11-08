import './landing.css';
import { arrow, element } from './ui';
import { header, footer } from './navigation';
import { photograph, initializePhotographs } from './photography';
import {disposePublicPage,setPublicPageDisposer} from './public-page-lifecycle.ts';

export function mountLandingPage(root:HTMLElement=element('#app')){
disposePublicPage();
document.title = 'Our Ground — Stronger communities grow here.';

const pathways = [
  { href: '/support', title: 'Find<br>Support', description: 'Explore food, healthcare and community support near you.', photo: 'flowers-search' as const, className: 'og-pathway--find' },
  { href: '/give', title: 'Give<br>Support', description: 'Find a starting point for giving in your community.', photo: 'food-support' as const, className: 'og-pathway--give' },
  { href: '/organizations', title: 'For<br>Organizations', description: 'Find your listing and see the source of its information.', photo: 'landscape-story' as const, className: 'og-pathway--organizations' },
];

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
      <section class="og-community og-container" aria-labelledby="community-title">
        <div class="og-community-intro">
          <div><p class="og-eyebrow">A more connected tomorrow</p><h2 class="og-display" id="community-title">Support looks<br>different everywhere.<br>It belongs everywhere.</h2></div>
          <div class="og-community-copy"><p>Our Ground brings residents, donors, and community organizations to a shared starting point. Explore local food and healthcare information, find ways to contribute, and help keep community resources in view.</p><a class="og-text-link" href="/about">Learn more about our mission ${arrow}</a></div>
        </div>
        <div class="og-pathways">${pathways.map((path) => `<a class="og-pathway ${path.className}" href="${path.href}">${photograph(path.photo)}<div class="og-pathway-copy"><h3 class="og-display">${path.title}</h3><p>${path.description}</p></div><span class="og-pathway-arrow" aria-hidden="true">${arrow}</span></a>`).join('')}</div>
        <div class="og-community-principle"><p class="og-display">A stronger, healthier community isn’t just possible —<br>it’s something we build together.</p><span aria-hidden="true"></span></div>
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
