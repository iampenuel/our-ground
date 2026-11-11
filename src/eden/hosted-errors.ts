import {EDEN_TEXT_FAILURE_STAGES,type EdenTextFailureStage} from '../../shared/eden-conversation.ts';

type Endpoint = 'session' | 'understand' | 'plan' | 'result';
type Stage = 'session' | 'model' | 'model-output' | 'quota' | 'context' | 'location'
  | 'decision' | 'page-action' | 'reply' | 'transport' | 'cancelled';

export type TurnFailure = {
  stage: Stage;
  endpoint?: Endpoint;
  httpStatus?: number;
  code?: string;
  validationStage?: EdenTextFailureStage;
};

const unavailable = 'AI chat is unavailable right now. You can still use the directory and page controls.';
const sessionExpired = 'Your Eden session expired. Try again to start a new session.';
const contextChanged = 'The page or results changed. Please ask again using the current view.';
const invalidOutput = 'Eden couldn’t verify that reply. You can try again.';
const hostedFailures = {
  AGE_ACKNOWLEDGMENT_REQUIRED: ['session', 'Adult access expired. Try again to renew it.'],
  EDEN_SESSION_EXPIRED: ['session', sessionExpired],
  EDEN_SESSION_REQUIRED: ['session', sessionExpired],
  EDEN_SESSION_UNAVAILABLE: ['session', unavailable],
  EDEN_NOTICE_REQUIRED: ['session', 'Please review the privacy notice before chatting.'],
  EDEN_PROVIDER_TIMEOUT: ['model', 'Eden took too long to answer. You can try again.'],
  EDEN_PROVIDER_UNAVAILABLE: ['model', unavailable],
  EDEN_PROVIDER_AUTH: ['model', unavailable],
  EDEN_PROVIDER_MODEL: ['model', unavailable],
  EDEN_PROVIDER_SCHEMA: ['model', unavailable],
  EDEN_PROVIDER_QUOTA: ['quota', 'Gemini is busy right now.'],
  EDEN_USAGE_LIMIT: ['quota', 'Eden has reached its usage limit for now.'],
  EDEN_INVALID_AGENT_OUTPUT: ['model-output', invalidOutput],
  EDEN_INVALID_AGENT_ACTION: ['model-output', invalidOutput],
  EDEN_INVALID_AGENT_CLARIFICATION: ['model-output', invalidOutput],
  EDEN_AGENT_COMPOSITION_LENGTH: ['model-output', invalidOutput],
  EDEN_AGENT_COMPOSITION_REQUIRED: ['model-output', invalidOutput],
  EDEN_AGENT_COMPOSITION_SHAPE: ['model-output', invalidOutput],
  EDEN_AGENT_COMPOSITION_SOURCE: ['model-output', invalidOutput],
  EDEN_AGENT_CONTEXT_CHANGED: ['context', contextChanged],
  EDEN_AGENT_TURN_EXPIRED: ['context', contextChanged],
  EDEN_AGENT_TURN_PENDING: ['context', 'Eden is still finishing an earlier request. Wait a moment, then try again.'],
  EDEN_AGENT_RESULT_UNCONFIRMED: ['page-action', 'Eden couldn’t confirm what changed on the page.'],
  EDEN_SELECTION_CHANGED: ['context', 'That listing is no longer selected. Select it again and ask about it.'],
  EDEN_LOCATION_UNAVAILABLE: ['location', 'Location lookup is temporarily unavailable. Check the place and state or ZIP code, or try again later.'],
  DIRECTORY_LOCATION_AMBIGUOUS: ['location', 'Which U.S. state or ZIP code should I use for that place?'],
  DIRECTORY_LOCATION_UNRESOLVED: ['location', 'I couldn’t find that place. Check the city and state or ZIP code.'],
  EDEN_AGENT_CANCELLED: ['cancelled', 'Response stopped.'],
  EDEN_UNAVAILABLE: ['transport', unavailable],
  EDEN_LIMITER_UNAVAILABLE: ['transport', unavailable],
  EDEN_DISABLED: ['session', unavailable],
  EDEN_REGION_UNAVAILABLE: ['session', 'AI chat is available in the United States. You can still use the page controls.'],
} as const satisfies Record<string, readonly [Stage, string]>;

export class HostedTurnError extends Error {
  readonly failure: TurnFailure;
  readonly retryAt?: number;
  readonly model?: string;

  constructor(message: string, failure: TurnFailure, retryAt?: number, model?: string) {
    super(message);
    this.failure = failure;
    this.retryAt = retryAt;
    this.model = model;
  }
}

export function textEndpoint(path: string): Endpoint | undefined {
  switch (path) {
    case 'session': case 'understand': case 'plan': case 'result': return path;
  }
}

export function hostedResponseError(response: Response, endpoint: Endpoint | undefined, code: unknown, now = Date.now()) {
  const knownCode = typeof code === 'string' && Object.hasOwn(hostedFailures, code) ? code as keyof typeof hostedFailures : undefined;
  const [stage, message] = knownCode ? hostedFailures[knownCode] : response.status === 429
    ? ['quota', hostedFailures.EDEN_USAGE_LIMIT[1]] as const
    : [endpoint === 'session' ? 'session' : 'transport', unavailable] as const;
  const retry = response.headers.get('retry-after');
  const retryAt = retry && /^\d{1,6}$/.test(retry) ? now + Number(retry) * 1000 : retry ? Date.parse(retry) : NaN;
  const wait = stage === 'quota' && retryAt > now && retryAt <= now + 86_400_000 ? retryAt : undefined;
  const reportedModel = response.headers.get('x-eden-text-model');
  const model = reportedModel && /^gemini-[a-z0-9.-]{1,64}$/.test(reportedModel) ? reportedModel : undefined;
  const reportedStage=response.headers.get('x-eden-error-stage');
  const validationStage = EDEN_TEXT_FAILURE_STAGES.find(stage=>stage===reportedStage);
  const delay = wait ? ' Wait '+Math.ceil((wait-now)/1000)+' seconds before trying again.' : '';
  return new HostedTurnError(message+delay, {stage, endpoint, httpStatus:response.status, ...(knownCode ? {code:knownCode} : {}), ...(validationStage ? {validationStage} : {})}, wait, model);
}

export function transportError(error: unknown, endpoint?: Endpoint) {
  if (error instanceof HostedTurnError) return error;
  const message = error instanceof DOMException && error.name === 'TimeoutError'
    ? 'Eden took too long to connect. You can try again.'
    : 'Eden couldn’t connect. You can try again or use the page controls.';
  return new HostedTurnError(message, {stage:endpoint === 'session' ? 'session' : 'transport', endpoint});
}
