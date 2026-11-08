import { performance } from 'node:perf_hooks';

const fixture = '11111111-1111-4111-8111-111111111111';

export async function checkLocalReadiness(frontendPort, { fetcher = fetch, timeoutMs = 5000 } = {}) {
  const frontend = `http://127.0.0.1:${frontendPort}`;
  const api = 'http://127.0.0.1:18787';
  const checks = [
    ['frontend', frontend + '/', 'html', value => value.includes('<div id="app">') && value.includes('<script')],
    ['direct API health', api + '/api/v1/health', 'json', value => value.status === 'ok'],
    ['proxied API health', frontend + '/api/v1/health', 'json', value => value.status === 'ok'],
    ['demo ZIP resolution', frontend + '/api/v1/places/resolve?q=17101', 'json', value => value.place?.state === 'PA' && value.place?.city === 'Harrisburg'],
    ['fictional resource search', frontend + '/api/v1/resources?lat=40.2732&lng=-76.8867&category=food&radius_miles=25', 'json', value => Array.isArray(value.items) && value.items.some(item => item.id === fixture) && value.items.every(item => item.data_kind === 'fictional_demo')],
    ['fictional detail safeguards', frontend + '/api/v1/resources/' + fixture, 'json', value => value.id === fixture && value.data_kind === 'fictional_demo' && value.contact?.phone === null && value.contact?.website_url === null && value.contact?.directions_url === null],
  ];
  return Promise.all(checks.map(async ([name, url, kind, accepts]) => {
    const start = performance.now();
    let status = null;
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
      status = response.status;
      if (!response.ok) throw new Error('HTTP response was not successful');
      const type = response.headers.get('content-type') ?? '';
      if (!type.includes(kind === 'json' ? 'application/json' : 'text/html')) throw new Error('Unexpected response type');
      const value = kind === 'json' ? await response.json() : await response.text();
      if (!accepts(value)) throw new Error('Response did not match the explicit demo readiness contract');
      return { name, url, ok: true, status, milliseconds: Math.round(performance.now() - start) };
    } catch (error) {
      // Do not print API bodies, environment values, or provider error details.
      return { name, url, ok: false, status, milliseconds: Math.round(performance.now() - start), error: error.name === 'TimeoutError' ? 'Timed out' : 'Unavailable or unexpected response' };
    }
  }));
}
