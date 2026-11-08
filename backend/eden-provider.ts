import { GoogleGenAI } from '@google/genai';
import { validateEdenPageContext, validateEdenProviderAction } from '../shared/eden-assistant.ts';
import type { EdenPageContext, EdenProviderAction } from '../shared/eden-assistant.ts';

/** Reviewed against official Standard free-tier pricing on 2026-11-06. This
 * allowlist is not evidence that a particular operator account has no billing.
 */
export const EDEN_TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'] as const;
export type EdenTextModel = typeof EDEN_TEXT_MODELS[number];
export type EdenProviderStatus = {
  available: boolean;
  reason: 'available' | 'disabled' | 'development-only' | 'free-tier-unconfirmed' | 'model-not-approved' | 'key-missing';
  model: EdenTextModel | null;
};
export class EdenProviderError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code === 'EDEN_PLAN_PRIORITY_MISMATCH'
      ? 'The model’s sample choice did not match the scenario’s stated priorities. Review the sample options with the local controls.'
      : 'EDEN could not complete this request. Continue with the local text controls.');
    this.code = code;
    this.status = status;
  }
}
export const EDEN_NAVIGATION_TOOL = 'propose_public_navigation';
export type EdenModelRequest = {
  model: EdenTextModel;
  input: string;
  system_instruction: string;
  tools: Array<{ type: 'function'; name: string; description: string; parameters: Record<string, unknown> }>;
  generation_config: {
    max_output_tokens: number;
    thinking_level: 'minimal' | 'low';
    thinking_summaries: 'none';
    tool_choice: { allowed_tools: { mode: 'any'; tools: string[] } };
  };
  store: false;
  automatic_continuation: false;
};
export type EdenProvider = {
  status(): EdenProviderStatus;
  propose(action: EdenProviderAction, context: EdenPageContext, signal?: AbortSignal): Promise<EdenProviderAction>;
};
export type EdenProviderOptions = {
  /** Synthetic test injection; never receives a visitor message or a secret. */
  create?: (request: EdenModelRequest, signal: AbortSignal) => Promise<unknown>;
};

export function isEdenHostedRuntime(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV)
    || Boolean(env.NETLIFY) || Boolean(env.AWS_LAMBDA_FUNCTION_NAME) || Boolean(env.K_SERVICE)
    || Boolean(env.FUNCTIONS_WORKER_RUNTIME) || Boolean(env.RENDER) || Boolean(env.FLY_APP_NAME)
    || env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function approvedInput(action: unknown, context: unknown): { action: EdenProviderAction; context: EdenPageContext } {
  const safeAction = validateEdenProviderAction(action), safeContext = validateEdenPageContext(context);
  if (!safeAction || !safeContext || !safeContext.synthetic
    || ((safeAction.type === 'details' || safeAction.type === 'select') && safeAction.index > safeContext.resultCount)) {
    throw new EdenProviderError('EDEN_INVALID_ACTION', 422);
  }
  return { action: safeAction, context: safeContext };
}

/** No tools execute here. The model can only echo the single, already approved
 * enum action; the website revalidates it and operates on its own current state.
 * No continuation IDs, server conversation state, grounding, caching or retries.
 */
export function createEdenProvider(environment: Record<string, string | undefined>, options: EdenProviderOptions = {}): EdenProvider {
  const env = { ...environment };
  const configuredModel = env.EDEN_GEMINI_TEXT_MODEL ?? 'gemini-3.5-flash-lite';
  const model = EDEN_TEXT_MODELS.includes(configuredModel as EdenTextModel) ? configuredModel as EdenTextModel : null;
  const secret = env.GEMINI_API_KEY;
  const status = (): EdenProviderStatus => {
    const base = { model };
    if (env.EDEN_GEMINI_MODE !== 'synthetic-development') return { ...base, available: false, reason: 'disabled' };
    if (isEdenHostedRuntime(env)) return { ...base, available: false, reason: 'development-only' };
    if (env.EDEN_GEMINI_FREE_TIER_CONFIRMED !== 'true') return { ...base, available: false, reason: 'free-tier-unconfirmed' };
    if (!model) return { ...base, available: false, reason: 'model-not-approved' };
    if (!secret || secret !== secret.trim() || /\s/.test(secret) || secret.length < 12 || secret.length > 4096) return { ...base, available: false, reason: 'key-missing' };
    return { ...base, available: true, reason: 'available' };
  };
  let client: GoogleGenAI | undefined;
  return {
    status,
    async propose(action, context, signal) {
      if (!status().available || !model) throw new EdenProviderError('EDEN_DISABLED', 403);
      const safe = approvedInput(action, context);
      const properties = Object.fromEntries(Object.entries(safe.action).map(([key, value]) => [key, {
        type: typeof value === 'number' ? 'integer' : 'string', enum: [value],
      }]));
      const payload: EdenModelRequest = {
        model,
        input: JSON.stringify({ purpose: 'synthetic_public_navigation', requested_action: safe.action, page_context: safe.context }),
        system_instruction: 'This is a synthetic public resource navigation demonstration. Call only the provided function with exactly the supplied requested_action. Do not produce advice, resource facts, URLs, personal information, additional actions or prose. No function executes automatically.',
        tools: [{ type: 'function', name: EDEN_NAVIGATION_TOOL,
          description: 'Propose the exact supplied public navigation action for separate website validation.',
          parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } }],
        generation_config: {
          max_output_tokens: 256,
          // The cap includes thinking. Select the lowest documented level for
          // each approved model instead of inheriting a larger dynamic budget.
          thinking_level: model === 'gemini-3.5-flash-lite' ? 'minimal' : 'low',
          thinking_summaries: 'none',
          tool_choice: { allowed_tools: { mode: 'any', tools: [EDEN_NAVIGATION_TOOL] } },
        },
        store: false,
        automatic_continuation: false,
      };
      const combined = AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
      let response: unknown;
      try {
        combined.throwIfAborted();
        if (options.create) response = await options.create(payload, combined);
        else {
          client ??= new GoogleGenAI({ apiKey: secret, apiVersion: 'v1beta', enterprise: false, vertexai: false, httpOptions: {
            // Do not inherit GOOGLE_GEMINI_BASE_URL or a global proxy default.
            baseUrl: 'https://generativelanguage.googleapis.com', timeout: 10_000, retryOptions: { attempts: 1 },
          } });
          response = await client.interactions.create(payload, { retries: { strategy: 'none' }, signal: combined, timeout_ms: 10_000 });
        }
        combined.throwIfAborted();
      } catch (error) {
        const upstream = object(error), statusCode = Number(upstream?.status ?? upstream?.code);
        // SDK exceptions may contain URLs, credentials or prompt/response content.
        // Never log, persist, return or attach the upstream error as a cause.
        throw new EdenProviderError(statusCode === 429 ? 'EDEN_PROVIDER_QUOTA' : 'EDEN_PROVIDER_UNAVAILABLE', statusCode === 429 ? 429 : 503);
      }
      const body = object(response);
      if (!body || !['requires_action', 'completed'].includes(String(body.status)) || !Array.isArray(body.steps)
        || body.steps.length < 1 || body.steps.length > 8) throw new EdenProviderError('EDEN_INVALID_PROVIDER_ACTION', 502);
      const steps = body.steps.map(object);
      if (steps.some(step => !step || !['function_call', 'thought'].includes(String(step.type)))) throw new EdenProviderError('EDEN_INVALID_PROVIDER_ACTION', 502);
      const calls = steps.filter(step => step?.type === 'function_call');
      const call = calls[0], proposed = call ? validateEdenProviderAction(call.arguments) : null;
      if (calls.length !== 1 || call?.name !== EDEN_NAVIGATION_TOOL || !proposed
        || JSON.stringify(proposed) !== JSON.stringify(safe.action)) throw new EdenProviderError('EDEN_INVALID_PROVIDER_ACTION', 502);
      return proposed;
    },
  };
}
