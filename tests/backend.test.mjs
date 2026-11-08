import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi } from '../backend/app.ts';
import { DemoRepository } from '../backend/demo.ts';
import { UnavailableError } from '../backend/errors.ts';

const serviceId = '11111111-1111-4111-8111-111111111111';
const editorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsiderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orgId = '22222222-2222-4222-8222-222222222222';

function setup(allowDemo = true) {
  let version = 1;
  let title = 'Demo Community Pantry — fictional';
  const reports = [];
  const repo = {
    async search({ category, allowDemo: visible }) {
      const item = { id: serviceId, title, category_slugs: ['food'],
        organization: { id: orgId, name: 'Demo Community Organization' },
        location: { city: 'Harrisburg', state: 'PA', address_label: 'DEMO POINT — NOT A VISITABLE ADDRESS', latitude: 40.2732, longitude: -76.8867 },
        distance_miles: 0, data_kind: 'fictional_demo', source_recorded_at: null };
      const items = visible && (!category || category === 'food') ? [item] : [];
      return { items, total: items.length };
    },
    async detail(id, visible) {
      if (id !== serviceId || !visible) return null;
      return { id, title, data_kind: 'fictional_demo', contact: { phone: null, website_url: null, directions_url: null } };
    },
    async createReport({ serviceId: id, reasonCode }) {
      if (id !== serviceId) return null;
      reports.push(reasonCode);
      return 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    },
    async account(id) {
      return { id, role: 'user', organizations: id === editorId ? [{ id: orgId, name: 'Demo Community Organization', role: 'editor' }] : [] };
    },
    async canEditService(id, account) { return id === serviceId && account.organizations.some((org) => org.id === orgId); },
    async editableService(id) { return id === serviceId ? { id, title, status: 'published', version } : null; },
    async updateService(id, _account, expected, patch) {
      if (id !== serviceId || expected !== version) return null;
      version++;
      if (patch.title) title = patch.title;
      return { id, status: patch.status ?? 'published', version };
    }
  };
  const deps = {
    repo, allowDemo,
    verifyToken: async (token) => token === 'editor' ? editorId : token === 'outsider' ? outsiderId : null,
    resolvePlace: async (q) => q === '17101' ? { label: 'Harrisburg, PA 17101', city: 'Harrisburg', state: 'PA', latitude: 40.2732, longitude: -76.8867 } : null
  };
  const send = (path, init) => handleApi(new Request('http://localhost/api/v1/' + path, init), deps);
  return { send, reports };
}
test('Pennsylvania place and category search returns demo cards without contact actions', async () => {
  const { send } = setup();
  const place = await send('places/resolve?q=17101');
  assert.equal(place.status, 200);
  assert.equal((await place.json()).place.state, 'PA');
  const result = await send('resources?lat=40.2732&lng=-76.8867&category=food');
  const search = await result.json();
  assert.equal(result.status, 200);
  assert.equal(search.total, 1);
  assert.equal(search.items[0].data_kind, 'fictional_demo');
  const detail = await send('resources/' + serviceId);
  assert.equal((await detail.json()).contact.directions_url, null);
});
test('demo data is excluded when disabled', async () => {
  const { send } = setup(false);
  const response = await send('resources?lat=40.2732&lng=-76.8867');
  assert.equal((await response.json()).total, 0);
});
test('search rejects invalid category and coordinate', async () => {
  const { send } = setup();
  assert.equal((await send('resources?lat=40&lng=-76&category=housing')).status, 422);
  assert.equal((await send('resources?lat=91&lng=-76')).status, 422);
});
test('Google account alone grants no edit permission', async () => {
  const { send } = setup();
  const response = await send('services/' + serviceId, {
    method: 'PATCH', headers: { authorization: 'Bearer outsider', 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: 1, title: 'Changed' })
  });
  assert.equal(response.status, 404);
});
test('legacy editor endpoint cannot publish outside the review workflow', async () => {
  const {send}=setup();
  const response=await send('services/'+serviceId,{method:'PATCH',headers:{authorization:'Bearer editor'},body:JSON.stringify({expected_version:1,title:'Attempted direct change'})});
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'REVIEW_REQUIRED');
  assert.equal((await(await send('services/'+serviceId,{headers:{authorization:'Bearer editor'}})).json()).version,1);
});
test('text validation matches database limits and rejects null required text', async () => {
  const { send } = setup();
  for (const patch of [{ title: 'x'.repeat(161) }, { summary: null }]) {
    const response = await send('services/' + serviceId, { method: 'PATCH', headers: { authorization: 'Bearer editor' }, body: JSON.stringify({ expected_version: 1, ...patch }) });
    assert.equal(response.status, 409);
  }
});
test('discovery-only rejects a valid anonymous report without storing it', async () => {
  const { send, reports } = setup();
  const response = await send('correction-reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service_id: serviceId, reason_code: 'wrong_hours' })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'CORRECTIONS_CLOSED');
  assert.deepEqual(reports, []);
});
test('rewritten correction submissions are rejected before consuming their body', async () => {
  const request = new Request('https://example.test/api/index?path=correction-reports', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: 'invalid JSON'
  });
  const response = await handleApi(request, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'CORRECTIONS_CLOSED');
  assert.equal(request.bodyUsed, false);
});
test('demo repository supports geographic search, staff maintenance, hide and correction visibility', async () => {
  const repo = new DemoRepository(editorId);
  const deps = { repo, allowDemo: true, verifyToken: async (token) => token === 'editor' ? editorId : null, resolvePlace: async () => null };
  const send = (path, init) => handleApi(new Request('http://localhost/api/v1/' + path, init), deps);
  const response = await send('resources?lat=40.2732&lng=-76.8867&category=food&radius_miles=5');
  const search = await response.json();
  assert.equal(search.total, 1);
  assert.equal(search.items[0].id, serviceId);
  const outside = await send('resources?lat=39.9526&lng=-75.1636&category=food&radius_miles=5');
  assert.equal((await outside.json()).total, 0);
  const me = await send('me', { headers: { authorization: 'Bearer editor' } });
  assert.equal((await me.json()).organizations[0].id, orgId);
  const update = await send('services/' + serviceId, { method: 'PATCH', headers: { authorization: 'Bearer editor' }, body: JSON.stringify({ expected_version: 1, status: 'hidden' }) });
  assert.equal(update.status, 409);
  await repo.updateService(serviceId,await repo.account(editorId),1,{status:'hidden'});
  assert.equal((await send('resources/' + serviceId)).status, 404);
  const report = await send('correction-reports', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ service_id: serviceId, reason_code: 'closed' }) });
  assert.equal(report.status, 403);
  const staffView = await send('services/' + serviceId, { headers: { authorization: 'Bearer editor' } });
  assert.equal((await staffView.json()).version, 2);
});
test('staff collections and edits are scoped; anonymous and forged writes cannot succeed', async () => {
  const repo = new DemoRepository(editorId);
  const deps = {repo,allowDemo:true,verifyToken:async token=>token==='editor'?editorId:token==='outsider'?outsiderId:null,resolvePlace:async()=>null};
  const send = (path,token,init={}) => handleApi(new Request('http://localhost/api/v1/'+path,{...init,headers:token?{authorization:'Bearer '+token}:{}}),deps);
  assert.equal((await send('services',null)).status,401);
  assert.equal((await send('services','invalid')).status,401);
  const mine = await (await send('services','editor')).json();
  assert.equal(mine.total,1); assert.equal(mine.items[0].id,serviceId);
  assert.equal((await (await send('services','outsider')).json()).total,0);
  const body=JSON.stringify({expected_version:1,summary:'Attempted edit'});
  assert.equal((await send('services/'+serviceId,null,{method:'PATCH',body})).status,401);
  assert.equal((await send('services/'+serviceId,'invalid',{method:'PATCH',body})).status,401);
  assert.equal((await send('services/'+serviceId,'outsider',{method:'PATCH',body})).status,404);
  assert.equal((await send('services/'+serviceId,'editor',{method:'PATCH',body:JSON.stringify({expected_version:1,role:'admin',organization_id:orgId})})).status,409);
  assert.equal((await send('services/77777777-7777-4777-8777-777777777777','editor')).status,404);
  assert.equal((await (await send('me','outsider')).json()).role,'user');
});
test('API keyword and radius filters use repository records, and disabled demo reports are rejected', async () => {
  const repo = new DemoRepository();
  const deps={repo,allowDemo:true,verifyToken:async()=>null,resolvePlace:async()=>null};
  const send=path=>handleApi(new Request('http://localhost/api/v1/'+path),deps);
  assert.equal((await (await send('resources?lat=40.2732&lng=-76.8867&q=PANTRY&radius_miles=5')).json()).total,1);
  assert.equal((await (await send('resources?lat=40.2732&lng=-76.8867&q=no-match')).json()).total,0);
  assert.equal(await repo.createReport({serviceId,reasonCode:'closed',description:null,allowDemo:false}),null);
});
test('missing provider configuration returns a controlled 503', async () => {
  const deps={repo:new DemoRepository(),allowDemo:false,verifyToken:async()=>null,resolvePlace:async()=>{throw new UnavailableError('GEOCODING_NOT_CONFIGURED','Location search is temporarily unavailable.');}};
  const result=await handleApi(new Request('http://localhost/api/v1/places/resolve?q=Harrisburg'),deps);
  assert.equal(result.status,503); assert.equal((await result.json()).error.code,'GEOCODING_NOT_CONFIGURED');
});
