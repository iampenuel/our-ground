import { Rive, Layout, Fit, Alignment, RuntimeLoader } from '@rive-app/canvas';
import wasmUrl from '@rive-app/canvas/rive.wasm?url';
import { EDEN_STATES } from '../types/eden.ts';
import type { EdenRenderer, EdenState } from '../types/eden.ts';
import { MOUTH_POSES, Spring } from './motion.ts';
import { clampLevel } from './controller.ts';
/** Runtime adapter for the authenticated local export. No CDN, credentials, or voice service.
 * The supplied SVG preview remains available if a .riv export or WASM is unavailable.
 * Host CSP must explicitly permit WebAssembly; the production CSP is not changed here.
 */
export type EdenRiveRuntimeOptions = {
  profile?: boolean;
  onAdvance?: (frames: number) => void;
  onBlink?: (active: boolean) => void;
};
export async function loadEdenRive(canvas: HTMLCanvasElement, src = '/assets/eden/rig/eden.riv', signal?: AbortSignal, options: EdenRiveRuntimeOptions = {}): Promise<EdenRenderer> {
  signal?.throwIfAborted();
  RuntimeLoader.setWasmUrl(wasmUrl);
  RuntimeLoader.setWasmFallbackUrl(null);
  RuntimeLoader.setReplayWorker(false);
  const response = await fetch(src, { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('EDEN’s local Rive export is unavailable.');
  const buffer = await response.arrayBuffer();
  signal?.throwIfAborted();
  if (new TextDecoder().decode(buffer.slice(0, 4)) !== 'RIVE') throw new Error('Expected a compiled Rive export.');
  return new Promise((resolve, reject) => {
    let completed = false, rive: Rive | undefined, advances = 0;
    const cancelled = () => fail();
    const fail = () => { if (!completed) { completed = true; clearTimeout(timeout); signal?.removeEventListener('abort', cancelled); rive?.cleanup(); reject(new Error('EDEN’s Rive animation could not load.')); } };
    const timeout = setTimeout(fail, 10000);
    try { rive = new Rive({
      canvas, buffer, autoplay: true, stateMachine: 'Eden', artboard: 'Eden', autoBind: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoadError: fail,
      onAdvance: () => options.onAdvance?.(++advances),
      onLoad: () => {
        if (completed) return;
        const runtime = rive;
        if (!runtime) { fail(); return; }
        const vm = runtime.viewModelInstance, state = vm?.number('state'), level = vm?.number('audioLevel'), reduced = vm?.boolean('reducedMotion');
        const mouth = vm?.number('mouthOverride'), blink = vm?.boolean('blinkNow'), hostBlinks = vm?.boolean('hostBlinks');
        if (!state || !level || !reduced || !mouth || !blink || !hostBlinks) { fail(); return; }
        hostBlinks.value = true;
        clearTimeout(timeout); signal?.removeEventListener('abort', cancelled); completed = true;
        let current: EdenState = 'idle', reduce = false, pause = false, visible = true;
        let settleTimer: ReturnType<typeof setTimeout> | undefined, blinkTimer: ReturnType<typeof setTimeout> | undefined, nextBlink: ReturnType<typeof setTimeout> | undefined;
        let audioFrame = 0, audioTarget = 0, lastAudioTime = 0, disposed = false, firstBlink = true;
        const audioSpring = new Spring(0);
        const smoothAudio = (now: number) => {
          audioFrame = 0;
          if (disposed || document.hidden || !visible || pause || reduce || current !== 'speaking') return;
          const dt = lastAudioTime ? Math.min(.05, (now - lastAudioTime) / 1000) : 1 / 60;
          lastAudioTime = now; level.value = audioSpring.step(audioTarget, dt, 24);
          if (Math.abs(level.value - audioTarget) > .001 || Math.abs(audioSpring.velocity) > .01) audioFrame = requestAnimationFrame(smoothAudio);
        };
        const triggerBlink = () => {
          if (disposed || reduce || pause || !visible || document.hidden) return;
          clearTimeout(blinkTimer); blink.value = true; options.onBlink?.(true);
          blinkTimer = setTimeout(() => { blink.value = false; options.onBlink?.(false); }, 320);
        };
        const scheduleBlink = () => {
          clearTimeout(nextBlink);
          if (disposed || reduce || pause || !visible || document.hidden) return;
          const delay = options.profile && firstBlink ? 1400 + Math.random() * 900 : 2800 + Math.random() * (options.profile ? 4000 : 5800);
          nextBlink = setTimeout(() => { firstBlink = false; triggerBlink(); scheduleBlink(); }, delay);
        };
        const settle = () => {
          clearTimeout(settleTimer);
          if (document.hidden || pause || !visible) return;
          runtime.play('Eden');
          if (reduce) settleTimer = setTimeout(() => runtime.pause(), 450);
        };
        const resize = () => runtime.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio || 1, 2));
        const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
        const visibility = () => {
          clearTimeout(nextBlink); cancelAnimationFrame(audioFrame); audioFrame = 0; lastAudioTime = 0;
          if (document.hidden || pause || !visible) { clearTimeout(blinkTimer); blink.value = false; runtime.pause(); }
          else { settle(); scheduleBlink(); if (current === 'speaking' && !reduce) audioFrame = requestAnimationFrame(smoothAudio); }
        };
        const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; visibility(); });
        intersection.observe(canvas);
        document.addEventListener('visibilitychange', visibility);
        scheduleBlink();
        resolve({
          setState(next) { current = next; state.value = EDEN_STATES.indexOf(next); audioTarget = 0; audioSpring.snap(0); level.value = 0; mouth.value = -1; settle(); },
          setAudioLevel(value) { audioTarget = current === 'speaking' && !reduce ? clampLevel(value) : 0; mouth.value = -1; if (!audioFrame && !pause && !reduce && !document.hidden) { lastAudioTime = 0; audioFrame = requestAnimationFrame(smoothAudio); } },
          setReducedMotion(value) { reduce = value; reduced.value = value; level.value = 0; blink.value = false; clearTimeout(blinkTimer); scheduleBlink(); settle(); },
          setPaused(value) { pause = value; visibility(); },
          setMouthPose(pose) { mouth.value = pose ? Object.keys(MOUTH_POSES).indexOf(pose) : -1; settle(); },
          blink: triggerBlink,
          dispose() { if (disposed) return; disposed = true; clearTimeout(settleTimer); clearTimeout(blinkTimer); clearTimeout(nextBlink); cancelAnimationFrame(audioFrame); observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', visibility); runtime.cleanup(); },
        });
      },
    }); } catch { fail(); return; }
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) fail();
  });
}
