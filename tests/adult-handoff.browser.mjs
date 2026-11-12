import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startAgeGateServer } from './support/age-gate-server.mjs';
import { handoffFixture } from './support/adult-handoff-fixture.mjs';

const axe = process.env.AGE_AXE ? await readFile(process.env.AGE_AXE, 'utf8') : null;
const build = resolve(process.env.AGE_BUILD_DIR ?? fileURLToPath(new URL('../dist/', import.meta.url)));
const index = await readFile(join(build, 'index.html'));
const screenshots = process.env.AGE_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });

const types = {
  '.css': 'text/css', '.ico': 'image/x-icon', '.js': 'text/javascript', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const app = async request => {
  const { pathname } = new URL(request.url);
  if (pathname === '/give' || pathname === '/support') {
    return new Response(index, { headers: { 'Content-Type': 'text/html' } });
  }
  if (pathname.startsWith('/api/')) return Response.json({ available: false, enabled: false });
  const file = resolve(build, '.' + pathname);
  if (file.startsWith(build + sep) && types[extname(file)]) {
    const bytes = await readFile(file).catch(() => null);
    if (bytes) return new Response(bytes, { headers: { 'Content-Type': types[extname(file)] } });
  }
  return new Response(null, { status: 404 });
};

const { handoff, control } = handoffFixture();
let server, browser;
const href = url => url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const provider = createServer((request, response) => {
  const callback = control.request?.callback.url;
  if (request.method !== 'GET' || request.url !== '/' || !callback) {
    response.writeHead(404).end();
    return;
  }
  const returnUrl = new URL(callback);
  assert.equal(returnUrl.origin, server.origin);
  const cancelUrl = new URL(returnUrl);
  cancelUrl.searchParams.set('cancel', '1');
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(`<!doctype html>
    <html lang="en"><title>Synthetic provider</title><main><h1>Synthetic provider</h1>
    <p><a href="${href(returnUrl)}">Return with verification result</a></p>
    <p><a href="${href(cancelUrl)}">Cancel at provider</a></p></main></html>`);
});

const denial = 'Our Ground is for adults 19 and older';
const selectors = {
  give: { path: '/give', heading: /Put your generosity to work/ },
  support: { path: '/support', heading: /Find support near you/ },
};
const title = (page, name) => page.getByRole('heading', { level: 1, name });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const link = (page, name) => page.getByRole('link', { name, exact: true });

async function tabTo(page, locator) {
  await page.keyboard.press('Tab');
  assert(await locator.evaluate(node => node === document.activeElement && node.matches(':focus-visible') &&
    getComputedStyle(node).outlineStyle !== 'none'), 'Expected visible keyboard focus on ' + await locator.innerText());
}

async function checkAxe(page, selector, name) {
  if (!axe) return;
  await page.evaluate(axe);
  const violations = await page.evaluate(async selector => (await window.axe.run(selector, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  })).violations.map(({ id }) => id), selector);
  assert.deepEqual(violations, [], name);
}

async function checkEntrance(page, name, screenshot) {
  await title(page, name).waitFor();
  const preview = page.locator('.preview');
  await preview.locator('img').evaluate(img => img.decode());
  assert(await preview.evaluate(node => node.inert && node.getAttribute('aria-hidden') === 'true' &&
    getComputedStyle(node).filter === 'blur(15px)'));
  assert(await page.locator('.entrance > .panel').evaluate(node => {
    const maxWidth = node.classList.contains('panel--policy') ? 560 : 420;
    return node.getBoundingClientRect().width <= maxWidth && getComputedStyle(node).borderRadius === '10px';
  }));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
  await checkAxe(page, 'html', name);
  if (screenshots) await page.screenshot({ path: join(screenshots, screenshot + '.png') });
}

try {
  await new Promise((done, fail) => {
    provider.once('error', fail);
    provider.listen(0, '127.0.0.1', done);
  });
  // A different hostname gives Chrome a real cross-site return, with no provider traffic.
  const providerOrigin = 'http://localhost:' + provider.address().port;
  server = await startAgeGateServer({
    handoff: { ...handoff, provider: { ...handoff.provider, launch: () => providerOrigin } },
    app, productionHeaders: true,
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  ] });

  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }],
  ]) {
    control.now = Date.now();
    const touch = device === 'mobile';
    const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch,
      reducedMotion: 'reduce', serviceWorkers: 'block' });
    const unexpectedProviderRequests = [];
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin || url.origin === providerOrigin) return route.continue();
      if (url.hostname === 'yoti.com' || url.hostname.endsWith('.yoti.com')) unexpectedProviderRequests.push(url.hostname);
      return route.abort();
    });
    const page = await ctx.newPage();
    const tapOrClick = locator => touch ? locator.tap() : locator.click();
    const entrance = (name, label) => checkEntrance(page, name, device + '-' + label);
    const status = async path => (await ctx.request.get(server.origin + path)).status();

    try {
      const first = await page.goto(server.origin + '/give');
      assert.equal(first.status(), 200);
      assert.match(await first.headerValue('content-security-policy'), /form-action 'self'/);
      await entrance('Age confirmation', 'confirmation');
      await tabTo(page, button(page, "I'm 19 or older"));
      await tabTo(page, button(page, "I'm under 19"));
      if (touch) await button(page, "I'm under 19").tap();
      else await page.keyboard.press('Enter');
      await entrance(denial, 'denied');
      assert.equal((await page.reload()).status(), 403);
      assert.equal(await status('/support'), 403);
      assert.equal(await status('/give'), 403);

      async function enter(target) {
        assert.equal((await page.goto(server.origin + target)).status(), 403);
        await tabTo(page, link(page, 'Verify as an adult'));
        await page.keyboard.press('Enter');
        await title(page, 'An adult can help').waitFor();
      }

      async function start(target, recordEntrance = false) {
        await enter(target);
        if (recordEntrance) await entrance('An adult can help', 'disclosure');
        await tabTo(page, link(page, 'Yoti privacy information'));
        await tabTo(page, button(page, 'Verify with Yoti'));
        if (touch) await button(page, 'Verify with Yoti').tap();
        else await page.keyboard.press('Enter');
        await title(page, 'Verification pending').waitFor();
        if (recordEntrance) await entrance('Verification pending', 'continue');
        await tabTo(page, link(page, 'Continue to Yoti'));
        if (touch) await link(page, 'Continue to Yoti').tap();
        else await page.keyboard.press('Enter');
        await title(page, 'Synthetic provider').waitFor();
        assert.equal(new URL(page.url()).origin, providerOrigin);
      }

      async function checkResult(outcome, target) {
        control.outcome = outcome;
        await start(target);
        await tapOrClick(link(page, 'Return with verification result'));
        await entrance('Return from Yoti', Object.keys(outcome).length ? 'return-failed' : 'return');
        assert.equal(await status(target), 403);
        await tabTo(page, button(page, 'Check verification'));
        if (touch) await button(page, 'Check verification').tap();
        else await page.keyboard.press('Enter');
      }

      async function checkAdultPage(target) {
        await title(page, target.heading).waitFor();
        await page.waitForURL(server.origin + target.path);
        const banner = page.getByRole('complementary', { name: 'Temporary adult session' });
        assert.match(await banner.getByRole('status').innerText(), /Verified adult session/);
        await checkAxe(page, '.og-adult-session', target.path);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), target.path);
        return banner;
      }

      const starts = control.creates;
      await enter('/give');
      await tapOrClick(link(page, 'Back to the restricted session'));
      await title(page, denial).waitFor();
      assert.equal(control.creates, starts);

      await start('/give', true);
      const checks = control.checks;
      await tapOrClick(link(page, 'Cancel at provider'));
      await entrance('Return from Yoti', 'return-canceled');
      assert.equal(await button(page, 'Check verification').count(), 0);
      await tabTo(page, button(page, 'Cancel verification'));
      await page.keyboard.press('Enter');
      await title(page, denial).waitFor();
      assert.equal(control.checks, checks);
      assert.equal(await status('/give'), 403);

      await checkResult({ status: 'FAIL' }, '/support');
      await entrance('Adult verification', 'failed');
      assert(await page.getByText('Yoti could not verify 19+ eligibility. Access remains restricted.', { exact: true }).isVisible());
      assert.equal(await status('/support'), 403);

      await checkResult({}, '/give');
      await checkAdultPage(selectors.give);
      assert.equal(await status('/give'), 200);
      assert.equal(await status('/support'), 200);
      if (screenshots) await page.screenshot({ path: join(screenshots, device + '-give.png') });
      await page.goto(server.origin + '/support');
      const banner = await checkAdultPage(selectors.support);
      assert(await page.locator('#locationInput').isVisible());
      if (screenshots) await page.screenshot({ path: join(screenshots, device + '-support.png') });
      const finish = banner.getByRole('button', { name: 'Finish adult session', exact: true });
      await tabTo(page, finish);
      await page.keyboard.press('Enter');
      await title(page, denial).waitFor();
      assert.equal(await status('/give'), 403);
      assert.equal(await status('/support'), 403);

      await checkResult({}, '/support');
      await checkAdultPage(selectors.support);
      const eligibility = await ctx.request.get(server.origin + '/eligibility', { headers: { Accept: 'application/json' } });
      const { verifiedUntil, serverTime } = await eligibility.json();
      assert(verifiedUntil > serverTime && verifiedUntil - serverTime <= 900);
      control.now = Date.now() + 901000;
      assert.equal((await page.reload()).status(), 403);
      await title(page, denial).waitFor();
      assert.equal(await status('/give'), 403);
      await tapOrClick(link(page, 'Privacy'));
      await entrance('Privacy', 'privacy');
      assert.deepEqual(unexpectedProviderRequests, [], 'Chrome must never contact live Yoti');
      console.log(`PASS ${device}: native denial, handoff cancellation, failed and verified results, Find/Give Support, expiry, exit, keyboard focus and frosted entrance${axe ? ', and axe' : ''}.`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  await server?.close();
  await new Promise(done => { provider.close(done); provider.closeAllConnections(); });
}
