const endpoint = 'https://age.yoti.com';
const sessions = endpoint + '/api/v1/sessions';
const threshold = 19;
export const yotiId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function yotiVerification(sdk: string, key: string, fetcher = fetch) {
  async function request(url: string, body?: object) {
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + key, 'Yoti-Sdk-Id': sdk, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw Error('Age verification unavailable');
    return await response.json();
  }
  return {
    async create(state: string, origin: string, ttl: number): Promise<string> {
      const callback = origin + '/adult-handoff/return?state=' + state;
      const disabled = Object.fromEntries([
        'age_estimation', 'digital_id', 'credit_card', 'mobile', 'yoti_key', 'electronic_id', 'cpf',
      ].map(method => [method, { allowed: false }]));
      const result = await request(sessions, {
        ...disabled, type: 'OVER', reference_id: state, ttl, synchronous_checks: true,
        doc_scan: { allowed: true, threshold, authenticity: 'AUTO', level: 'PASSIVE',
          preset_issuing_country: 'USA', retry_enabled: false, retry_limit: 1 },
        callback: { auto: true, url: callback },
        cancel_url: callback + '&cancel=1',
      });
      if (typeof result?.id !== 'string' || !yotiId.test(result.id) || result.status !== 'PENDING')
        throw Error('Age verification unavailable');
      return result.id;
    },
    launch(id: string) {
      return endpoint + '/?' + new URLSearchParams({ sessionId: id, sdkId: sdk });
    },
    async result(id: string, state: string): Promise<'pending' | 'verified' | 'denied'> {
      if (!yotiId.test(id)) return 'denied';
      const result = await request(sessions + '/' + id + '/result');
      if (result?.id !== id || result.sdk_id !== sdk || result.reference_id !== state ||
          result.type !== 'OVER' || result.doc_scan?.threshold !== threshold ||
          result.doc_scan.allowed !== true || result.doc_scan.level !== 'PASSIVE' ||
          typeof result.expires_at !== 'string' || !(Date.parse(result.expires_at) > Date.now())) return 'denied';
      if (['PENDING', 'IN_PROGRESS'].includes(result.status)) return 'pending';
      return result.status === 'COMPLETE' && result.method === 'DOC_SCAN' &&
        result.age === threshold && typeof result.evidence_id === 'string' && yotiId.test(result.evidence_id)
        ? 'verified' : 'denied';
    },
  };
}
