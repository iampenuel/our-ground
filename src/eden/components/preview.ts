import '../../design-tokens.css';
import './preview.css';
import { EDEN_STATES, STATE_COPY } from '../types/eden.ts';
import type { EdenMouthPose, EdenState, EdenRenderer } from '../types/eden.ts';
import { EdenController } from '../runtime/controller.ts';
import { EdenSvgRenderer } from '../runtime/svg-renderer.ts';
import { MOUTH_POSES } from '../runtime/motion.ts';
const root = document.querySelector<HTMLDivElement>('#eden-preview')!;
root.innerHTML = `
<header class="studio-header"><a class="wordmark" href="/" aria-label="Our Ground home"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 23V14C5 8 10 4 15 4C20 4 25 8 25 14V23M10 23V14C10 11 12 9 15 9C18 9 20 11 20 14V23M15 14V23"/></svg>OUR GROUND</a><span class="studio-label">CHARACTER STUDIO <span> / </span> 01</span><span class="local-badge"><i></i> Local preview</span></header>
<main class="studio-main">
<div class="intro"><div><p class="og-eyebrow">A familiar face. A little more life.</p><h1>Meet Eden.</h1></div><p>Warm, attentive, and here to help.<br>Explore the expressions of Our Ground’s guide.</p></div>
<div class="studio-grid">
<section class="portrait-panel" aria-label="EDEN animation preview"><div class="portrait-top"><span>EDEN</span><span>YOUR SUPPORT GUIDE</span></div><div class="portrait-stage" id="portrait-stage"><img id="static-eden" src="/assets/eden/approved-original/eden.png" alt="EDEN, smiling with dark hair, gold hoops, and a black cardigan" width="1254" height="1254"/></div><div class="portrait-bottom"><span><i></i><span id="portrait-state">Idle</span></span><button id="pause" type="button" aria-pressed="false" aria-label="Pause character animation">Ⅱ <span>Pause</span></button></div></section>
<section class="controls" aria-labelledby="expression-heading"><div class="control-heading"><span class="step">01</span><h2 id="expression-heading">A moment, an expression.</h2></div><p class="control-intro">Choose a state to see how Eden responds.</p><div class="state-grid" role="group" aria-label="Animation states">${EDEN_STATES.map((state, i) => `<button type="button" data-state="${state}" aria-pressed="${state === 'idle'}"><span class="state-number">0${i + 1}</span>${STATE_COPY[state].label}<span class="selection-mark" aria-hidden="true">↗</span></button>`).join('')}</div>
<div class="state-message"><p id="state-status" role="status" aria-live="polite">${STATE_COPY.idle.status}</p><p id="state-description">${STATE_COPY.idle.description}</p></div>
<div class="speech-controls"><div class="control-heading"><span class="step">02</span><h2>Give her a voice.</h2><span class="quiet-tag">SIMULATED</span></div><p class="control-intro">Explore mouth movement with silent speech activity.</p><div class="audio-label"><label for="audio-level">Audio activity</label><output id="audio-value" for="audio-level">0%</output></div><input id="audio-level" type="range" min="0" max="1" step="0.01" value="0" aria-describedby="audio-help"/><div class="range-labels"><span>Quiet</span><span>Expressive</span></div><div class="speech-actions"><button type="button" id="simulate" class="primary-action" aria-pressed="false">▷ <span>Simulate speaking</span></button><button type="button" id="reset" class="text-action">Reset to idle ↺</button></div><p id="audio-help" class="small-note">Amplitude-driven mouth poses. No microphone or voice service.</p></div>
<div class="motion-options"><label class="toggle-label"><input id="reduced-motion" type="checkbox"/><span>Reduced motion</span></label><button type="button" id="blink" class="text-action">Preview a blink</button></div>
</section></div>
<footer class="studio-footer"><span>Same Eden. Every expression.</span><span id="engine-status">Loading the layered character…</span></footer>
<details class="studio-notes"><summary>Artwork, mouth poses &amp; handoff notes <span>+</span></summary><div class="notes-grid"><div><h3>Compare the artwork</h3><label class="toggle-label"><input type="checkbox" id="show-original"/>Show the approved original</label><p>The original is preserved unchanged. Facial features, hair, earrings, and the torso are layered; the cardigan, top, and necklace remain attached.</p></div><div><h3>Inspect six mouth poses</h3><div class="mouth-buttons" role="group" aria-label="Mouth poses">${Object.keys(MOUTH_POSES).map(pose => `<button type="button" data-mouth="${pose}" aria-pressed="false">${pose}</button>`).join('')}</div><p>These shapes blend smoothly. Audio amplitude alone is not phoneme-accurate lip-sync.</p></div><div><h3>Rive handoff</h3><p>Native Rive controls the character. A matching SVG rig is available as a fallback. The local export carries Rive’s watermark; the original Editor file is unchanged.</p><p>State buttons are demonstrations. The controller accepts real search lifecycle events; no resource search runs here.</p></div></div></details>
</main>`;
const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const media = matchMedia('(prefers-reduced-motion: reduce)');
let controller: EdenController | undefined, renderer: EdenRenderer | undefined;
let simulationFrame = 0, simulation = false, simulationTime = 0, previousTime = 0, lastWrite = 0;
let overrideMotion = false, lastState: EdenState = 'idle';
const range = get<HTMLInputElement>('#audio-level'), reduced = get<HTMLInputElement>('#reduced-motion');
const stopSimulation = () => { simulation = false; cancelAnimationFrame(simulationFrame); simulationFrame = 0; previousTime = 0; get('#simulate').setAttribute('aria-pressed', 'false'); get('#simulate span').textContent = 'Simulate speaking'; };
const tick = (now: number) => {
  if (!simulation || !controller) return;
  if (document.hidden || controller.snapshot.paused) { previousTime = 0; simulationFrame = 0; return; }
  const dt = previousTime ? Math.min(.1, (now - previousTime) / 1000) : 0; previousTime = now; simulationTime += dt;
  // A deterministic, irregular syllabic envelope with phrase pauses. Silent simulation only.
  const t = simulationTime, phrase = t % 6.7;
  const pulse = phrase > 4.9 ? 0 : Math.max(0, Math.sin(t * 9.3)) * .51 + Math.max(0, Math.sin(t * 14.1 + .8)) * .32;
  if (now - lastWrite > 40) { lastWrite = now; controller.setEdenAudioLevel(Math.min(1, pulse)); }
  simulationFrame = requestAnimationFrame(tick);
};
const visibility = () => { if (!document.hidden && simulation && !simulationFrame) simulationFrame = requestAnimationFrame(tick); };
document.addEventListener('visibilitychange', visibility);
const applyMotion = () => { if (!overrideMotion) { reduced.checked = media.matches; controller?.setEdenReducedMotion(media.matches); } };
media.addEventListener('change', applyMotion);
async function init() {
  try {
    let native = false;
    if (new URLSearchParams(location.search).get('renderer') !== 'svg') {
      const canvas = document.createElement('canvas'); canvas.id = 'eden-character';
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'EDEN, Our Ground’s animated support guide');
      get('#portrait-stage').append(canvas);
      try {
        const { loadEdenRive } = await import('../runtime/rive-renderer.ts');
        renderer = await loadEdenRive(canvas); native = true;
      } catch { canvas.remove(); }
    }
    if (!native) {
    const response = await fetch('/assets/eden/rig/eden-layered.svg');
    if (!response.ok) throw new Error('Artwork could not load');
    const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid artwork');
    const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
    svg.id = 'eden-character';
    get('#portrait-stage').append(svg);
    renderer = new EdenSvgRenderer(svg);
    }
    get('#static-eden').hidden = true;
    controller = new EdenController(renderer!);
    controller.subscribe(snapshot => {
      if ((snapshot.state !== 'speaking' || snapshot.reducedMotion) && simulation) stopSimulation();
      root.querySelectorAll<HTMLButtonElement>('[data-state]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === snapshot.state)));
      const copy = STATE_COPY[snapshot.state];
      if (lastState !== snapshot.state) { get('#state-status').textContent = copy.status; get('#state-description').textContent = copy.description; lastState = snapshot.state; }
      get('#portrait-state').textContent = copy.label;
      range.value = String(snapshot.audioLevel); get('#audio-value').textContent = `${Math.round(snapshot.audioLevel * 100)}%`;
      reduced.checked = snapshot.reducedMotion;
      get<HTMLButtonElement>('#blink').disabled = snapshot.reducedMotion || snapshot.paused;
      get<HTMLButtonElement>('#simulate').disabled = snapshot.reducedMotion;
      range.disabled = snapshot.reducedMotion;
      get('#pause').setAttribute('aria-pressed', String(snapshot.paused)); get('#pause span').textContent = snapshot.paused ? 'Resume' : 'Pause';
    });
    applyMotion(); get('#engine-status').textContent = native ? 'Native Rive · 8 states · 6 mouth poses' : 'Layered SVG fallback · same character rig';
  } catch {
    get('#static-eden').hidden = false; get('#engine-status').textContent = 'Animation unavailable · approved static artwork';
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(control => { control.disabled = true; });
  }
}
root.querySelectorAll<HTMLButtonElement>('[data-state]').forEach(button => button.addEventListener('click', () => { stopSimulation(); controller?.setEdenState(button.dataset.state as EdenState); }));
range.addEventListener('input', () => { const value = Number(range.value); stopSimulation(); if (controller?.snapshot.state !== 'speaking') controller?.setEdenState('speaking'); controller?.setEdenAudioLevel(value); });
get('#simulate').addEventListener('click', () => {
  if (!controller) return;
  if (simulation) { stopSimulation(); controller.setEdenAudioLevel(0); return; }
  controller.setEdenState('speaking'); controller.setPaused(false); simulation = true; simulationTime = 0; previousTime = 0;
  get('#simulate').setAttribute('aria-pressed', 'true'); get('#simulate span').textContent = 'Stop simulation'; simulationFrame = requestAnimationFrame(tick);
});
get('#reset').addEventListener('click', () => { stopSimulation(); controller?.setPaused(false); controller?.setEdenState('idle'); root.querySelectorAll('[data-mouth]').forEach(b => b.setAttribute('aria-pressed', 'false')); });
get('#pause').addEventListener('click', () => { if (!controller) return; controller.setPaused(!controller.snapshot.paused); visibility(); });
reduced.addEventListener('change', () => { overrideMotion = true; stopSimulation(); controller?.setEdenReducedMotion(reduced.checked); });
get('#blink').addEventListener('click', () => renderer?.blink?.());
get<HTMLInputElement>('#show-original').addEventListener('change', event => {
  const checked = (event.target as HTMLInputElement).checked;
  get('#static-eden').hidden = !checked; get('#eden-character').toggleAttribute('hidden', checked);
  controller?.setPaused(checked);
});
root.querySelectorAll<HTMLButtonElement>('[data-mouth]').forEach(button => button.addEventListener('click', () => {
  stopSimulation(); controller?.setEdenState('speaking'); renderer?.setMouthPose?.(button.dataset.mouth as EdenMouthPose);
  root.querySelectorAll('[data-mouth]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}));
const dispose = () => { stopSimulation(); controller?.dispose(); media.removeEventListener('change', applyMotion); document.removeEventListener('visibilitychange', visibility); };
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
void init();
