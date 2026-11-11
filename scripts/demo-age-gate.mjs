import './check-node.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import { handleApi } from '../backend/app.ts';
import { DemoRepository } from '../backend/demo.ts';
import { browserSecurityHeaders } from '../shared/security-headers.ts';
import { normalizeEdenCityId } from '../shared/eden-assistant.ts';
import { startAgeGateServer } from '../tests/support/age-gate-server.mjs';

const { values: options } = parseArgs({ options: {
  scenario: { type: 'string', default: 'all' },
  verify: { type: 'boolean' },
  headed: { type: 'boolean' },
  screenshots: { type: 'string' },
  help: { type: 'boolean' },
} });
if (options.help) {
  console.log('npm run demo:age-gate -- [--scenario=all|first-visit|denied|adult] [--verify [--headed] [--screenshots=DIR]]');
  process.exit(0);
}
if (!['all', 'first-visit', 'denied', 'adult'].includes(options.scenario)) throw Error('Choose all, first-visit, denied, or adult.');
if (options.verify && options.scenario !== 'all') throw Error('--verify exercises all scenarios.');
if (options.screenshots && !options.verify) throw Error('--screenshots requires --verify.');
if (!options.verify && !process.stdin.isTTY) throw Error('Run the presentation from an interactive terminal, or use --verify.');

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'our-ground-age-gate-')));
const site = join(temporary, 'site');
const output = options.screenshots ? resolve(options.screenshots) : null;
const ageTitle = 'Age confirmation';
const denialTitle = 'Our Ground is for adults 19 and older';
const sampleSearch = '/support?mode=demo&location=Harrisburg%2C%20PA&category=food&view=list';
const readRoutes = new Set(['/api/v1/resources', '/api/v1/places/resolve', '/api/v1/locations/status', '/api/v1/geoapify/status']);
const pages = new Set(['/', '/support', '/give', '/organizations', '/about', '/privacy']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.riv': 'application/octet-stream' };
const headers = { ...browserSecurityHeaders(), 'Cache-Control': 'no-store' };
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/connect-src [^;]+/, "connect-src 'self'");
const places = {
  'harrisburg-pa': { label: 'Harrisburg, PA', city: 'Harrisburg', state: 'PA', latitude: 40.2732, longitude: -76.8867 },
  'philadelphia-pa': { label: 'Philadelphia, PA', city: 'Philadelphia', state: 'PA', latitude: 39.9526, longitude: -75.1636 },
};
const directory = {
  repo: new DemoRepository(), allowDemo: true, realDirectoryConfigured: false,
  verifyToken: async () => null,
  resolvePlace: async query => places[normalizeEdenCityId(query)] ?? null,
};
async function serve(request) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  if (readRoutes.has(path)) return handleApi(request, directory);
  if (path.startsWith('/api/')) return Response.json({ error: { code: 'LOCAL_DEMO_UNAVAILABLE', message: 'This service is unavailable in the local demo.' } }, { status: 404 });
  try {
    const file = await realpath(resolve(site, pages.has(path) ? 'index.html' : '.' + decodeURIComponent(path)));
    const contentType = mime[extname(file)];
    if (file.startsWith(site + sep) && contentType)
      return new Response(await readFile(file), { headers: { ...headers, 'Content-Type': contentType } });
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) && !(error instanceof URIError)) throw error;
  }
  return new Response('This page is unavailable in the local demo.', { status: 404, headers });
}

let browser, server, terminal;
const cancellation = new AbortController();
function stop() {
  cancellation.abort();
  terminal?.close();
  void browser?.close().catch(() => {});
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

async function fresh(viewport) {
  const context = await browser.newContext({ viewport: viewport ?? null, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage();
  assert.equal((await page.goto(server.origin)).status(), 200);
  await page.getByRole('heading', { name: ageTitle, exact: true }).waitFor();
  await page.locator('.preview img').evaluate(image => image.decode());
  await page.bringToFront();
  return { context, page };
}
async function eligibility(context) {
  const response = await context.request.get(server.origin + '/eligibility', { headers: { Accept: 'application/json' } });
  assert.equal(response.status(), 200);
  return response.json();
}
async function capture(page, name) {
  if (output) await page.screenshot({ path: join(output, name + '.jpg'), type: 'jpeg', quality: 86, fullPage: true });
}
async function decide(page, adult) {
  const post = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/eligibility');
  await page.getByRole('button', { name: adult ? "I'm 19 or older" : "I'm under 19", exact: true }).click();
  assert.equal((await post).status(), adult ? 303 : 403);
  await page.getByRole('heading', { name: adult ? 'Stronger communities grow here.' : denialTitle, exact: true }).waitFor();
}
async function verify() {
  if (output) await mkdir(output, { recursive: true });
  const a = await fresh({ width: 1440, height: 900 });
  assert.deepEqual(await eligibility(a.context), { eligible: false, denied: false });
  await capture(a.page, 'first-visit');
  await decide(a.page, false);
  assert.equal((await a.page.reload()).status(), 403);
  assert.equal((await a.page.goto(server.origin + sampleSearch)).status(), 403);
  assert.equal((await a.context.request.get(server.origin + '/api/v1/resources')).status(), 403);
  await capture(a.page, 'under-19');
  await a.page.evaluate(() => {
    localStorage.setItem('age-demo-isolation-check', 'A');
    sessionStorage.setItem('age-demo-isolation-check', 'A');
  });

  const b = await fresh({ width: 1440, height: 900 });
  assert.deepEqual(await eligibility(b.context), { eligible: false, denied: false });
  assert.deepEqual(await b.context.cookies(), []);
  assert(await b.page.evaluate(() => localStorage.getItem('age-demo-isolation-check') === null && sessionStorage.getItem('age-demo-isolation-check') === null));
  await decide(b.page, true);
  assert.deepEqual(await eligibility(b.context), { eligible: true, denied: false });
  assert.equal((await b.context.request.get(server.origin + '/api/v1/eden/hosted/status')).status(), 404);
  await b.page.reload();
  await b.page.locator('#home-title').waitFor();
  assert.equal(await b.page.locator('.entrance').count(), 0);
  await b.page.locator('.og-hero-photo img').evaluate(image => image.decode());
  await capture(b.page, 'independent-adult');
  await b.page.goto(server.origin + sampleSearch);
  await b.page.getByText('Demo Community Pantry — fictional', { exact: true }).waitFor();
  assert.deepEqual(await eligibility(a.context), { eligible: false, denied: true });

  const mobile = await fresh({ width: 390, height: 844 });
  await capture(mobile.page, 'mobile-first-visit');
  await decide(mobile.page, false);
  await capture(mobile.page, 'mobile-under-19');
  console.log('PASS: first visit, persistent denial, isolated cookies and storage, independent adult entry, fictional directory search, mobile states.');
}
async function present() {
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.on('SIGINT', stop);
  terminal.once('close', () => cancellation.abort());
  browser.once('disconnected', () => { cancellation.abort(); terminal.close(); });
  const pause = message => terminal.question(message + '\nPress Enter when ready. ', { signal: cancellation.signal });
  if (options.scenario !== 'adult') {
    const a = await fresh();
    if (options.scenario === 'first-visit') {
      await pause('Fresh session. Tab through the age choices, Terms and Privacy. Leave the age decision blank.');
      return;
    }
    do {
      await pause("Session A. Choose “I'm under 19.” Try refreshing, opening Find Support at /support, or visiting Terms and Privacy.");
      if ((await eligibility(a.context)).denied) break;
      console.log('Session A has not recorded a denial. Use Ctrl+C to start a fresh run if you chose adult access.');
    } while (!cancellation.signal.aborted);
  }
  if (options.scenario === 'denied' || cancellation.signal.aborted) return;
  const b = await fresh();
  do {
    await pause("Session B is a fresh Chrome window. Choose “I'm 19 or older” and refresh the homepage to show that acknowledgment persists.");
    if ((await eligibility(b.context)).eligible) break;
    console.log('Session B has not recorded adult access. Use Ctrl+C to start a fresh run if you chose under 19.');
  } while (!cancellation.signal.aborted);
  if (!cancellation.signal.aborted) {
    await b.page.goto(server.origin + sampleSearch);
    await b.page.getByText('Demo Community Pantry — fictional', { exact: true }).waitFor();
    await pause('The directory is showing an existing fictional example. You can inspect it or return to the homepage.');
  }
}

try {
  const headless = Boolean(options.verify && !options.headed);
  browser = await chromium.launch({ channel: 'chrome', headless, args: ['--disable-background-networking', '--no-proxy-server'] })
    .catch(error => { throw Error('Could not start Google Chrome. Install Chrome and retry.', { cause: error }); });
  console.log('Preparing the local Our Ground app…');
  await build({ root, configFile: false, envFile: false, envPrefix: [], mode: 'age-gate-demo',
    cacheDir: join(temporary, 'cache'), logLevel: 'error', build: { outDir: site } });
  if (!cancellation.signal.aborted) {
    server = await startAgeGateServer({ app: serve });
    console.log('Local Our Ground demo: ' + server.origin);
    if (options.verify) await verify();
    else await present();
  }
} catch (error) {
  if (!cancellation.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  terminal?.close();
  try { await browser?.close(); }
  finally {
    try { await server?.close(); }
    finally { await rm(temporary, { recursive: true, force: true }); }
  }
  if (options.verify && server && !cancellation.signal.aborted) {
    await assert.rejects(fetch(server.origin));
    console.log('PASS: Chrome contexts, loopback server and temporary build disposed.');
  }
}
