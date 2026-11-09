import { InteractiveGlobe } from './globe';
import './demo.css';
import { header } from './navigation';

document.title = 'Community demo — Our Ground';
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--og-paper').trim());

type Stage = 'globe' | 'region' | 'needs';

const stages: Record<Stage, {
  title: string;
  description: string;
  primary: string;
  secondary: string;
  visualLabel: string;
}> = {
  globe: {
    title: "Explore what's<br />possible.",
    description: 'Move the globe to find the pilot community.',
    primary: 'Explore our pilot',
    secondary: 'Preview search',
    visualLabel: 'Interactive Earth. Drag to rotate or use the arrow keys. Select the pilot community to zoom in.',
  },
  region: {
    title: 'Look closer.',
    description: 'Explore access in one illustrative community.',
    primary: 'Explore local needs',
    secondary: 'Back to globe',
    visualLabel: 'Illustrative aerial view of the pilot community. Drag to move the view and use the zoom controls.',
  },
  needs: {
    title: 'See where<br />needs overlap.',
    description: 'Public data can reveal barriers to food, care, and travel.',
    primary: 'Explore needs',
    secondary: 'Back to globe',
    visualLabel: 'Illustrative community view with food, healthcare, and transportation access layers turned on.',
  },
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app element');

app.innerHTML = `
  <div class="site-shell" data-stage="globe">
    ${header()}

    <main class="hero" id="main" tabindex="-1">
      <section class="hero-copy" aria-live="polite">
        <div class="eyebrow">LEGACY INTERACTIVE DEMO</div>
        <h1 id="heroTitle">${stages.globe.title}</h1>
        <p class="hero-description" id="heroDescription">${stages.globe.description}</p>
        <div class="hero-actions">
          <button class="button button-primary" id="primaryAction" type="button">${stages.globe.primary}</button>
          <button class="button button-secondary" id="secondaryAction" type="button">
            <span id="secondaryLabel">${stages.globe.secondary}</span>
            <span class="button-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="demo-local-actions"><button class="nav-link" id="approachButton" type="button">About this demo</button><button class="nav-link" id="demoButton" type="button">Explore demo</button></div>
      </section>

      <section class="visual" id="visual" aria-label="${stages.globe.visualLabel}">
        <div class="globe-view" id="globeView">
          <div class="globe-mount" id="globeMount" role="group" tabindex="0" aria-label="Rotate the Earth with a drag or the arrow keys; use plus and minus to zoom"></div>
          <div class="globe-fallback" aria-hidden="true"></div>
          <button class="pilot-pin globe-pin" id="globePin" type="button" aria-label="Explore the illustrative pilot community">
            <span class="pin-dot" aria-hidden="true"></span>
            <span class="pin-label"><strong>Pilot community</strong><small>Illustrative location</small></span>
          </button>
        </div>

        <div class="region-view" id="regionView" tabindex="0" aria-label="Illustrative community map. Use arrow keys to pan and plus or minus to zoom.">
          <div class="region-surface" id="regionSurface">
            <img src="/assets/pilot-region.png" alt="" draggable="false" />
            <svg class="needs-areas" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
              <path class="area area-food" d="M470 227C549 192 660 216 708 266C749 309 727 371 661 394C584 422 478 379 435 321C416 285 428 247 470 227Z" />
              <path class="area area-health" d="M596 257C666 210 770 234 815 277C862 322 839 375 791 402C723 443 636 426 585 385C541 350 552 289 596 257Z" />
              <path class="area area-transit" d="M523 340C587 305 680 330 729 368C787 414 803 469 757 502C717 534 607 512 548 478C480 441 470 373 523 340Z" />
            </svg>
            <button class="pilot-pin region-pin" id="regionPin" type="button" aria-label="Read about the illustrative pilot community">
              <span class="pin-dot" aria-hidden="true"></span>
              <span class="pin-label"><strong>Pilot community</strong><small>Illustrative region</small></span>
            </button>
          </div>
          <div class="legend demo-panel" id="needsLegend" aria-label="Community needs legend">
            <div class="legend-title">Illustrative needs</div>
            <div class="legend-item"><span class="legend-swatch food"></span>Food access</div>
            <div class="legend-item"><span class="legend-swatch healthcare"></span>Healthcare</div>
            <div class="legend-item"><span class="legend-swatch transportation"></span>Transportation</div>
          </div>
          <button class="needs-toggle demo-panel" id="needsToggle" type="button" role="switch" aria-checked="false">
            <span>Community needs</span><span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
          <div class="demo-badge demo-panel">Illustrative regional view</div>
        </div>

        <div class="visual-controls demo-panel" aria-label="View controls">
          <span class="drag-symbol" aria-hidden="true">✣</span>
          <span class="control-hint" id="controlHint">Drag to explore</span>
          <span class="control-divider" aria-hidden="true"></span>
          <button id="zoomOut" type="button" aria-label="Zoom out">−</button>
          <button id="zoomIn" type="button" aria-label="Zoom in">+</button>
        </div>
      </section>

      <aside class="needs-summary demo-panel" id="needsSummary" hidden>
        <span class="summary-eyebrow">ILLUSTRATIVE INSIGHT</span>
        <button class="summary-close" id="closeSummary" type="button" aria-label="Close insight">×</button>
        <h2>Needs can overlap.</h2>
        <p>Food, healthcare, and travel barriers are shown together to explore where support could help.</p>
        <small>Example overlay · Not measured local conditions</small>
      </aside>

      <footer class="hero-footer">
        <span class="prototype-note">Legacy demo <span aria-hidden="true">·</span> Illustrative data</span>
        <nav class="story-nav" aria-label="Explore the three views">
          <button type="button" data-stage-target="globe" aria-label="Show globe view" aria-current="step"><span></span></button>
          <button type="button" data-stage-target="region" aria-label="Show pilot community view"><span></span></button>
          <button type="button" data-stage-target="needs" aria-label="Show community needs view"><span></span></button>
          <span class="story-count" id="storyCount">01 / 03</span>
        </nav>
        <a class="image-credit" href="https://svs.gsfc.nasa.gov/2915" target="_blank" rel="noopener noreferrer">Earth imagery: NASA/GSFC SVS <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  </div>

  <dialog class="info-dialog" id="infoDialog" aria-labelledby="dialogTitle">
    <button class="dialog-close" id="dialogClose" type="button" aria-label="Close dialog">×</button>
    <div id="dialogBody"></div>
  </dialog>
`;

function getElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const shell = getElement<HTMLElement>('.site-shell');
const title = getElement<HTMLElement>('#heroTitle');
const description = getElement<HTMLElement>('#heroDescription');
const primary = getElement<HTMLButtonElement>('#primaryAction');
const secondary = getElement<HTMLButtonElement>('#secondaryAction');
const secondaryLabel = getElement<HTMLElement>('#secondaryLabel');
const visual = getElement<HTMLElement>('#visual');
const hint = getElement<HTMLElement>('#controlHint');
const storyCount = getElement<HTMLElement>('#storyCount');
const needsToggle = getElement<HTMLButtonElement>('#needsToggle');
const needsSummary = getElement<HTMLElement>('#needsSummary');
const dialog = getElement<HTMLDialogElement>('#infoDialog');
const dialogBody = getElement<HTMLElement>('#dialogBody');
const regionSurface = getElement<HTMLElement>('#regionSurface');

let stage: Stage = 'globe';
let globe: InteractiveGlobe | undefined;
let regionScale = 1.025;
let panX = 0;
let panY = 0;

try {
  globe = new InteractiveGlobe(
    getElement<HTMLElement>('#globeMount'),
    getElement<HTMLElement>('#globePin'),
  );
} catch {
  getElement<HTMLElement>('#globeView').classList.add('without-webgl');
}

function updateRegionTransform(): void {
  regionSurface.style.setProperty('--region-scale', `${regionScale}`);
  regionSurface.style.setProperty('--pan-x', `${panX}px`);
  regionSurface.style.setProperty('--pan-y', `${panY}px`);
}

function setStage(next: Stage): void {
  stage = next;
  shell.dataset.stage = next;
  title.innerHTML = stages[next].title;
  description.textContent = stages[next].description;
  primary.textContent = stages[next].primary;
  secondaryLabel.textContent = stages[next].secondary;
  visual.setAttribute('aria-label', stages[next].visualLabel);
  hint.textContent = next === 'globe' ? 'Drag to explore' : 'Drag to move';
  storyCount.textContent = `${String(['globe', 'region', 'needs'].indexOf(next) + 1).padStart(2, '0')} / 03`;
  needsToggle.setAttribute('aria-checked', String(next === 'needs'));
  needsSummary.hidden = true;
  globe?.setActive(next === 'globe');

  document.querySelectorAll<HTMLButtonElement>('[data-stage-target]').forEach((button) => {
    if (button.dataset.stageTarget === next) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });

  title.classList.remove('copy-enter');
  description.classList.remove('copy-enter');
  void title.offsetWidth;
  title.classList.add('copy-enter');
  description.classList.add('copy-enter');
}

function openDialog(content: string): void {
  dialogBody.innerHTML = content;
  dialog.showModal();
}

function openApproach(): void {
  openDialog(`
    <span class="dialog-eyebrow">OUR APPROACH</span>
    <h2 id="dialogTitle">Insight guided by people.</h2>
    <p>Our Ground explores how public data, available resources, and everyday needs could connect in one community.</p>
    <p>This earlier interactive concept uses an illustrative region and example overlays. It does not measure local needs or match people with services.</p><p><a href="/support">Use the resource directory to find support</a>.</p>
    <div class="dialog-note">Legacy interactive demo · Illustrative data</div>
  `);
}

function openSupport(): void {
  openDialog(`
    <span class="dialog-eyebrow">LEGACY SEARCH PREVIEW</span>
    <h2 id="dialogTitle">Preview a search.</h2>
    <p>This example form does not search the directory. <a href="/support">Find support in the working directory</a>.</p>
    <form class="support-form" id="supportForm">
      <label for="zipCode">ZIP code</label>
      <input id="zipCode" name="zipCode" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" placeholder="Enter ZIP code" required />
      <label for="supportType">Type of support</label>
      <select id="supportType" name="supportType">
        <option>Food</option><option>Healthcare</option><option>Transportation</option>
      </select>
      <button class="button button-primary" type="submit">Search demo</button>
    </form>
    <p class="search-response" id="searchResponse" role="status" hidden></p>
    <div class="dialog-note">This demo form has no live results or verified availability.</div>
  `);

  getElement<HTMLFormElement>('#supportForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const response = getElement<HTMLElement>('#searchResponse');
    response.textContent = 'The search flow is ready for service data. No live results are connected in this prototype.';
    response.hidden = false;
  });
}

primary.addEventListener('click', () => {
  if (stage === 'globe') setStage('region');
  else if (stage === 'region') setStage('needs');
  else needsSummary.hidden = !needsSummary.hidden;
});

secondary.addEventListener('click', () => {
  if (stage === 'globe') openSupport();
  else if (stage === 'region') setStage('globe');
  else setStage('globe');
});

getElement<HTMLButtonElement>('#demoButton').addEventListener('click', () => setStage('region'));
getElement<HTMLButtonElement>('#approachButton').addEventListener('click', openApproach);
getElement<HTMLButtonElement>('#globePin').addEventListener('click', () => setStage('region'));
getElement<HTMLButtonElement>('#regionPin').addEventListener('click', () => {
  openDialog(`
    <span class="dialog-eyebrow">ONE-COMMUNITY PILOT</span>
    <h2 id="dialogTitle">Pilot community.</h2>
    <p>This is an illustrative regional view. The pilot location and any local access patterns have not been selected or measured here.</p>
    <button class="button button-primary" type="button" id="showNeeds">View example needs</button>
  `);
  getElement<HTMLButtonElement>('#showNeeds').addEventListener('click', () => {
    dialog.close();
    setStage('needs');
  });
});

needsToggle.addEventListener('click', () => setStage(stage === 'needs' ? 'region' : 'needs'));
getElement<HTMLButtonElement>('#closeSummary').addEventListener('click', () => { needsSummary.hidden = true; primary.focus(); });
getElement<HTMLButtonElement>('#dialogClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

document.querySelectorAll<HTMLButtonElement>('[data-stage-target]').forEach((button) => {
  button.addEventListener('click', () => setStage(button.dataset.stageTarget as Stage));
});

getElement<HTMLButtonElement>('#zoomIn').addEventListener('click', () => {
  if (stage === 'globe') globe?.zoom(-1);
  else {
    regionScale = Math.min(1.6, regionScale + 0.1);
    updateRegionTransform();
  }
});

getElement<HTMLButtonElement>('#zoomOut').addEventListener('click', () => {
  if (stage === 'globe') globe?.zoom(1);
  else {
    regionScale = Math.max(1.025, regionScale - 0.1);
    updateRegionTransform();
  }
});

let panning = false;
let lastX = 0;
let lastY = 0;
const regionView = getElement<HTMLElement>('#regionView');
regionView.addEventListener('keydown', (event) => {
  if (event.target !== regionView) return;
  switch (event.key) {
    case 'ArrowLeft': panX = Math.max(-90, panX - 20); break;
    case 'ArrowRight': panX = Math.min(90, panX + 20); break;
    case 'ArrowUp': panY = Math.max(-65, panY - 20); break;
    case 'ArrowDown': panY = Math.min(65, panY + 20); break;
    case '+': case '=': regionScale = Math.min(1.6, regionScale + 0.1); break;
    case '-': regionScale = Math.max(1.025, regionScale - 0.1); break;
    default: return;
  }
  event.preventDefault();
  updateRegionTransform();
});
regionView.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
  panning = true;
  lastX = event.clientX;
  lastY = event.clientY;
  regionView.setPointerCapture(event.pointerId);
  regionView.classList.add('is-panning');
});
regionView.addEventListener('pointermove', (event) => {
  if (!panning) return;
  panX = Math.max(-90, Math.min(90, panX + event.clientX - lastX));
  panY = Math.max(-65, Math.min(65, panY + event.clientY - lastY));
  lastX = event.clientX;
  lastY = event.clientY;
  updateRegionTransform();
});
for (const name of ['pointerup', 'pointercancel'] as const) {
  regionView.addEventListener(name, (event) => {
    panning = false;
    regionView.classList.remove('is-panning');
    if (regionView.hasPointerCapture(event.pointerId)) regionView.releasePointerCapture(event.pointerId);
  });
}

updateRegionTransform();
setStage('globe');
