import type { EdenRenderer, EdenState, EdenMouthPose } from '../types/eden.ts';
import { blinkClosure, EXPRESSION, mouthAt, MOUTH_POSES, Spring } from './motion.ts';
let svgInstance=0;
/** Faithful contour/raster preview; deliberately identified as SVG, not a .riv runtime. */
export class EdenSvgRenderer implements EdenRenderer {
  private state: EdenState = 'idle';
  private level = 0;
  private reduced = false;
  private paused = false;
  private disposed = false;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private stateTime = 0;
  private nextBlink = 2.1 + Math.random() * 3;
  private blinkStart = -100;
  private lastGaze = 0;
  private nextGaze = 2;
  private targetGaze = 0;
  private forcedMouth: EdenMouthPose | null = null;
  private springs = { tilt: new Spring(0), y: new Spring(0), brow: new Spring(0), gaze: new Spring(0), width: new Spring(1.03), open: new Spring(.78), teeth: new Spring(1) };
  private nodes = new Map<string, SVGElement>();
  private visible = true;
  private observer: IntersectionObserver;
  constructor(private svg: SVGSVGElement) {
    svg.querySelectorAll<SVGElement>('[id]').forEach(node => this.nodes.set(node.id, node));
    // The hero and guide can display this same approved rig at once. Inline SVG
    // IDs share the document namespace; scope paint references per instance so
    // a hidden/offscreen portrait cannot supply another portrait's clip paths.
    const prefix=`eden-rig-${++svgInstance}-`,ids=new Map<string,string>();
    for(const [id,node]of this.nodes){const scoped=prefix+id;ids.set(id,scoped);node.id=scoped;}
    svg.querySelectorAll<SVGElement>('*').forEach(node=>{
      for(const attribute of Array.from(node.attributes)){
        let value=attribute.value.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g,(match,id:string)=>ids.has(id)?`url(#${ids.get(id)})`:match);
        if((attribute.localName==='href')&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
        if(attribute.name==='aria-labelledby'||attribute.name==='aria-describedby')value=value.split(/\s+/).map(id=>ids.get(id)??id).join(' ');
        if(value!==attribute.value)node.setAttributeNS(attribute.namespaceURI,attribute.name,value);
      }
    });
    this.observer = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? true; this.schedule(); });
    this.observer.observe(svg);
    document.addEventListener('visibilitychange', this.visibility);
    this.schedule();
  }
  private visibility = () => this.schedule();
  private node(id: string) { const node = this.nodes.get(id); if (!node) throw new Error(`Missing rig layer: ${id}`); return node; }
  private transform(id: string, dx = 0, dy = 0, angle = 0, sx = 1, sy = 1) {
    const node = this.node(id), [x, y] = (node.dataset.pivot ?? '0 0').split(' ').map(Number);
    node.setAttribute('transform', `translate(${x + dx} ${y + dy}) rotate(${angle}) scale(${sx} ${sy})`);
  }
  setState(state: EdenState) { this.state = state; this.stateTime = 0; this.forcedMouth = null; this.schedule(); }
  setAudioLevel(level: number) { this.level = level; this.forcedMouth = null; this.schedule(); }
  setReducedMotion(reduced: boolean) { this.reduced = reduced; this.blinkStart = -100; this.schedule(); }
  setPaused(paused: boolean) { this.paused = paused; this.previous = 0; this.schedule(); }
  setMouthPose(pose: EdenMouthPose | null) { this.forcedMouth = pose; this.schedule(); }
  blink() { if (!this.reduced) { this.blinkStart = this.elapsed; this.schedule(); } }
  private schedule() {
    if (this.disposed) return;
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (document.hidden || !this.visible || this.paused) { this.previous = 0; return; }
    this.frame = requestAnimationFrame(this.render);
  }
  private render = (timestamp: number) => {
    const dt = this.previous ? Math.min((timestamp - this.previous) / 1000, .05) : 1 / 60;
    this.previous = timestamp; this.elapsed += dt; this.stateTime += dt;
    const e = EXPRESSION[this.state], t = this.elapsed;
    if (t >= this.nextBlink && !this.reduced) { this.blinkStart = t; this.nextBlink = t + 2.8 + Math.random() * 5.8; }
    if (t >= this.nextGaze) { this.lastGaze = this.targetGaze; this.targetGaze = (Math.random() - .5) * 3; this.nextGaze = t + 2.1 + Math.random() * 3.7; }
    const activity = this.state === 'searching' ? Math.sin(t * .68) * 2.8 : this.targetGaze * .45 + this.lastGaze * .05;
    const nod = this.state === 'success' ? Math.sin(Math.min(1, this.stateTime / 1.2) * Math.PI) * 4 : 0;
    const conversational = this.state === 'speaking' ? Math.sin(t * 1.7) * .12 : 0;
    const targetMouth = this.forcedMouth ? MOUTH_POSES[this.forcedMouth] : mouthAt(this.state === 'speaking' ? (this.reduced ? 0 : this.level) : e.mouth);
    const targets = { tilt: e.tilt + (this.reduced ? 0 : Math.sin(t * .43) * .08 + conversational), y: e.y + (this.reduced ? 0 : nod), brow: e.brow, gaze: e.gaze + (this.reduced ? 0 : activity), ...targetMouth };
    const values = {} as Record<keyof typeof this.springs, number>;
    for (const k of Object.keys(this.springs) as (keyof typeof this.springs)[]) {
      if (this.reduced) this.springs[k].snap(targets[k]);
      values[k] = this.springs[k].step(targets[k], dt, k === 'open' || k === 'width' ? 24 : 13);
    }
    this.transform('head', 0, values.y, values.tilt);
    this.transform('body', 0, 0, 0, 1, this.reduced ? 1 : 1 + Math.sin(t * 1.12) * .0013);
    this.transform('leftLongHair', 0, 0, this.reduced ? 0 : Math.sin(t * .55) * .06);
    this.transform('rightLongHair', 0, 0, this.reduced ? 0 : -Math.sin(t * .55) * .05);
    this.transform('frontHairLeft', 0, 0, this.reduced ? 0 : -values.tilt * .035);
    this.transform('frontHairRight', 0, 0, this.reduced ? 0 : -values.tilt * .025);
    for (const side of ['left', 'right']) {
      this.transform(`${side}Brow`, 0, values.brow * (side === 'right' ? .65 : 1));
      this.transform(`${side}Pupil`, values.gaze, 0);
      this.transform(`${side}Earring`, 0, 0, this.reduced ? 0 : -values.tilt * .18 + Math.sin(t * .7) * .10);
    }
    const blink = this.reduced ? 0 : blinkClosure(t - this.blinkStart);
    for (const side of ['left', 'right']) {
      this.node(`${side}Aperture`).setAttribute('height', String(92 - blink * 92));
      this.node(`${side}Lid`).setAttribute('opacity', String(Math.max(0, (blink - .65) / .35)));
    }
    this.transform('mouth', 0, 0, 0, values.width, values.open);
    this.node('mouthTeeth').setAttribute('opacity', String(values.teeth));
    this.node('mouthTongue').setAttribute('opacity', String(values.open < .06 ? 0 : 1));
    this.svg.dataset.state = this.state;
    this.svg.dataset.audioLevel = this.level.toFixed(3);
    this.svg.dataset.blink = blink.toFixed(3);
    this.svg.dataset.reducedMotion = String(this.reduced);
    this.frame = 0;
    if (!this.reduced) this.schedule();
  };
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); document.removeEventListener('visibilitychange', this.visibility); }
}
