import { GoogleGenAI } from '@google/genai';
import { createEdenProvider, EdenProviderError } from './eden-provider.ts';
import type { EdenModelRequest, EdenProviderStatus } from './eden-provider.ts';
import {
  edenReviewAdmissibleCandidates, edenReviewAllowedReasons, getEdenReviewScenario,
  validateEdenPlanRequest, validateEdenReviewPlan, edenReviewChoiceMatchesPriorities,
} from '../shared/eden-review.ts';
import type { EdenPlanRequest, EdenReviewPlan } from '../shared/eden-review.ts';

export const EDEN_REVIEW_TOOL = 'propose_sample_resource_choice';
export const EDEN_REVIEW_MAX_OUTPUT_TOKENS = 1024;
export const EDEN_REVIEW_TIMEOUT_MS = 15_000;
export type EdenPlanner = { status(): EdenProviderStatus; plan(request: EdenPlanRequest, signal?: AbortSignal): Promise<EdenReviewPlan> };
export type EdenPlannerOptions = { create?: (request: EdenModelRequest, signal: AbortSignal) => Promise<unknown> };
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }

/** A real model comparison among multiple admissible fictional choices. The
 * application fixes hard constraints; the model ranks the remaining tradeoffs.
 * Only the chosen action and fact-checked reason codes leave this adapter.
 */
export function createEdenPlanner(environment: Record<string, string | undefined>, options: EdenPlannerOptions = {}): EdenPlanner {
  const env = { ...environment }, status = createEdenProvider(env).status;
  let client: GoogleGenAI | undefined;
  return {
    status,
    async plan(request, signal) {
      const eligibility = status(), safe = validateEdenPlanRequest(request);
      if (!eligibility.available || !eligibility.model) throw new EdenProviderError('EDEN_DISABLED', 403);
      if (!safe) throw new EdenProviderError('EDEN_INVALID_PLAN_REQUEST', 422);
      const scenario = getEdenReviewScenario(safe.scenarioId)!, admissible = edenReviewAdmissibleCandidates(scenario.id);
      const reasons = [...new Set(admissible.flatMap(candidate => edenReviewAllowedReasons(scenario.id, candidate.index)))];
      const payload: EdenModelRequest = {
        model: eligibility.model,
        input: JSON.stringify({
          purpose: 'compare_fictional_public_resource_options',
          scenario: { id: scenario.id, goal: scenario.goal, priorities: [...scenario.priorities],
            comparison_rule: 'lexicographic_first_difference',
            priority_semantics: { 'open-now': ['open-now', 'later-today'], 'shorter-distance': 'ascending_distance_miles' },
            candidates: scenario.candidates.map(({ index, distanceMiles, access, hours }) => ({ index, distanceMiles, access, hours })),
            admissible_indices: admissible.map(candidate => candidate.index) },
          page_context: safe.context,
          reason_codes: reasons,
        }),
        system_instruction: 'Compare only the fictional candidate facts in this request. First exclude candidates not in admissible_indices. Then independently select the best remaining option using the exact order of scenario.priorities. This order is lexicographic: compare the FIRST priority; only when candidates tie on that priority compare the SECOND. Never trade a better first priority for a better second priority. For open-now, open-now is strictly preferred to later-today. For shorter-distance, fewer distanceMiles is strictly preferred. Both goals require availability today; step-free-today additionally requires step-free access; short-trip-today requires at most five miles. Make your own selection from these facts; do not infer that the nearest candidate is preferred when open-now is the first priority. Call only the supplied function with one select action and two or three truthful reason codes. Include STEP_FREE_ACCESS for step-free-today or WITHIN_FIVE_MILES for short-trip-today, plus the matching OPEN_NOW or OPEN_LATER_TODAY code. NEAREST_ADMISSIBLE means closest among qualifying options; LONGER_TRAVEL means a qualifying option is closer and is an appropriate tradeoff when a higher priority wins. Do not produce prose, hidden reasoning, medical advice, personal data, invented facts, URLs or additional actions. The user must review the proposal before the website applies it.',
        tools: [{ type: 'function', name: EDEN_REVIEW_TOOL, description: 'Propose one reviewed sample resource choice with factual reason codes.', parameters: {
          type: 'object', additionalProperties: false, required: ['scenarioId', 'action', 'reasonCodes'], properties: {
            scenarioId: { type: 'string', enum: [scenario.id] },
            action: { type: 'object', additionalProperties: false, required: ['type', 'index'], properties: {
              type: { type: 'string', enum: ['select'] }, index: { type: 'integer', enum: admissible.map(candidate => candidate.index) },
            } },
            reasonCodes: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string', enum: reasons } },
          },
        } }],
        generation_config: { max_output_tokens: EDEN_REVIEW_MAX_OUTPUT_TOKENS, thinking_level: 'low',
          thinking_summaries: 'none', tool_choice: { allowed_tools: { mode: 'any', tools: [EDEN_REVIEW_TOOL] } } },
        store: false, automatic_continuation: false,
      };
      const combined = AbortSignal.any([AbortSignal.timeout(EDEN_REVIEW_TIMEOUT_MS), ...(signal ? [signal] : [])]);
      let response: unknown;
      try {
        combined.throwIfAborted();
        if (options.create) response = await options.create(payload, combined);
        else {
          client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1beta', enterprise: false, vertexai: false,
            httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com', timeout: EDEN_REVIEW_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
          response = await client.interactions.create(payload, { retries: { strategy: 'none' }, signal: combined, timeout_ms: EDEN_REVIEW_TIMEOUT_MS });
        }
        combined.throwIfAborted();
      } catch (error) {
        const upstream = object(error), code = Number(upstream?.status ?? upstream?.code);
        throw new EdenProviderError(code === 429 ? 'EDEN_PROVIDER_QUOTA' : 'EDEN_PROVIDER_UNAVAILABLE', code === 429 ? 429 : 503);
      }
      const body = object(response);
      if (!body || !['requires_action', 'completed'].includes(String(body.status)) || !Array.isArray(body.steps)
        || body.steps.length < 1 || body.steps.length > 8) throw new EdenProviderError('EDEN_INVALID_PROVIDER_PLAN', 502);
      const steps = body.steps.map(object);
      if (steps.some(step => !step || !['thought', 'function_call'].includes(String(step.type)))) throw new EdenProviderError('EDEN_INVALID_PROVIDER_PLAN', 502);
      const calls = steps.filter(step => step?.type === 'function_call'), call = calls[0];
      const plan = call ? validateEdenReviewPlan(call.arguments, safe.scenarioId) : null;
      if (calls.length !== 1 || call?.name !== EDEN_REVIEW_TOOL || !plan) throw new EdenProviderError('EDEN_INVALID_PROVIDER_PLAN', 502);
      if (!edenReviewChoiceMatchesPriorities(plan)) throw new EdenProviderError('EDEN_PLAN_PRIORITY_MISMATCH', 503);
      return plan;
    },
  };
}
