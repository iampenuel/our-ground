import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdenLauncherPortraitMount } from '../src/eden/runtime/launcher.ts';

function platform() {
  const names = ['document','window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  class Element {
    children = []; parent = null; dataset = {}; style = {}; hidden = false; isConnected = true; attributes = new Map();
    querySelector(selector) { return selector === 'img' ? this.children.find(node => node.tag === 'img') ?? null : null; }
    append(node) { node.parent = this; this.children.push(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; this.isConnected = false; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    toggleAttribute(name, on) { if (on) this.attributes.set(name, ''); else this.attributes.delete(name); }
  }
  const domListeners = new Map(), windowListeners = new Map(), frames = new Map(), observers = [];
  const target = listeners => ({
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  });
  let focused = true, nextFrame = 0;
  const document = { ...target(domListeners), hidden: false, hasFocus: () => focused, createElement(tag) { const node = new Element(); node.tag = tag; return node; } };
  const window = target(windowListeners);
  const IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(host) { this.host = host; }
    disconnect() { this.disconnected = true; }
    show(value) { this.callback([{ isIntersecting: value }]); }
  };
  const values = { document, window, IntersectionObserver,
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  for (const [name,value] of Object.entries(values)) Object.defineProperty(globalThis,name,{configurable:true,value});
  const host = new Element(), image = new Element(); image.tag = 'img'; host.append(image);
  const emit = (listeners, event) => [...(listeners.get(event) ?? [])].forEach(fn => fn());
  return { host,image,document,window,frames,observers,domListeners,windowListeners,
    node: () => new Element(),
    blur() { focused = false; emit(windowListeners, 'blur'); }, focus() { focused = true; emit(windowListeners, 'focus'); },
    visibility(hidden) { document.hidden = hidden; emit(domListeners, 'visibilitychange'); },
    tick(now) { const scheduled = [...frames.values()]; frames.clear(); scheduled.forEach(fn => fn(now)); },
    restore() { for (const name of names) { const value = original.get(name); if (value) Object.defineProperty(globalThis,name,value); else delete globalThis[name]; } },
  };
}
function renderer() {
  const calls = [];
  const value = Object.fromEntries(['setState','setAudioLevel','setReducedMotion','setPaused','dispose'].map(name => [name, arg => calls.push([name,arg])]));
  return { value,calls };
}

test('shared portrait keeps controller state while loading and never reloads for state or pause changes', async () => {
  const env = platform();
  try {
    const rig = renderer(), svg = env.node(); let finish, loads = 0;
    const loading = new Promise(resolve => { finish = resolve; });
    const mount = createEdenLauncherPortraitMount({ loadProfile: async host => { loads++; await loading; host.append(svg); return { svg, renderer: rig.value }; } });
    const handle = await mount(env.host, { nativeRive: false, profile: true, reducedMotion: false, paused: true });
    handle.setState('speaking'); handle.setAudioLevel(.35);
    finish(); assert.equal(await handle.ready, 'svg-profile');
    assert.ok(rig.calls.some(([name,value]) => name === 'setState' && value === 'speaking'));
    assert.ok(rig.calls.some(([name,value]) => name === 'setAudioLevel' && value === .35));
    handle.setPaused(false); handle.setState('thinking'); handle.setAudioLevel(0); handle.setPaused(true); handle.setPaused(false);
    assert.equal(loads, 1); assert.equal(env.host.children.filter(node => node === svg).length, 1);
    handle.dispose(); assert.equal(rig.calls.filter(([name]) => name === 'dispose').length, 1);
  } finally { env.restore(); }
});

test('launcher reuses idle rig and stops motion for panel, offscreen, inactive document and reduced motion', async () => {
  const env = platform();
  try {
    const rig = renderer();
    const mount = createEdenLauncherPortraitMount({ loadNative: async canvas => { assert.equal(canvas.style.visibility,'hidden'); return rig.value; } });
    const handle = await mount(env.host,{nativeRive:true,reducedMotion:false});
    assert.equal(await handle.ready,'rive');
    assert.ok(rig.calls.some(([name,value]) => name === 'setState' && value === 'idle'));
    // Keep the original portrait while not yet intersecting or painted.
    assert.equal(env.image.hidden,false); assert.equal(env.frames.size,0);
    const canvas = env.host.children.find(node => node.tag === 'canvas');
    assert.equal(canvas.style.visibility,'hidden');
    env.observers[0].show(true); env.tick(1000);
    assert.equal(canvas.style.visibility,'hidden'); assert.equal(env.image.hidden,false);
    env.tick(1016);
    assert.equal(canvas.style.visibility,'visible'); assert.equal(env.image.hidden,true); assert.equal(env.frames.size,1);
    assert.ok(Math.abs(parseFloat(canvas.style.rotate)) <= .16);
    handle.setPaused(true); assert.equal(env.frames.size,0); assert.deepEqual(rig.calls.at(-1),['setPaused',true]);
    handle.setPaused(false); assert.equal(env.frames.size,1);
    env.observers[0].show(false); assert.equal(env.frames.size,0);
    env.observers[0].show(true); env.blur(); assert.equal(env.frames.size,0);
    env.focus(); env.visibility(true); assert.equal(env.frames.size,0);
    env.visibility(false); assert.equal(env.frames.size,1);
    handle.setReducedMotion(true); assert.equal(env.frames.size,0); assert.equal(env.image.hidden,false); assert.equal(canvas.attributes.has('hidden'),true);
    handle.dispose(); handle.dispose();
    assert.equal(rig.calls.filter(([name]) => name === 'dispose').length,1);
    assert.equal(env.host.children.length,1); assert.equal(env.image.hidden,false);
    assert.equal(env.observers[0].disconnected,true);
    assert.ok([...env.domListeners.values(),...env.windowListeners.values()].every(set => set.size === 0));
  } finally { env.restore(); }
});

test('production-style launcher skips native runtime and safely falls back to SVG or approved static image', async () => {
  const env = platform();
  try {
    let nativeCalls = 0;
    const rig = renderer(), svg = env.node();
    const mount = createEdenLauncherPortraitMount({ loadNative: async () => { nativeCalls++; return rig.value; }, loadSvg: async () => svg, createSvgRenderer: () => rig.value });
    const handle = await mount(env.host,{nativeRive:false,reducedMotion:true});
    assert.equal(await handle.ready,'svg'); assert.equal(nativeCalls,0);
    assert.equal(env.image.hidden,false); assert.equal(env.frames.size,0);
    assert.equal(svg.attributes.get('aria-hidden'),'true'); assert.equal(svg.style.visibility,'hidden');
    handle.dispose();
    const failed = createEdenLauncherPortraitMount({ loadSvg: async () => { throw new Error('Unavailable'); } });
    const fallback = await failed(env.host,{nativeRive:false,reducedMotion:false});
    assert.equal(await fallback.ready,'static'); assert.equal(env.image.hidden,false); assert.equal(env.host.children.length,1);
    fallback.dispose();
  } finally { env.restore(); }
});

test('native failure uses the same SVG rig and disposal prevents a late load from resurrecting animation', async () => {
  const env = platform();
  try {
    const rig = renderer(); let finish, nativeSignal;
    const pending = new Promise(resolve => { finish = resolve; });
    const mount = createEdenLauncherPortraitMount({ loadNative: async (_canvas, signal) => { nativeSignal = signal; await pending; return rig.value; } });
    const handle = await mount(env.host,{nativeRive:true,reducedMotion:false});
    handle.dispose(); assert.equal(nativeSignal.aborted,true); assert.equal(env.host.children.length,1);
    finish(); assert.equal(await handle.ready,'static');
    assert.equal(rig.calls.filter(([name]) => name === 'dispose').length,1); assert.equal(env.frames.size,0);
    const fallbackRig = renderer(); let svgLoads = 0;
    const fallback = createEdenLauncherPortraitMount({ loadNative: async () => { throw new Error('WASM unavailable'); }, loadSvg: async () => { svgLoads++; return env.node(); }, createSvgRenderer: () => fallbackRig.value });
    const alternate = await fallback(env.host,{nativeRive:true,reducedMotion:false,paused:true});
    assert.equal(await alternate.ready,'svg'); assert.equal(svgLoads,1); assert.equal(env.frames.size,0);
    alternate.dispose();
  } finally { env.restore(); }
});

test('approved profile uses source-owned SVG features without native/older-face loading or early reveal', async () => {
  const env = platform();
  try {
    const rig = renderer(); let nativeCalls = 0, oldSvgCalls = 0, profileCalls = 0;
    const forbidden = {
      loadNative: async () => { nativeCalls++; return rig.value; },
      loadSvg: async () => { oldSvgCalls++; return env.node(); },
    };
    const svg = env.node(); svg.style.visibility = 'hidden';
    const mount = createEdenLauncherPortraitMount({ ...forbidden, loadProfile: async host => { profileCalls++; host.append(svg); return { svg, renderer: rig.value }; } });
    const handle = await mount(env.host, { nativeRive: true, reducedMotion: false, profile: true });
    assert.equal(await handle.ready, 'svg-profile'); assert.equal(profileCalls, 1);
    assert.equal(nativeCalls, 0); assert.equal(oldSvgCalls, 0);
    assert.equal(env.image.hidden, false); assert.equal(svg.style.visibility, 'hidden');
    env.observers[0].show(true); env.tick(1000);
    assert.equal(env.image.hidden, false); assert.equal(svg.style.visibility, 'hidden');
    env.tick(1016);
    assert.equal(env.image.hidden, true); assert.equal(svg.style.visibility, 'visible');
    assert.equal(svg.style.rotate, undefined); // The actual feature groups own motion.
    handle.setReducedMotion(true); assert.equal(env.image.hidden, false); assert.equal(env.frames.size, 0);
    assert.equal(svg.attributes.has('hidden'), true); handle.dispose();
    const failed = createEdenLauncherPortraitMount({ ...forbidden, loadProfile: async () => { throw new Error('Unavailable'); } });
    const fallback = await failed(env.host, { nativeRive: true, reducedMotion: false, profile: true });
    assert.equal(await fallback.ready, 'static'); assert.equal(env.image.hidden, false); assert.equal(env.host.children.length, 1); fallback.dispose();
    let finish, profileSignal; const pending = new Promise(resolve => { finish = resolve; }); const lateRig = renderer();
    const late = createEdenLauncherPortraitMount({ ...forbidden, loadProfile: async (host, signal) => {
      profileSignal = signal; await pending; const lateSvg = env.node(); lateSvg.style.visibility = 'hidden'; host.append(lateSvg); return { svg: lateSvg, renderer: lateRig.value };
    } });
    const cancelled = await late(env.host, { nativeRive: true, reducedMotion: false, profile: true });
    cancelled.dispose(); assert.equal(profileSignal.aborted, true); finish();
    assert.equal(await cancelled.ready, 'static'); assert.equal(env.host.children.length, 1); assert.equal(env.image.hidden, false);
    assert.equal(lateRig.calls.filter(([name]) => name === 'dispose').length, 1);
    assert.equal(nativeCalls, 0); assert.equal(oldSvgCalls, 0); assert.equal(env.frames.size, 0);
  } finally { env.restore(); }
});
