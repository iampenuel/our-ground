import { EDEN_NOTICE_VERSION, validateEdenPageContext, validateEdenProviderAction } from './eden-assistant.ts';
import type { EdenPageContext } from './eden-assistant.ts';

export type EdenReviewScenarioId = 'food-step-free' | 'food-short-trip';
export type EdenReviewCandidate = {
  index: 1 | 2 | 3;
  label: string;
  distanceMiles: 2 | 5 | 10;
  access: 'step-free' | 'stairs';
  hours: 'open-now' | 'later-today';
};
export type EdenReviewScenario = {
  id: EdenReviewScenarioId;
  title: string;
  goal: 'step-free-today' | 'short-trip-today';
  prompt: string;
  priorities: readonly ('open-now' | 'shorter-distance')[];
  candidates: readonly EdenReviewCandidate[];
};
const candidates = Object.freeze([
  Object.freeze({ index: 1, label: 'Sample Maple Pantry', distanceMiles: 2, access: 'stairs', hours: 'open-now' }),
  Object.freeze({ index: 2, label: 'Sample River Pantry', distanceMiles: 5, access: 'step-free', hours: 'later-today' }),
  Object.freeze({ index: 3, label: 'Sample Oak Pantry', distanceMiles: 10, access: 'step-free', hours: 'open-now' }),
] satisfies EdenReviewCandidate[]);

/** Fixed fictional facts owned by the application. A browser request can select
 * a scenario ID, but cannot supply candidates, preferences, labels or facts.
 * Labels are display-only and never included in the model input.
 */
export const EDEN_REVIEW_SCENARIOS: readonly EdenReviewScenario[] = Object.freeze([
  Object.freeze({ id: 'food-step-free', title: 'Step-free access today', goal: 'step-free-today',
    prompt: 'Compare the sample food options. Require step-free access today; prefer open now, then a shorter trip.',
    priorities: Object.freeze(['open-now', 'shorter-distance'] as const), candidates }),
  Object.freeze({ id: 'food-short-trip', title: 'A shorter food trip today', goal: 'short-trip-today',
    prompt: 'Compare the sample food options. Stay within five miles today; prefer a shorter trip, then open now.',
    priorities: Object.freeze(['shorter-distance', 'open-now'] as const), candidates }),
]);

export const EDEN_REVIEW_REASON_LABELS = Object.freeze({
  STEP_FREE_ACCESS: 'The sample listing has step-free access.',
  WITHIN_FIVE_MILES: 'The sample listing is within five miles.',
  OPEN_NOW: 'The sample listing is open now.',
  OPEN_LATER_TODAY: 'The sample listing opens later today.',
  NEAREST_ADMISSIBLE: 'This is the nearest option that meets the scenario requirement.',
  LONGER_TRAVEL: 'Another qualifying option is closer, so this choice involves more travel.',
  STAIRS_PRESENT: 'The sample listing includes stairs.',
});
export type EdenReviewReasonCode = keyof typeof EDEN_REVIEW_REASON_LABELS;
export type EdenReviewPlan = {
  scenarioId: EdenReviewScenarioId;
  action: { type: 'select'; index: number };
  reasonCodes: EdenReviewReasonCode[];
};
export type EdenPlanRequest = { scenarioId: EdenReviewScenarioId; context: EdenPageContext; noticeVersion: typeof EDEN_NOTICE_VERSION };
export type EdenPlanResponse = EdenReviewPlan & { engine: 'gemini' };

function dataObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some(key => typeof key !== 'string' || !('value' in descriptors[key]))) return null;
    return Object.fromEntries(keys.map(key => [key, descriptors[key as string].value]));
  } catch { return null; }
}
/** Capture only a dense, bounded JSON array of own data values. A custom
 * iterator, getter, hidden field or subclass cannot execute during validation.
 */
function reasonArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!Number.isInteger(length) || length < 2 || length > 3) return null;
    const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.length !== length + 1 || keys.some(key => typeof key !== 'string')) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch { return null; }
}
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function isEdenReviewScenarioId(value: unknown): value is EdenReviewScenarioId {
  return value === 'food-step-free' || value === 'food-short-trip';
}
export function getEdenReviewScenario(value: unknown): EdenReviewScenario | null {
  return isEdenReviewScenarioId(value) ? EDEN_REVIEW_SCENARIOS.find(scenario => scenario.id === value)! : null;
}
export function edenReviewContext(scenarioId: EdenReviewScenarioId): EdenPageContext {
  if (!getEdenReviewScenario(scenarioId)) throw new Error('Invalid EDEN review scenario.');
  return { page: 'support', category: 'food', radius: 25, resultCount: 3, synthetic: true };
}
export function validateEdenPlanRequest(value: unknown): EdenPlanRequest | null {
  const body = dataObject(value);
  if (!body || !exact(body, ['scenarioId', 'context', 'noticeVersion']) || !isEdenReviewScenarioId(body.scenarioId) || body.noticeVersion !== EDEN_NOTICE_VERSION) return null;
  const context = validateEdenPageContext(body.context);
  if (!context || context.page !== 'support' || context.category !== 'food' || context.radius !== 25 || context.resultCount !== 3 || !context.synthetic) return null;
  return { scenarioId: body.scenarioId, context, noticeVersion: EDEN_NOTICE_VERSION };
}
export function edenReviewAdmissibleCandidates(scenarioId: EdenReviewScenarioId): readonly EdenReviewCandidate[] {
  const scenario = getEdenReviewScenario(scenarioId);
  if (!scenario) return [];
  return scenario.candidates.filter(candidate => scenario.goal === 'step-free-today' ? candidate.access === 'step-free' : candidate.distanceMiles <= 5);
}
export function edenReviewAllowedReasons(scenarioId: EdenReviewScenarioId, index: number): EdenReviewReasonCode[] {
  const admissible = edenReviewAdmissibleCandidates(scenarioId), candidate = admissible.find(item => item.index === index);
  if (!candidate) return [];
  const nearest = Math.min(...admissible.map(item => item.distanceMiles));
  return [
    candidate.access === 'step-free' ? 'STEP_FREE_ACCESS' : 'STAIRS_PRESENT',
    ...(candidate.distanceMiles <= 5 ? ['WITHIN_FIVE_MILES' as const] : []),
    candidate.hours === 'open-now' ? 'OPEN_NOW' : 'OPEN_LATER_TODAY',
    candidate.distanceMiles === nearest ? 'NEAREST_ADMISSIBLE' : 'LONGER_TRAVEL',
  ];
}
export function validateEdenReviewPlan(value: unknown, expectedScenarioId?: EdenReviewScenarioId): EdenReviewPlan | null {
  const plan = dataObject(value);
  if (!plan || !exact(plan, ['scenarioId', 'action', 'reasonCodes']) || !isEdenReviewScenarioId(plan.scenarioId)
    || (expectedScenarioId !== undefined && plan.scenarioId !== expectedScenarioId)) return null;
  const action = validateEdenProviderAction(plan.action), reasons = reasonArray(plan.reasonCodes);
  if (!action || action.type !== 'select' || !reasons
    || new Set(reasons).size !== reasons.length) return null;
  const allowed = edenReviewAllowedReasons(plan.scenarioId, action.index);
  const goalReason = plan.scenarioId === 'food-step-free' ? 'STEP_FREE_ACCESS' : 'WITHIN_FIVE_MILES';
  if (!allowed.length || reasons.some(reason => typeof reason !== 'string' || !allowed.includes(reason as EdenReviewReasonCode))
    || !reasons.includes(goalReason) || !reasons.some(reason => reason === 'OPEN_NOW' || reason === 'OPEN_LATER_TODAY')) return null;
  return { scenarioId: plan.scenarioId, action: { type: 'select', index: action.index }, reasonCodes: [...reasons] as EdenReviewReasonCode[] };
}
export function validateEdenPlanResponse(value: unknown, expectedScenarioId?: EdenReviewScenarioId): EdenPlanResponse | null {
  const response = dataObject(value);
  if (!response || !exact(response, ['engine', 'scenarioId', 'action', 'reasonCodes']) || response.engine !== 'gemini') return null;
  const plan = validateEdenReviewPlan({ scenarioId: response.scenarioId, action: response.action, reasonCodes: response.reasonCodes }, expectedScenarioId);
  return plan ? { engine: 'gemini', ...plan } : null;
}
/** Quality check separate from admissibility/factual validation. A model can
 * choose any admissible candidate in its schema, but a strictly worse ordered
 * preference must not be presented as meeting the stated comparison goal.
 * This predicate never chooses, rewrites or substitutes a model action.
 */
export function edenReviewChoiceMatchesPriorities(value: unknown): boolean {
  const plan = validateEdenReviewPlan(value) ?? validateEdenPlanResponse(value);
  if (!plan) return false;
  const scenario = getEdenReviewScenario(plan.scenarioId)!;
  const admissible = edenReviewAdmissibleCandidates(plan.scenarioId), selected = admissible.find(candidate => candidate.index === plan.action.index)!;
  const metric = (candidate: EdenReviewCandidate, priority: EdenReviewScenario['priorities'][number]) =>
    priority === 'open-now' ? (candidate.hours === 'open-now' ? 0 : 1) : candidate.distanceMiles;
  return !admissible.some(candidate => {
    for (const priority of scenario.priorities) {
      const difference = metric(candidate, priority) - metric(selected, priority);
      if (difference < 0) return true;
      if (difference > 0) return false;
    }
    return false; // Equal preference profiles are permitted.
  });
}
/** Renders only application-owned labels. No model prose or reasoning trace. */
export function edenPlanExplanation(value: unknown): string {
  const plan = validateEdenReviewPlan(value) ?? validateEdenPlanResponse(value);
  if (!plan) return 'This sample comparison is unavailable.';
  const candidate = getEdenReviewScenario(plan.scenarioId)!.candidates.find(item => item.index === plan.action.index)!;
  return `${candidate.label}: ${plan.reasonCodes.map(reason => EDEN_REVIEW_REASON_LABELS[reason]).join(' ')} Review this sample choice before applying it.`;
}
