import type { EdenRenderer, EdenState } from '../types/eden.ts';
import type { EdenRiveRuntimeOptions } from './rive-renderer.ts';

export type EdenLauncherKind = 'rive' | 'svg' | 'svg-profile' | 'static';
export type EdenLauncherPortrait = EdenRenderer & {
  /** Resolves after loading, including safe static fallback on failure/disposal. */
  readonly ready: Promise<EdenLauncherKind>;
  setPaused(paused: boolean): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
};
export type EdenLauncherOptions = { nativeRive: boolean; reducedMotion: boolean; paused?: boolean; profile?: boolean };
type LauncherLoaders = {
  loadProfile: (host: HTMLElement, signal: AbortSignal) => Promise<{svg: SVGSVGElement; renderer: EdenRenderer}>;
  loadNative: (canvas: HTMLCanvasElement, signal: AbortSignal, options?: EdenRiveRuntimeOptions) => Promise<EdenRenderer>;
  loadSvg: (signal: AbortSignal) => Promise<SVGSVGElement>;
  createSvgRenderer: (svg: SVGSVGElement) => EdenRenderer | Promise<EdenRenderer>;
};
const defaults: LauncherLoaders = {
  async loadProfile(host, signal) { const { loadProfileSvg } = await import('./profile-svg.ts'); signal.throwIfAborted(); return loadProfileSvg(host, signal); },
  async loadNative(canvas, signal, options) {
    const { loadEdenRive } = await import('./rive-renderer.ts');
    signal.throwIfAborted();
    return loadEdenRive(canvas, options?.profile ? '/assets/eden/approved-profile/eden-launcher.riv' : undefined, signal, options);
  },
  async loadSvg(signal) {
    const response = await fetch('/assets/eden/rig/eden-layered.svg', { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Portrait unavailable.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    signal.throwIfAborted();
    if (parsed.querySelector('parsererror')) throw new Error('Portrait unavailable.');
    return document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  },
  async createSvgRenderer(svg) { const { EdenSvgRenderer } = await import('./svg-renderer.ts'); return new EdenSvgRenderer(svg); },
};

/** Mount port keeps lifecycle tests independent of WASM and browser decoding. */
export function createEdenLauncherPortraitMount(overrides: Partial<LauncherLoaders> = {}) {
  const loaders = { ...defaults, ...overrides };
  const mounted = new WeakMap<HTMLElement, EdenLauncherPortrait>();
  return async function mount(host: HTMLElement, options: EdenLauncherOptions): Promise<EdenLauncherPortrait> {
    mounted.get(host)?.dispose();
    const image = host.querySelector<HTMLImageElement>('img');
    const imageWasHidden = image?.hidden ?? false;
    const abort = new AbortController();
    let renderer: EdenRenderer | undefined, node: HTMLCanvasElement | SVGSVGElement | undefined;
    let staging: HTMLCanvasElement | SVGSVGElement | undefined, painted = false, revealFrames = 0;
    let paused = options.paused === true, reduced = options.reducedMotion, disposed = false;
    let visible = typeof IntersectionObserver === 'undefined', focused = document.hasFocus();
    let frame: number | undefined, previous = 0, elapsed = 0;
    let kind: EdenLauncherKind = 'static';
    let state: EdenState = 'idle', audioLevel = 0;
    const inactive = () => paused || reduced || !visible || !focused || document.hidden;
    const stopFrames = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; previous = 0; if (!painted) revealFrames = 0; };
    const animate = (now: number) => {
      frame = undefined;
      if (disposed || inactive() || !renderer || !node) return;
      elapsed += previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      // Keep the exact portrait until the fully decoded renderer has painted.
      if (!painted && ++revealFrames >= 2) {
        painted = true; node.style.visibility = 'visible';
        if (image) image.hidden = true;
      }
      // Tiny planar motion only. The approved rig owns gaze, breathing, hair and
      // blinks; this never invents yaw, stretches the face or changes its export.
      // The profile variant owns its independent feature transforms.
      if (!options.profile) node.style.rotate = `${(Math.sin(elapsed * .65) * .16).toFixed(4)}deg`;
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      if (disposed) return;
      stopFrames();
      renderer?.setReducedMotion(reduced);
      renderer?.setPaused(inactive());
      if (node) { node.toggleAttribute('hidden', reduced); node.style.visibility = painted && !reduced ? 'visible' : 'hidden'; }
      if (image) image.hidden = Boolean(renderer) && painted && !reduced;
      host.dataset.edenLauncherMotion = reduced ? 'reduced' : inactive() ? 'paused' : 'idle';
      if (!inactive() && renderer) frame = requestAnimationFrame(animate);
    };
    const visibility = () => sync();
    const blur = () => { focused = false; sync(); };
    const focus = () => { focused = true; sync(); };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting === true; sync();
    });
    observer?.observe(host);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    const pageHide = () => handle.dispose();
    window.addEventListener('pagehide', pageHide, { once: true });
    host.dataset.edenLauncherRenderer = 'static';

    const install = (candidate: EdenRenderer, element: HTMLCanvasElement | SVGSVGElement, nextKind: Exclude<EdenLauncherKind, 'static'>) => {
      if (disposed || abort.signal.aborted || !host.isConnected) { candidate.dispose(); element.remove(); return false; }
      renderer = candidate; node = element; staging = undefined; kind = nextKind; painted = false; revealFrames = 0;
      renderer.setState(state); renderer.setAudioLevel(audioLevel);
      host.dataset.edenLauncherRenderer = nextKind;
      sync(); return true;
    };
    const initialize = async (): Promise<EdenLauncherKind> => {
      // Animate our original illustration layers independently. The preserved
      // free Rive reference keeps its required splash; it is not loaded here.
      if (options.profile) {
        try {
          const candidate = await loaders.loadProfile(host, AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]));
          if (install(candidate.renderer, candidate.svg, 'svg-profile')) return kind;
        } catch { /* The approved PNG remains the loading/error fallback. */ }
        return 'static';
      }
      if (options.nativeRive) {
        const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.style.visibility = 'hidden';
        staging = canvas; host.append(canvas);
        try {
          const candidate = await loaders.loadNative(canvas, AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)]), {
            profile: options.profile,
            onAdvance: frames => { if (!disposed) host.dataset.edenRiveFrames = String(frames); },
            onBlink: active => { if (!disposed) host.dataset.edenBlink = active ? 'active' : 'rest'; },
          });
          if (install(candidate, canvas, 'rive')) return kind;
          return 'static';
        } catch { canvas.remove(); if (staging === canvas) staging = undefined; }
      }
      if (disposed || abort.signal.aborted || !host.isConnected) return 'static';
      let svg: SVGSVGElement | undefined;
      try {
        svg = await loaders.loadSvg(AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)]));
        if (disposed || abort.signal.aborted || !host.isConnected) return 'static';
        svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.style.visibility = 'hidden'; staging = svg; host.append(svg);
        const candidate = await loaders.createSvgRenderer(svg);
        if (install(candidate, svg, 'svg')) return kind;
      } catch { svg?.remove(); }
      return 'static';
    };
    const handle: EdenLauncherPortrait = {
      // Set below before returning; loading never delays pause/disposal controls.
      ready: Promise.resolve('static'),
      setState(value) { state = value; renderer?.setState(value); },
      setAudioLevel(value) { audioLevel = value; renderer?.setAudioLevel(value); },
      blink() { renderer?.blink?.(); },
      setPaused(value) { paused = value; sync(); },
      setReducedMotion(value) { reduced = value; if (value) painted = false; sync(); },
      dispose() {
        if (disposed) return;
        disposed = true; abort.abort(); stopFrames();
        observer?.disconnect(); renderer?.dispose(); renderer = undefined;
        node?.remove(); node = undefined; staging?.remove(); staging = undefined;
        if (image) image.hidden = imageWasHidden;
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('pagehide', pageHide);
        delete host.dataset.edenLauncherRenderer; delete host.dataset.edenLauncherMotion;
        delete host.dataset.edenRiveFrames; delete host.dataset.edenBlink;
        if (mounted.get(host) === handle) mounted.delete(host);
      },
    };
    // Expose lifecycle controls immediately while the existing approved image is
    // visible. A late-loaded runtime cannot resurrect a removed launcher.
    mounted.set(host, handle); sync();
    Object.defineProperty(handle, 'ready', { value: initialize(), enumerable: true });
    return handle;
  };
}
export const mountEdenLauncherPortrait = createEdenLauncherPortraitMount();
