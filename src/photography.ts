import './photography.css';

const assets = {
  'account-community-approved': [1672, 941],
  'hero-courtyard-realistic-desktop': [1672, 941],
  'hero-courtyard-approved-desktop': [1672, 941],
  'hero-family-desktop': [1672, 941],
  'flowers-search': [1920, 640],
  'landscape-story': [1912, 797],
  'food-support': [1200, 800],
  'community-giving': [1200, 800],
  'healthcare-support': [1200, 800],
  'community-health-outreach-editorial': [1536, 1024],
  'community-resource-exterior-editorial': [2048, 1377],
} as const;

// These are decorative, synthetic illustrations, never provider photographs.
export function photograph(name: keyof typeof assets, className = '', eager = false) {
  const [width, height] = assets[name];
  const refreshedHero = name === 'hero-courtyard-realistic-desktop';
  const courtyard = name === 'hero-courtyard-approved-desktop';
  const family = name === 'hero-family-desktop';
  const responsive = name === 'account-community-approved' || name === 'community-health-outreach-editorial' || name === 'community-resource-exterior-editorial';
  const source = `/images/our-ground/${name}`;
  return `<div class="og-photograph ${className}" data-photograph>
    <picture>${refreshedHero ? '<source media="(max-width: 800px)" srcset="/images/our-ground/hero-courtyard-realistic-800.webp" width="800" height="450">' : ''}${courtyard ? '<source media="(max-width: 900px)" srcset="/images/our-ground/hero-courtyard-approved-mobile.webp" width="960" height="720">' : ''}${family ? '<source media="(max-width: 900px)" srcset="/images/our-ground/hero-family-mobile.webp" width="768" height="1365">' : ''}<img src="${source}${responsive ? '-1200' : ''}.webp"${courtyard ? ' srcset="/images/our-ground/hero-courtyard-approved-1200.webp 1200w, /images/our-ground/hero-courtyard-approved-desktop.webp 1672w" sizes="(max-width: 1672px) 100vw, 1672px"' : ''}${responsive ? ` srcset="${source}-780.webp 780w, ${source}-1200.webp 1200w, ${source}.webp ${width}w" sizes="(max-width: 900px) 91vw, 36rem"` : ''} width="${width}" height="${height}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${family || courtyard || refreshedHero ? ' fetchpriority="high"' : ''}></picture>
    <span class="og-photo-unavailable" hidden>Image unavailable</span>
  </div>`;
}

export function initializePhotographs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-photograph]').forEach((frame) => {
    const image = frame.querySelector('img')!;
    const fallback = frame.querySelector<HTMLElement>('.og-photo-unavailable')!;
    const update = () => {
      const failed = image.complete && image.naturalWidth === 0;
      frame.dataset.photoState = failed ? 'error' : 'ready';
      fallback.hidden = !failed;
    };
    image.addEventListener('load', update);
    image.addEventListener('error', update);
    if (image.complete) update();
  });
}
