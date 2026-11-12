import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { startAgeGateServer } from './support/age-gate-server.mjs';

const axe = process.env.AGE_AXE ? await readFile(process.env.AGE_AXE, 'utf8') : null;
const route = '/adult-help-demo';
const ageTitle = 'Age confirmation';
const denialTitle = 'Our Ground is for adults 19 and older';
const introTitle = 'Adult handoff demonstration';
const successTitle = 'Simulation successful — Adult assistance preview';
const notice = 'DEMO MODE — Age verification is simulated. No identity has been checked.';
const demoEntry = 'See how an adult can help';
const start = 'Start adult handoff demo';
const success = 'Simulate verification success';
const failure = 'Simulate verification failure';
const cancel = 'Cancel demonstration';
const finish = 'Finish adult assistance demo';
const server = await startAgeGateServer({
  signInOnly: true,
  productionHeaders: true,
  app() { return new Response('Eligible application route'); },
});
const { origin } = server;
const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });
const control = (page, name) => page.getByRole('button', { name, exact: true })
  .or(page.getByRole('link', { name, exact: true }));

async function focusWithTab(page, name) {
  const target = control(page, name);
  await target.waitFor();
  for (let step = 0; step < 24; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(node => node === document.activeElement)) {
      assert(await target.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44 && node.matches(':focus-visible') &&
          getComputedStyle(node).outlineStyle !== 'none';
      }), 'Expected a visible focus ring and 44px target for ' + name);
      return;
    }
  }
  assert.fail('Tab could not reach ' + name);
}

async function checkScene(page, title) {
  await heading(page, title).waitFor();
  const main = page.getByRole('main');
  assert.equal(await main.count(), 1);
  await main.getByText(notice, { exact: true }).waitFor();
  assert.match(await main.ariaSnapshot(), /No identity has been checked/);
  assert.equal(await main.locator('form, input, textarea').count(), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), title);
  assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.getAnimations().length === 0), title);
  if (axe) {
    await page.evaluate(axe);
    const violations = await page.evaluate(async () => (await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    })).violations.map(item => item.id));
    assert.deepEqual(violations, [], title);
  }
}

async function checkDenied(ctx, cookies) {
  assert.deepEqual(await ctx.cookies(), cookies);
  for (const path of ['/support', '/give', '/account', '/organizations', '/api/v1/resources',
    '/api/v1/org/listings', '/api/v1/eden/hosted/status']) {
    assert.equal((await ctx.request.get(origin + path)).status(), 403, path);
  }
  for (const path of ['/api/v1/correction-reports', '/api/v1/eden/hosted/speech', '/api/v1/eden/hosted/live/token']) {
    assert.equal((await ctx.request.post(origin + path, { data: {} })).status(), 403, path);
  }
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--disable-background-networking', '--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  ] });
  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }],
  ]) {
    const touch = device === 'mobile';
    const ctx = await browser.newContext({
      viewport, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce', serviceWorkers: 'block',
      javaScriptEnabled: Boolean(axe),
    });
    const forbiddenRequests = [];
    const demoCookieHeaders = [];
    await ctx.route('**/*', interception => {
      const url = new URL(interception.request().url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return interception.continue();
      forbiddenRequests.push(url.origin + url.pathname);
      return interception.abort();
    });
    const page = await ctx.newPage();
    page.on('response', response => {
      if (new URL(response.url()).pathname.startsWith(route)) demoCookieHeaders.push(response.headerValue('set-cookie'));
    });
    const activate = async name => {
      await focusWithTab(page, name);
      if (touch) await control(page, name).tap();
      else await page.keyboard.press('Enter');
    };
    const scene = title => checkScene(page, title);
    const denied = async () => {
      await heading(page, denialTitle).waitFor();
      assert(await page.locator('.preview').evaluate(node => node.inert &&
        node.getAttribute('aria-hidden') === 'true' && getComputedStyle(node).filter === 'blur(15px)'));
    };
    const begin = async () => {
      await activate(demoEntry);
      await scene(introTitle);
      assert.equal(new URL(page.url()).pathname, route);
      await activate(start);
      await scene('Simulated verification');
    };

    try {
      await page.goto(origin + '/');
      await heading(page, ageTitle).waitFor();
      await activate("I'm under 19");
      await denied();
      assert.equal((await page.reload()).status(), 403);
      await denied();
      const cookies = await ctx.cookies();
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, '__Host-og-audience');
      assert.match(cookies[0].value, /^under19\./);
      await checkDenied(ctx, cookies);

      await begin();
      await activate(cancel);
      await denied();
      assert.deepEqual(await ctx.cookies(), cookies);

      await begin();
      await activate(failure);
      await scene('Simulation unsuccessful');
      assert.match(await page.getByRole('main').innerText(), /(?:remains restricted|still restricted)/i);
      await checkDenied(ctx, cookies);
      await page.goto(origin + '/');
      await denied();

      await begin();
      await activate(success);
      await scene(successTitle);
      await checkDenied(ctx, cookies);
      await activate('Find Support');
      await scene('Find Support');
      await activate('Food');
      await scene('Food resources');
      await activate('View Sample food pantry');
      await scene('Sample food pantry');
      await page.getByText('Fictional resource', { exact: true }).waitFor();
      await activate('Back to results');
      await scene('Food resources');
      await activate('Back to categories');
      await scene('Find Support');
      await activate('Back to assistance preview');
      await scene(successTitle);

      await activate('Give Support');
      await scene('Give Support');
      await activate('View Pack a pantry box');
      await scene('Pack a pantry box');
      await page.getByText('Fictional opportunity', { exact: true }).waitFor();
      await activate('Back to opportunities');
      await scene('Give Support');
      await activate('Back to assistance preview');
      await scene(successTitle);
      await activate(finish);
      await denied();
      await checkDenied(ctx, cookies);

      await begin();
      await activate(success);
      await scene(successTitle);
      await activate(finish);
      await denied();
      assert.deepEqual(await ctx.cookies(), cookies);
      assert.deepEqual(forbiddenRequests, []);
      assert((await Promise.all(demoCookieHeaders)).every(value => value === null),
        'Demo responses must not set cookies');
      console.log(`PASS ${device}: age denial, deterministic success and failure, cancellation, fictional support journeys, finish, replay, keyboard, reduced motion and responsive layout${axe ? ', axe' : ''}.`);
    } finally {
      await ctx.close();
    }
  }

  const direct = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await direct.newPage();
    await page.goto(origin + route);
    await heading(page, introTitle).waitFor();
    await control(page, start).click();
    await heading(page, 'Simulated verification').waitFor();
    await control(page, success).click();
    await heading(page, successTitle).waitFor();
    assert.deepEqual(await direct.cookies(), []);
    assert.equal((await direct.request.get(origin + '/api/v1/resources')).status(), 403);
    await page.goto(origin + '/support');
    await heading(page, ageTitle).waitFor();
    await control(page, "I'm 19 or older").click();
    await page.getByText('Eligible application route').waitFor();
    assert.equal(page.url(), origin + '/support');
    console.log('PASS direct entry remains a non-authorizing demo, and ordinary adult acknowledgment still works.');
  } finally {
    await direct.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
