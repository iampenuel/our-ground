import {createHash, randomBytes} from 'node:crypto';
import {redis} from './hosted-store.ts';
import {handoffEntrance, escapeAttribute} from './age-page.ts';
import {yotiId, yotiVerification} from './yoti-age-verification.ts';

export const handoffPath = '/adult-handoff';
export const handoffCookie = '__Host-og-verified-adult';
const attemptSeconds = 600;
const sessionSeconds = 900;
const opaque = /^[A-Za-z0-9_-]{43}$/;
const activeRecord = /^active:([a-f0-9]{64}):(\d+):([A-Za-z0-9_-]{43})$/;
const token = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

type Store = (command: string[]) => Promise<unknown>;
type Provider = ReturnType<typeof yotiVerification>;
export type Handoff = { store: Store; provider: Provider; dailyLimit: number };
type Denial = { nonce: string; expires: number };
export type HandoffEnv = Partial<Record<'ADULT_HANDOFF_DAILY_LIMIT' | 'ADULT_HANDOFF_ENABLED' | 'VERCEL_ENV' | 'VERCEL_PROJECT_ID' | 'YOTI_AVS_SDK_ID' | 'YOTI_AVS_API_KEY' | 'UPSTASH_REDIS_REST_TOKEN' | 'UPSTASH_REDIS_REST_URL', string>>;

export function configuredHandoff(request: Request, env: HandoffEnv): Handoff | undefined {
  const limit = Number(env.ADULT_HANDOFF_DAILY_LIMIT);
  const sdk = env.YOTI_AVS_SDK_ID;
  const key = env.YOTI_AVS_API_KEY;
  if (env.ADULT_HANDOFF_ENABLED !== 'true' || env.VERCEL_ENV !== 'production' ||
      env.VERCEL_PROJECT_ID !== 'prj_4li6QnqulPgPbJpxMW2L9hczDNrS' ||
      new URL(request.url).origin !== 'https://ourground.vercel.app' ||
      !sdk || !yotiId.test(sdk) || !key || !env.UPSTASH_REDIS_REST_TOKEN ||
      !env.UPSTASH_REDIS_REST_URL || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return;
  return { store: command => redis(env, command), provider: yotiVerification(sdk, key), dailyLimit: limit };
}

const keyFor = (request: Request, denial: Denial) =>
  'og:adult-handoff:v1:' + digest(new URL(request.url).origin + '|' + denial.nonce);
const cookieValue = (request: Request) => request.headers.get('cookie')?.split(';').map(v => v.trim())
  .find(v => v.startsWith(handoffCookie + '='))?.slice(handoffCookie.length + 1);
export const hasHandoffCookie = (request: Request) => opaque.test(cookieValue(request) ?? '');
const cookie = (value: string) => handoffCookie + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Strict';

export async function verifiedAdult(request: Request, denial: Denial, handoff?: Handoff) {
  const value = cookieValue(request);
  if (!handoff || !value || !opaque.test(value)) return null;
  const raw = await handoff.store(['GET', keyFor(request, denial)]);
  const record = typeof raw === 'string' ? activeRecord.exec(raw) : null;
  const expires = Number(record?.[2]);
  if (!record || record[1] !== digest(value) || expires <= now() || expires > denial.expires) return null;
  return { nonce: digest(value), expires, raw: raw as string };
}

const replaceRecord = 'if redis.call("GET",KEYS[1])~=ARGV[1] then return 0 end if ARGV[2]=="" then redis.call("DEL",KEYS[1]) else redis.call("SET",KEYS[1],ARGV[2],"EX",ARGV[3]) end return 1';
const admitStart = 'local n=tonumber(redis.call("GET",KEYS[1]) or "0") if n>=tonumber(ARGV[1]) then return 0 end redis.call("INCR",KEYS[1]) if n==0 then redis.call("EXPIRE",KEYS[1],86400) end return 1';
const destination = (value: string | null) => value === '/give' ? '/give' : '/support';
const redirect = (location: string, value?: string) => new Response(null, {
  status: 303, headers: { Location: location, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    ...(value ? { 'Set-Cookie': value } : {}) },
});
const post = (action: string, label: string, name?: string, value = '') =>
  '<form method="post" action="' + handoffPath + '/' + action + '">' +
  (name ? '<input type="hidden" name="' + name + '" value="' + escapeAttribute(value) + '">' : '') +
  '<button type="submit">' + label + '</button></form>';
const closed = (message: string, status = 403) => handoffEntrance('Adult verification', '<p>' + message +
  '</p><a href="/adult-handoff">Back to adult verification</a>', status);

export async function handleHandoff(
  request: Request, handoff: Handoff | undefined, denial: Denial | null,
  readForm: (request: Request) => Promise<URLSearchParams | null>,
) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!handoff) return handoffEntrance('Adult verification unavailable', '<p>You can ask an adult to visit Our Ground on their own device.</p>', 404);
  const state = url.searchParams.get('state') ?? '';
  if (request.method === 'GET' && path === handoffPath + '/return' && opaque.test(state)) {
    // The initial cross-site return may omit the Strict cookie. Only the
    // subsequent same-origin POST can look up and consume the bound attempt.
    const canceled = url.searchParams.get('cancel') === '1';
    return handoffEntrance('Return from Yoti', '<p>' +
      (canceled ? 'Return to the restricted session.' : 'Check the result to continue. Access remains restricted until verification succeeds.') +
      '</p>' + (canceled ? '' : post('complete', 'Check verification', 'state', state)) + post('cancel', 'Cancel verification', 'state', state));
  }
  if (!denial) return closed('Start adult verification from the restricted browser session.');
  const key = keyFor(request, denial);
  const change = async (before: string, after = '', ttl = 1) =>
    await handoff.store(['EVAL', replaceRecord, '1', key, before, after, String(ttl)]) === 1;
  const read = async () => {
    const value = await handoff.store(['GET', key]);
    return typeof value === 'string' ? value : '';
  };
  if (request.method === 'GET' && path === handoffPath) {
    if (await verifiedAdult(request, denial, handoff)) return handoffEntrance('Adult session active',
      '<p>Finish your adult session before handing the device back.</p><a href="/support">Find Support</a>' + post('finish', 'Finish adult session'));
    const pending = /^pending:([^:]+):([^:]+):(\d+):(\/give|\/support)$/.exec(await read());
    if (pending && opaque.test(pending[1]) && yotiId.test(pending[2]) && Number(pending[3]) > now())
      return handoffEntrance('Verification pending', '<p>Continue to Yoti to complete your check, or cancel to stay in the restricted session.</p><a href="' +
        escapeAttribute(handoff.provider.launch(pending[2])) + '">Continue to Yoti</a>' + post('cancel', 'Cancel verification', 'state', pending[1]));
    return handoffEntrance('An adult can help',
      '<p>Our Ground is for adults 19 and older. If you’re helping someone, Yoti can verify your age using a government ID and a matching selfie.</p>' +
      '<p>Yoti processes your ID and selfie. Our Ground uses the age threshold result and an opaque reference. <a href="https://www.yoti.com/privacy/age-verification/">Yoti privacy information</a>.</p>' +
      '<p>Finish the temporary adult session before handing the device back.</p>' +
      post('start', 'Verify with Yoti', 'return', destination(url.searchParams.get('return'))) + '<a href="/">Back to the restricted session</a>');
  }
  if (request.method !== 'POST' || request.headers.get('origin') !== url.origin ||
      request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return closed('This request could not be verified.');
  const fields = await readForm(request);
  if (!fields) return closed('This request could not be verified.');

  if (path === handoffPath + '/start') {
    const ttl = Math.min(attemptSeconds, denial.expires - now());
    if (ttl < 60) return closed('This browser session is about to expire.');
    const state = token();
    const reserved = 'reserved:' + state;
    if (await handoff.store(['SET', key, reserved, 'EX', String(ttl), 'NX']) !== 'OK') return redirect(handoffPath);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const admitted = await handoff.store(['EVAL', admitStart, '1', 'og:adult-handoff:starts:' + day, String(handoff.dailyLimit)]);
      if (admitted !== 1) {
        await change(reserved);
        return closed('Verification is unavailable for now. An adult can use their own device.', 429);
      }
      const expires = now() + ttl;
      const id = await handoff.provider.create(state, url.origin, ttl);
      const remaining = expires - now();
      if (remaining <= 0 || !await change(reserved, ['pending', state, id, expires, destination(fields.get('return'))].join(':'), remaining))
        return closed('This verification request expired.');
      // Keep the form redirect on Our Ground under the existing form-action policy.
      return redirect(handoffPath);
    } catch {
      await change(reserved);
      return closed('Verification is temporarily unavailable. Please try again later.', 503);
    }
  }
  if (path === handoffPath + '/finish') {
    const active = await verifiedAdult(request, denial, handoff);
    if (active) await change(active.raw);
    return redirect('/', cookie('') + '; Max-Age=0');
  }
  if (path !== handoffPath + '/complete' && path !== handoffPath + '/cancel') return closed('This request could not be verified.');
  const raw = await read();
  const pending = /^pending:([^:]+):([^:]+):(\d+):(\/give|\/support)$/.exec(raw);
  const submitted = fields.get('state') ?? '';
  if (!opaque.test(submitted)) return closed('This verification request is no longer available.');
  if (path.endsWith('/cancel')) {
    if (pending?.[1] === submitted && await change(raw)) return redirect('/');
    const latest = await read();
    if (activeRecord.exec(latest)?.[3] === submitted) await change(latest);
    return redirect('/');
  }
  if (!pending || submitted !== pending[1] || !yotiId.test(pending[2]) || Number(pending[3]) <= now())
    return closed('This verification request expired or is no longer available.');
  const result = await handoff.provider.result(pending[2], submitted);
  if (result === 'pending') return handoffEntrance('Verification pending', '<p>Yoti is still checking your eligibility.</p>' +
    post('complete', 'Check again', 'state', submitted) + post('cancel', 'Cancel verification', 'state', submitted), 202);
  if (result !== 'verified') {
    await change(raw);
    return closed('Yoti could not verify 19+ eligibility. Access remains restricted.');
  }
  const expires = Math.min(denial.expires, now() + sessionSeconds);
  if (Number(pending[3]) <= now() || expires <= now()) return closed('This verification request expired.');
  const value = token();
  if (!await change(raw, 'active:' + digest(value) + ':' + expires + ':' + submitted, expires - now()))
    return closed('This verification request is no longer available.');
  return redirect(pending[4], cookie(value));
}
