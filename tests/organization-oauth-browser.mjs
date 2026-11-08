// The UI, browser storage and Supabase SDK are real. The provider HTTP responses
// and org/account API data below are synthetic and never reach a remote service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const origin = 'http://127.0.0.1:4269';
const provider = 'https://abcdefghijklmnopqrst.supabase.co';
Object.assign(process.env, {
  VITE_SUPABASE_URL: provider, SUPABASE_URL: provider,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789',
  VITE_GOOGLE_AUTH_ENABLED: 'true', VITE_ACCOUNT_ALLOWED_ORIGINS: origin,
});
const server = await createServer({ server: { host:'127.0.0.1', port:4269, strictPort:true }, logLevel:'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext();
  const page = await context.newPage();
  const evidence = process.env.ORGANIZATION_BROWSER_EVIDENCE;
  async function screenshot(name) {
    if (!evidence) return;
    await mkdir(evidence,{recursive:true});
    await page.screenshot({path:join(evidence,name+'.png')});
  }
  const user = {id:'aaaa0000-0000-4000-8000-000000000001',email:'reviewer@example.invalid',
    email_confirmed_at:'2026-01-02T00:00:00Z',created_at:'2026-01-02T00:00:00Z',aud:'authenticated'};
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const outsider = {...user,id:'bbbb0000-0000-4000-8000-000000000002',email:'outsider@example.invalid'};
  const issued = new Map(), accountReads = new Set();
  function issue(principal,lifetime) {
    const payload={sub:principal.id,role:'authenticated',jti:String(issued.size+1),exp:Math.floor(Date.now()/1000)+lifetime};
    const jwt=enc({alg:'HS256',typ:'JWT'})+'.'+enc(payload)+'.c2ln';
    issued.set(jwt,principal);
    return jwt;
  }
  function bearer(route) {
    const match=/^Bearer (\S+)$/.exec(route.request().headers().authorization??'');
    const jwt=match?.[1], principal=issued.get(jwt);
    assert(principal,'The request must carry a token issued by the fixture provider');
    return {jwt,principal};
  }
  const initialToken=issue(user,3600);
  let refreshedToken;
  const claims = [];
  let administrator = false;
  let challenge, exchanges = 0, refreshes = 0, loads = 0, appLogout = 0, providerLogout = 0;
  await context.route(provider+'/**',async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'),'google');
      assert.equal(url.searchParams.get('code_challenge_method'),'s256');
      assert.equal(url.searchParams.get('redirect_to'),origin+'/auth/callback');
      challenge = url.searchParams.get('code_challenge');
      return route.fulfill({status:302,headers:{location:origin+'/auth/callback?code=synthetic_single_use_code'}});
    }
    if (url.pathname === '/auth/v1/token') {
      const data = route.request().postDataJSON();
      let accessToken;
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        assert.equal(data.refresh_token,'local-test-refresh');
        refreshes++;
        accessToken=refreshedToken=issue(user,7200);
      } else {
        assert.equal(url.searchParams.get('grant_type'),'pkce');
        assert.equal(data.auth_code,'synthetic_single_use_code');
        assert.equal(createHash('sha256').update(data.code_verifier).digest('base64url'),challenge);
        exchanges++;accessToken=initialToken;
      }
      return route.fulfill({json:{user,access_token:accessToken,refresh_token:'local-test-refresh',expires_in:3600,
        token_type:'bearer',provider_token:'provider-token-never-store'}});
    }
    if (url.pathname === '/auth/v1/logout') {
      assert.equal(bearer(route).principal.id,outsider.id);
      providerLogout++;
      assert.equal(url.searchParams.get('scope'),'local');
      return route.fulfill({json:{}});
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({json:bearer(route).principal});
    throw new Error('Unexpected synthetic provider path '+url.pathname);
  });
  await context.route(origin+'/api/v1/**',async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/org/status')) return route.fulfill({json:{configured:true,email_enabled:false}});
    if (path.endsWith('/org/account')) {
      // A read already in flight can arrive after refresh or a cross-tab sign-in.
      // Its own issued credential determines which principal and data it sees.
      const {jwt,principal}=bearer(route);
      accountReads.add(jwt);loads++;
      return route.fulfill({json:{id:principal.id,role:administrator&&principal===user?'admin':'user',organizations:[],
        claims:principal===user?claims:[],listings:[],revisions:[]}});
    }
    if (path.endsWith('/org/claims')) {
      assert.equal(route.request().method(),'POST');
      const {jwt,principal}=bearer(route);
      assert(principal===user&&jwt===refreshedToken,'Claim submission must use the refreshed first identity');
      claims.push({...route.request().postDataJSON(),id:'fixture-claim',status:'pending',created_at:'2026-11-08T12:00:00Z'});
      return route.fulfill({status:202,json:{status:'pending'}});
    }
    if (path.endsWith('/org/session/logout')) {
      assert.equal(bearer(route).principal.id,outsider.id);
      appLogout++; return route.fulfill({json:{signed_out:true}});
    }
    if (path.endsWith('/org/admin')) {
      const {principal}=bearer(route);
      if (administrator && principal===user) return route.fulfill({json:{claims:[],revisions:[],listings:[],memberships:[],audit:[]}});
      return route.fulfill({status:403,json:{error:{code:'ACCESS_DENIED',message:'Administrator access is required.'}}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto(origin+'/account?intent=request');
  await page.getByRole('button',{name:'Continue with Google'}).waitFor();
  await screenshot('local-synthetic-organization-sign-in');
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.locator('#accountWorkspace').waitFor();
  assert.equal(exchanges,1);
  assert.equal(new URL(page.url()).search,'?intent=request');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'claimTitle');
  assert(await page.locator('#adminLink').isHidden());
  assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('provider-token-never-store')));
  await page.evaluate(()=>{
    const key = Object.keys(localStorage).find(name=>name.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(key));
    session.expires_at = Math.floor(Date.now()/1000)-1;
    localStorage.setItem(key,JSON.stringify(session));
  });
  await page.reload(); await page.locator('#accountWorkspace').waitFor();
  assert.equal(refreshes,1);
  assert(accountReads.has(initialToken)&&accountReads.has(refreshedToken),'Account reads must use both initial and refreshed credentials');
  assert(loads >= 2,'session survives reload with a fresh server authorization check');
  await page.locator('[name=organization_name]').fill('Fictional verification organization');
  await page.locator('[name=location]').fill('Synthetic location, Harrisburg, PA');
  await page.locator('[name=applicant_role]').fill('Listing representative');
  await page.locator('[name=contact_email]').fill(user.email);
  await page.getByRole('button',{name:'Submit access request'}).click();
  await page.locator('#claimList').getByText('Pending review').waitFor();
  await page.locator('#accountStatus').filter({hasText:/pending review/}).waitFor();
  assert(await page.locator('#adminLink').isHidden());
  assert.equal(await page.locator('#serviceList a').count(),0);
  await screenshot('local-synthetic-organization-pending');
  await page.goto(origin+'/account/administration');
  await page.getByText('Administrator access is required.').waitFor();
  // Establish a second verified fixture identity through the SDK in another tab,
  // exercising its real auth broadcast with no intervening SIGNED_OUT event.
  administrator = true;
  const adminView = await context.newPage();
  await adminView.goto(origin+'/account/administration');
  await adminView.locator('#adminWorkspace').waitFor();
  await page.goto(origin+'/account');
  await page.locator('#accountWorkspace').waitFor();
  await page.locator('#adminLink').waitFor();
  await page.locator('#claimList').getByText('Pending review').waitFor();
  // Keep the first user's admin grant active: only the second user's session
  // can explain why this previously authorized workspace becomes inaccessible.
  const outsiderToken=issue(outsider,3600);
  await page.evaluate(async (access_token)=>{
    const {authClient} = await import('/src/backend-client.ts');
    const {error} = await authClient().auth.setSession({access_token,refresh_token:'second-test-refresh'});
    if (error) throw error;
  },outsiderToken);
  await adminView.getByText('Administrator access is required.').waitFor();
  assert(await adminView.locator('#adminWorkspace').isHidden());
  await page.locator('#accountStatus[data-state=success]').filter({hasText:/Request organization access below/}).waitFor();
  assert(accountReads.has(outsiderToken),'Current workspace must be fetched under the second identity');
  assert(await page.locator('#adminLink').isHidden());
  assert.equal(await page.locator('#claimList').getByText('Pending review').count(),0,'Prior user claim must leave the current workspace');
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByRole('button',{name:'Continue with Google'}).waitFor();
  assert(await page.locator('#accountWorkspace').isHidden());
  assert.equal(appLogout,1); assert.equal(providerLogout,1);
  await page.goto(origin+'/auth/callback?code=synthetic_replay_code&next=https://example.invalid');
  await page.locator('#accountStatus[data-state=error]').waitFor();
  assert.equal(page.url(),origin+'/account');
  assert.equal(exchanges,1,'rejected callback never exchanges a code');
  console.log('PASS: synthetic provider, real SDK/browser: exact PKCE challenge, callback scrub, request return, session refresh, pending request without listing access, admin denial, cross-tab account change, logout and replay denial.');
} finally {
  await browser?.close();
  await server.close();
}
