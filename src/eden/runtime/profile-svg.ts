import { blinkClosure, mouthAt, MOUTH_POSES, Spring } from './motion.ts';
import { EDEN_STATES } from '../types/eden.ts';
import type { EdenRenderer, EdenState } from '../types/eden.ts';
const NS = 'http://www.w3.org/2000/svg';
const ASSETS = ['background','body','head','eye-left','eye-right','hair-front','earring-left','earring-right','lash-left','lash-right','head-speaking','brow-skin','brow-left','brow-right','brow-fringe'] as const;
const FRAMES = [0,220,475,730,1000,1250,1510,1750,1860];
const ease = (value: number) => value * value * (3 - 2 * value);
function track(seconds: number, values: number[]) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const frame = (safeSeconds % 31) * 60;
  const index = Math.max(0, FRAMES.findIndex((end, i) => i > 0 && frame <= end) - 1);
  const amount = ease((frame - FRAMES[index]) / (FRAMES[index + 1] - FRAMES[index]));
  return values[index] + (values[index + 1] - values[index]) * amount;
}
/** Same restrained feature ranges/key times as the editable launcher RML. */
export function profileIdlePose(seconds: number, reduced = false) {
  const at = (values: number[]) => reduced ? values[0] : track(seconds, values);
  return {
    headRotation: at([0,.004,-.006,.010,.002,-.008,-.003,.004,0]) * 180 / Math.PI,
    headX: at([0,.2,-.3,.5,.1,-.35,-.1,.2,0]), headY: at([0,-.25,-.4,0,.35,.1,-.3,-.1,0]),
    bodyScale: at([1,1.0018,1,1.0014,1,1.0018,1,1.0012,1]),
    hairRotation: at([0,.003,-.002,.006,.001,-.004,-.002,.002,0]) * 180 / Math.PI,
    leftHoop: at([0,-.008,.005,-.012,-.003,.010,.005,-.004,0]) * 180 / Math.PI,
    rightHoop: at([0,-.006,.004,-.010,-.001,.012,.003,-.005,0]) * 180 / Math.PI,
    gazeX: at([0,1.4,.1,-1.2,0,.9,-.7,.4,0]), gazeY: at([0,-.2,-.6,0,-.3,0,-.5,-.1,0]),
  };
}
/** Same six approved contour poses used by the editable reference rig. These
 * are amplitude poses, not phoneme estimates. The contour is fitted from the
 * original master mouth into the 282px approved profile's mouth landmarks.
 */
export function profileSpeechGeometry(blend: number) {
  const safe = Number.isFinite(blend) ? Math.max(0,Math.min(1,blend)) : 0;
  const pose = mouthAt(safe), t = safe * 5, index = Math.min(4,Math.floor(t)), mix = t-index;
  const rounded = [0,0,0,0,1,0], round = rounded[index] + (rounded[index+1]-rounded[index])*mix;
  return speechContour(pose,round,Object.keys(MOUTH_POSES)[Math.round(t)]);
}
function speechContour(pose: {width:number;open:number;teeth:number}, round: number, name: string) {
  const x = (value: number) => +(165+(value-714)*(33/154)*pose.width).toFixed(3);
  const y = (value: number) => +(166+(value-669)*(18/86)*pose.open).toFixed(3);
  const p = (a: number,b: number) => `${x(a)} ${y(b)}`;
  return {
    name,open:pose.open,width:pose.width,teethOpacity:pose.teeth,
    outer:`M ${p(637,666)} C ${p(677,670-round*18)} ${p(744,672-round*18)} ${p(791,677)} C ${p(774,722)} ${p(753,751)} ${p(719,752)} C ${p(680,752)} ${p(654,720)} ${p(637,666)} Z`,
    teeth:`M ${p(648,673)} C ${p(690,678)} ${p(740,679)} ${p(779,681)} C ${p(762,710)} ${p(695,719)} ${p(648,673)} Z`,
    tongue:`M ${p(660,720)} C ${p(690,704)} ${p(735,713)} ${p(753,740)} C ${p(711,771)} ${p(680,742)} ${p(660,720)} Z`,
  };
}
/** Loudness controls only jaw openness. Rounding and smiling are separate
 * articulations; amplitude cannot identify them. The six-pose catalog remains
 * available for inspection but is not traversed by the real-time RMS driver.
 */
export function profileOpennessGeometry(openness: number) {
  const names=['closed','slight','medium','wide'] as const,safe=Number.isFinite(openness)?Math.max(0,Math.min(1,openness)):0,t=safe*3,index=Math.min(2,Math.floor(t)),mix=t-index;
  const a=MOUTH_POSES[names[index]],b=MOUTH_POSES[names[index+1]];
  return speechContour({width:a.width+(b.width-a.width)*mix,open:a.open+(b.open-a.open)*mix,teeth:a.teeth+(b.teeth-a.teeth)*mix},0,names[Math.round(t)]);
}
/** Log-level compression after the real post-gain RMS envelope; no inference
 * about phonemes or lip rounding is made from loudness.
 */
export function profileSpeechLevel(level: number) {
  if(!Number.isFinite(level)||level<=.012)return 0;
  return Math.max(0,Math.min(1,Math.log(level/.012)/Math.log(.65/.012)));
}
export const PROFILE_SPEECH_TIMING=Object.freeze({attack:.045,release:.110,onset:.020,minimumActive:.140,hush:.110,enter:.020,exit:.009,deadband:.035,maxOpenness:.86,openingSpeed:4,closingSpeed:2.6});
/** Causal, frame-rate-independent envelope. Nonzero near-silence uses hysteresis
 * so the original smile does not flash at every small RMS dip. An exact zero
 * from silence/mute/Stop bypasses all holds and restores the source immediately.
 * Durations are explicit animation tuning, not claims of phoneme alignment.
 */
export class ProfileSpeechEnvelope {
  value=0;active=false;
  private energy=0;private onset=0;private quiet=0;private age=0;private target=0;
  reset(){this.value=0;this.active=false;this.energy=0;this.onset=0;this.quiet=0;this.age=0;this.target=0;}
  step(level:number,seconds:number){
    const input=Number.isFinite(level)?Math.max(0,Math.min(1,level)):0,dt=Number.isFinite(seconds)?Math.max(0,Math.min(.1,seconds)):0,c=PROFILE_SPEECH_TIMING;
    if(input===0){this.reset();return this.value;}
    this.energy+=(input-this.energy)*(1-Math.exp(-dt/(input>this.energy?c.attack:c.release)));
    if(!this.active){this.onset=input>=c.enter?this.onset+dt:0;if(this.onset>=c.onset){this.active=true;this.age=0;}}
    if(!this.active)return this.value;
    this.age+=dt;this.quiet=input<=c.exit?this.quiet+dt:0;
    if(this.quiet>=c.hush&&this.age>=c.minimumActive){this.reset();return this.value;}
    const desired=Math.min(c.maxOpenness,profileSpeechLevel(this.energy));
    if(desired===0||Math.abs(desired-this.target)>=c.deadband)this.target=desired;
    const limit=(this.target>this.value?c.openingSpeed:c.closingSpeed)*dt;
    this.value+=Math.max(-limit,Math.min(limit,this.target-this.value));
    return this.value;
  }
}
export function profileBrowTarget(state: EdenState, level: number): [number,number] {
  if(state==='listening')return[-.4,-.3];
  if(state==='thinking')return[-.7,-.6];
  if(state==='searching')return[-.5,-.4];
  if(state==='clarifying')return[-.65,-.4];
  if(state==='speaking'&&Number.isFinite(level)&&level>.008){const activity=Math.max(0,Math.min(1,level));return[-.28-.3*activity,-.22-.25*activity];}
  return[0,0];
}
export type ProfileSvgParts = {
  head: SVGGElement; body: SVGGElement; hair: SVGGElement;
  leftHoop: SVGGElement; rightHoop: SVGGElement; leftGaze: SVGGElement; rightGaze: SVGGElement;
  leftAperture: SVGRectElement; rightAperture: SVGRectElement; leftLid: SVGPathElement; rightLid: SVGPathElement;
  headRest?: SVGImageElement; headSpeaking?: SVGImageElement; mouth?: SVGGElement;
  mouthCavity?: SVGPathElement; mouthTeeth?: SVGPathElement; mouthTongue?: SVGPathElement; mouthOutline?: SVGPathElement; mouthClip?: SVGPathElement;
  browSkin?: SVGImageElement; browLeft?: SVGGElement; browRight?: SVGGElement; browFringe?: SVGImageElement;
};
type Expression = { tilt: number; y: number; gazeX: number; gazeY: number; lids: number };
// The original smile is exact at rest. Speech uses source-fitted contours and palette,
// driven by actual playback amplitude; no phoneme/viseme lip-sync is claimed.
const EXPRESSIONS: Record<EdenState, Expression> = {
  idle:       { tilt: 0,    y: 0,    gazeX: 0,    gazeY: 0,    lids: 0 },
  listening:  { tilt: -.20, y: -.12, gazeX: .25,  gazeY: -.10, lids: .015 },
  thinking:   { tilt: .25,  y: -.18, gazeX: .65,  gazeY: -.30, lids: .035 },
  searching:  { tilt: .10,  y: -.10, gazeX: -.55, gazeY: -.10, lids: .01 },
  speaking:   { tilt: -.10, y: -.08, gazeX: 0,    gazeY: 0,    lids: 0 },
  success:    { tilt: 0,    y: .22,  gazeX: 0,    gazeY: 0,    lids: .03 },
  clarifying: { tilt: .32,  y: -.12, gazeX: .40,  gazeY: -.16, lids: .018 },
  unable:     { tilt: -.16, y: .12,  gazeX: 0,    gazeY: -.06, lids: .035 },
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** Feature animation only: the root portrait is never bounced, spun or scaled. */
export class ProfileSvgRenderer implements EdenRenderer {
  private svg: SVGSVGElement; private parts: ProfileSvgParts; private release: () => void; private random: () => number;
  private frame: number | undefined; private previous = 0; private elapsed = 0; private nextBlink: number; private blinkStart = -100;
  private paused = true; private reduced = false; private visible = true; private disposed = false; private frames = 0;
  private state: EdenState = 'idle'; private audioLevel = 0;
  private expression = { tilt: new Spring(0), y: new Spring(0), gazeX: new Spring(0), gazeY: new Spring(0), lids: new Spring(0) };
  private amplitude = new Spring(0);
  private mouthEnvelope = new ProfileSpeechEnvelope();
  private browLeft = new Spring(0); private browRight = new Spring(0);
  private observer: IntersectionObserver | undefined;
  constructor(svg: SVGSVGElement, parts: ProfileSvgParts, release: () => void, random = Math.random) {
    this.svg = svg; this.parts = parts; this.release = release; this.random = random; this.nextBlink = 1.4 + random() * .9;
    if (typeof IntersectionObserver !== 'undefined') { this.observer = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting === true; this.schedule(); }); this.observer.observe(svg); }
    document.addEventListener('visibilitychange', this.visibility); this.paint(0, 0);
  }
  private visibility = () => this.schedule();
  private stop() { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; this.previous = 0; }
  private schedule() {
    this.stop();
    if (!this.disposed && !this.paused && !this.reduced && this.visible && !document.hidden) this.frame = requestAnimationFrame(this.render);
  }
  private clearAudio() { this.audioLevel = 0; this.amplitude.snap(0); this.mouthEnvelope.reset(); if(this.paused||this.reduced||this.state==='idle'){this.browLeft.snap(0);this.browRight.snap(0);} this.paintMouth(); this.paintBrows(); }
  private paintBrows() {
    const n=this.parts,left=clamp(this.browLeft.value,-.7,0),right=clamp(this.browRight.value,-.6,0);
    const active=!this.reduced&&!this.paused&&(Math.abs(left)>.008||Math.abs(right)>.008)&&Boolean(n.browSkin&&n.browLeft&&n.browRight&&n.browFringe);
    for(const part of[n.browSkin,n.browLeft,n.browRight,n.browFringe])part?.setAttribute('opacity',active?'1':'0');
    n.browLeft?.setAttribute('transform',`translate(0 ${active?left:0})`); n.browRight?.setAttribute('transform',`translate(0 ${active?right:0})`);
    this.svg.dataset.profileBrows=active?'active':'rest'; this.svg.dataset.profileBrowLift=active?`${left.toFixed(3)},${right.toFixed(3)}`:'0.000,0.000';
  }
  private paintMouth() {
    const n = this.parts;
    const active = !this.reduced && !this.paused && this.state === 'speaking' && this.audioLevel > 0 && this.mouthEnvelope.active && Boolean(n.headRest && n.headSpeaking && n.mouth);
    n.headRest?.setAttribute('opacity',active?'0':'1'); n.headSpeaking?.setAttribute('opacity',active?'1':'0'); n.mouth?.setAttribute('opacity',active?'1':'0');
    const geometry = profileOpennessGeometry(active?this.mouthEnvelope.value:0);
    n.mouthCavity?.setAttribute('d',geometry.outer); n.mouthOutline?.setAttribute('d',geometry.outer); n.mouthClip?.setAttribute('d',geometry.outer);
    n.mouthTeeth?.setAttribute('d',geometry.teeth); n.mouthTeeth?.setAttribute('opacity',String(geometry.teethOpacity));
    n.mouthTongue?.setAttribute('d',geometry.tongue);
    this.svg.dataset.profileMouth = active?'speaking':'rest'; this.svg.dataset.profileMouthPose = active?geometry.name:'rest';
    this.svg.dataset.profileAudioLevel = this.audioLevel.toFixed(3); this.svg.dataset.profileMouthBlend = active?this.mouthEnvelope.value.toFixed(3):'0.000';
  }
  private paint(seconds: number, closure: number) {
    const p = profileIdlePose(seconds, this.reduced), n = this.parts, e = this.expression;
    const audio = this.reduced ? 0 : this.amplitude.value;
    const headRotation = clamp(p.headRotation + e.tilt.value, -1, 1);
    const headY = clamp(p.headY + e.y.value - audio * .10, -.75, .75);
    const gazeX = clamp(p.gazeX + e.gazeX.value, -1.4, 1.4), gazeY = clamp(p.gazeY + e.gazeY.value, -.6, 0);
    closure = clamp(closure + e.lids.value * (1 - closure), 0, 1);
    n.head.setAttribute('transform', `translate(${151+p.headX} ${214+headY}) rotate(${headRotation})`);
    n.body.setAttribute('transform', `translate(143 282) scale(1 ${p.bodyScale})`);
    n.hair.setAttribute('transform', `translate(140 94) rotate(${p.hairRotation})`);
    n.leftHoop.setAttribute('transform', `translate(108 163) rotate(${clamp(p.leftHoop + audio * .10, -1, 1)})`);
    n.rightHoop.setAttribute('transform', `translate(200 164) rotate(${clamp(p.rightHoop - audio * .09, -1, 1)})`);
    n.leftGaze.setAttribute('transform', `translate(${gazeX} ${gazeY})`); n.rightGaze.setAttribute('transform', `translate(${gazeX} ${gazeY})`);
    n.leftAperture.setAttribute('y', String(127+10*closure)); n.rightAperture.setAttribute('y', String(126+10*closure));
    n.leftAperture.setAttribute('height', String(20*(1-closure))); n.rightAperture.setAttribute('height', String(20*(1-closure)));
    n.leftLid.setAttribute('opacity', String(closure)); n.rightLid.setAttribute('opacity', String(closure));
    this.paintMouth();
    this.paintBrows();
    this.svg.dataset.profileFrames = String(this.frames); this.svg.dataset.profileBlink = closure > .05 ? 'active' : 'rest';
  }
  private render = (now: number) => {
    this.frame = undefined;
    if (this.disposed || this.paused || this.reduced || !this.visible || document.hidden) { this.previous = 0; return; }
    const dt = this.previous ? Math.min(.05, Math.max(0, (now-this.previous)/1000)) : 0;
    this.elapsed += dt;
    this.previous = now;
    const target = EXPRESSIONS[this.state];
    for (const key of Object.keys(this.expression) as (keyof Expression)[]) this.expression[key].step(target[key], dt, 11);
    this.amplitude.step(this.state === 'speaking' ? this.audioLevel : 0, dt, 20);
    this.mouthEnvelope.step(this.state === 'speaking'?this.audioLevel:0,dt);
    const brows=profileBrowTarget(this.state,this.audioLevel); this.browLeft.step(brows[0],dt,12); this.browRight.step(brows[1],dt,12);
    if (this.elapsed >= this.nextBlink) { this.blinkStart = this.elapsed; this.nextBlink = this.elapsed + 3 + this.random()*4; }
    this.frames++; this.paint(this.elapsed, blinkClosure(this.elapsed-this.blinkStart)); this.frame = requestAnimationFrame(this.render);
  };
  setState(state: EdenState) {
    if (this.disposed || !EDEN_STATES.includes(state) || state === this.state) return;
    this.state = state; this.clearAudio();
  }
  setAudioLevel(level: number) {
    if (this.disposed) return;
    this.audioLevel = this.state === 'speaking' && !this.reduced && !this.paused && Number.isFinite(level) ? clamp(level, 0, 1) : 0;
    if (this.audioLevel === 0) { this.mouthEnvelope.reset(); this.paintMouth(); }
  }
  setPaused(value: boolean) { if (this.disposed) return; this.paused = value; if (value) this.clearAudio(); this.schedule(); }
  setReducedMotion(value: boolean) {
    if (this.disposed) return; this.reduced = value;
    if (value) { this.clearAudio(); for (const spring of Object.values(this.expression)) spring.snap(0); this.blinkStart = -100; this.paint(0, 0); }
    this.schedule();
  }
  blink() { if (this.disposed || this.paused || this.reduced || document.hidden || !this.visible) return; this.blinkStart = this.elapsed; this.nextBlink = this.elapsed + 3 + this.random()*4; this.schedule(); }
  dispose() { if (this.disposed) return; this.disposed = true; this.stop(); this.observer?.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.svg.remove(); this.release(); }
}
function node<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string,string|number> = {}) {
  const value = document.createElementNS(NS, tag);
  for (const [key,item] of Object.entries(attributes)) value.setAttribute(key, String(item));
  return value;
}
async function decodeImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  const image = new Image(); image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); image.src = ''; reject(new DOMException('Interrupted', 'AbortError')); };
    image.onload = () => { void image.decode().then(() => { cleanup(); resolve(); }, () => { cleanup(); reject(new Error('Portrait unavailable.')); }); };
    image.onerror = () => { cleanup(); reject(new Error('Portrait unavailable.')); };
    signal.addEventListener('abort', cancel, { once: true }); image.src = url; if (signal.aborted) cancel();
  });
  return image;
}
type ProfileLayers = ReadonlyMap<(typeof ASSETS)[number], Blob>;
async function readProfileLayers(): Promise<ProfileLayers> {
  const loading = new AbortController(), signal = AbortSignal.any([loading.signal, AbortSignal.timeout(30_000)]);
  try {
    return new Map(await Promise.all(ASSETS.map(async name => {
      const response = await fetch(`/assets/eden/approved-profile/layers/${name}.png`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'force-cache' });
      if (!response.ok) throw new Error('Portrait unavailable.');
      const blob = await response.blob(); signal.throwIfAborted();
      if (blob.size > 1024 * 1024) throw new Error('Portrait unavailable.');
      return [name, blob] as const;
    })));
  } catch (error) { loading.abort(); throw error; }
}
/** Consumer cancellation must not cancel another portrait's shared download. */
function waitForLayers(layers: Promise<ProfileLayers>, signal: AbortSignal): Promise<ProfileLayers> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
    void layers.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) cancel();
  });
}
/** One fixed, at-most-fifteen-Blob cache per page; no consumer/user data is cached.
 * A factory also gives isolated mounts/tests their own bounded asset cache.
 */
export function createProfileSvgLoader() {
  let cached: Promise<ProfileLayers> | undefined;
  return (host: HTMLElement, signal: AbortSignal) => loadProfileSvgFromLayers(host, signal, () => {
    if (!cached) {
      const pending = readProfileLayers(); cached = pending;
      void pending.catch(() => { if (cached === pending) cached = undefined; });
    }
    return cached;
  });
}
/** Preloads/decodes all original PNG layers before adding a hidden, ready SVG.
 * This is a source-owned SVG animation, independent of the preserved Rive export.
 */
async function loadProfileSvgFromLayers(host: HTMLElement, signal: AbortSignal, readLayers: () => Promise<ProfileLayers>): Promise<{svg: SVGSVGElement; renderer: EdenRenderer}> {
  signal.throwIfAborted();
  const loading = new AbortController(), combined = AbortSignal.any([signal, loading.signal, AbortSignal.timeout(30_000)]);
  const urls = new Map<string,string>(), images: HTMLImageElement[] = [];
  let createdSvg: SVGSVGElement | undefined;
  const release = () => { for (const image of images) image.src = ''; for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  try {
    const layers = await waitForLayers(readLayers(), combined);
    await Promise.all(ASSETS.map(async name => {
      const blob = layers.get(name)!; combined.throwIfAborted();
      const url = URL.createObjectURL(blob); urls.set(name, url); const decoded = await decodeImage(url, combined);
      if (combined.aborted) { decoded.src = ''; combined.throwIfAborted(); }
      images.push(decoded);
    }));
    combined.throwIfAborted();
    if (!host.isConnected) throw new Error('Portrait unavailable.');
    const prefix = `eden-profile-${crypto.randomUUID()}-`, svg = node('svg', {viewBox:'0 0 282 282',width:282,height:282,'aria-hidden':'true',focusable:'false'});
    createdSvg = svg; svg.style.visibility = 'hidden';
    const defs = node('defs'); svg.append(defs);
    const image = (name: string) => node('image', {href:urls.get(name)!,x:0,y:0,width:282,height:282});
    const group = (x:number,y:number) => { const outer=node('g',{transform:`translate(${x} ${y})`}),inner=node('g',{transform:`translate(${-x} ${-y})`});outer.append(inner);return{outer,inner}; };
    const clip = (name:string,x:number,y:number,width:number,height:number) => { const path=node('clipPath',{id:prefix+name,clipPathUnits:'userSpaceOnUse'}),rect=node('rect',{x,y,width,height});path.append(rect);defs.append(path);return{group:node('g',{'clip-path':`url(#${prefix+name})`}),rect}; };
    const body=group(143,282),head=group(151,214),hair=group(140,94),leftHoop=group(108,163),rightHoop=group(200,164);
    body.inner.append(image('body'));hair.inner.append(image('hair-front'));leftHoop.inner.append(image('earring-left'));rightHoop.inner.append(image('earring-right'));
    const eye = (side:'left'|'right',x:number,y:number,width:number,px:number,py:number,pw:number,ph:number) => {
      const aperture=clip(side+'-aperture',x,y,width,20),pupil=clip(side+'-pupil',px,py,pw,ph),gaze=node('g');gaze.append(image('eye-'+side));pupil.group.append(gaze);
      aperture.group.append(pupil.group,image('lash-'+side));return{aperture:aperture.rect,group:aperture.group,gaze};
    };
    const left=eye('left',131,127,31,140,133,22,14),right=eye('right',175,126,26,176,132,19,15);
    const leftLid=node('path',{d:'M133.8 136 C140.5 140 151.5 140 158 135.8',fill:'none',stroke:'#17120e','stroke-width':1.5,'stroke-linecap':'round',opacity:0});
    const rightLid=node('path',{d:'M177.7 135 C183.5 139 191.5 139 197 134.5',fill:'none',stroke:'#17120e','stroke-width':1.5,'stroke-linecap':'round',opacity:0});
    const headRest=image('head'),headSpeaking=image('head-speaking'),mouth=node('g'),mouthClip=node('path'),mouthClipPath=node('clipPath',{id:prefix+'mouth',clipPathUnits:'userSpaceOnUse'});
    mouthClipPath.append(mouthClip);defs.append(mouthClipPath);
    // Colors are sampled from the approved mouth pixels, not generated art.
    const mouthCavity=node('path',{fill:'#802118'}),mouthTeeth=node('path',{fill:'#fefdfd'}),mouthTongue=node('path',{fill:'#b73a2a'}),mouthOutline=node('path',{fill:'none',stroke:'#772119','stroke-width':1.1,'stroke-linejoin':'round','stroke-linecap':'round'});
    const mouthInside=node('g',{'clip-path':`url(#${prefix}mouth)`});mouthInside.append(mouthCavity,mouthTeeth,mouthTongue);mouth.append(mouthInside,mouthOutline);
    const browSkin=image('brow-skin'),browLeft=node('g'),browRight=node('g'),browFringe=image('brow-fringe');browLeft.append(image('brow-left'));browRight.append(image('brow-right'));
    head.inner.append(headRest,headSpeaking,browSkin,browLeft,browRight,browFringe,mouth,left.group,right.group,leftLid,rightLid,hair.outer,leftHoop.outer,rightHoop.outer);
    svg.append(image('background'),body.outer,head.outer); host.append(svg);
    const parts:ProfileSvgParts={head:head.outer,body:body.outer,hair:hair.outer,leftHoop:leftHoop.outer,rightHoop:rightHoop.outer,leftGaze:left.gaze,rightGaze:right.gaze,leftAperture:left.aperture,rightAperture:right.aperture,leftLid,rightLid,headRest,headSpeaking,mouth,mouthCavity,mouthTeeth,mouthTongue,mouthOutline,mouthClip,browSkin,browLeft,browRight,browFringe};
    const renderer=new ProfileSvgRenderer(svg,parts,release);
    return{svg,renderer};
  } catch {
    loading.abort(); createdSvg?.remove(); release(); throw new Error('Portrait unavailable.');
  }
}
export const loadProfileSvg = createProfileSvgLoader();
