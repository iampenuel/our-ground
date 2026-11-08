import './design-tokens.css';
import { initializeSiteNavigation } from './navigation';
import { edenPublicPagePolicy } from './eden/public-page-policy.ts';

const { path, assistant, redirect } = edenPublicPagePolicy(window.location.pathname);
const stillCurrent=()=>edenPublicPagePolicy(window.location.pathname).path===path;
if (redirect) {
  // Preserve old links without introducing a separate Eden product page.
  window.location.replace(redirect);
} else {
  initializeSiteNavigation();
  // Public information pages share the floating agent. Account, staff and
  // authentication workflows never mount the assistant.
  if (path === '/') {
    const hero = document.createElement('link');
    hero.rel = 'preload'; hero.as = 'image'; hero.fetchPriority = 'high';
    hero.href = '/images/our-ground/hero-courtyard-realistic-' + (matchMedia('(max-width: 800px)').matches ? '800' : 'desktop') + '.webp';
    document.head.append(hero);
  }
  if (assistant) void import('./eden/components/assistant').then(({ mountEdenAssistant }) => {
    const localReview = import.meta.env.DEV && import.meta.env.MODE === 'eden-review'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
    mountEdenAssistant({ voiceAllowed: localReview });
  });

  if (path === '/demo') {
    void import('./demo');
  } else if (path === '/') {
    void import('./landing').then(({mountLandingPage})=>{if(stillCurrent())mountLandingPage();});
  } else if (path === '/support') {
    void import('./support');
  } else if (path === '/discover') {
    void import('./discovery');
  } else if (path === '/privacy') {
    void import('./privacy').then(({mountPrivacyPage})=>{if(stillCurrent())mountPrivacyPage();});
  } else if (path === '/account/administration') {
    void import('./organization-admin');
  } else if (path === '/account' || path === '/auth/callback') {
    void import('./account');
  } else if (path === '/give' || path === '/organizations') {
    void import('./participate').then(({mountParticipationPage})=>{if(stillCurrent())mountParticipationPage();});
  } else if (path.startsWith('/staff/services/')) {
    void import('./staff');
  } else if (path.startsWith('/resources/')) {
    void import('./resource-detail');
  } else {
    void import('./info').then(({mountInfoPage})=>{if(stillCurrent())mountInfoPage();});
  }
}

export {};
