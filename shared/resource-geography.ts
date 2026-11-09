import { usStates } from './us-location.ts';
import type { USStateCode } from './us-location.ts';

// Resource datasets can cover these territories independently of geocoding providers.
export const resourceStateCodes = [...Object.keys(usStates), 'PR', 'VI', 'GU', 'AS', 'MP'] as readonly string[];
export type USResourceStateCode = USStateCode | 'PR' | 'VI' | 'GU' | 'AS' | 'MP';
export function isResourceState(value: unknown): value is USResourceStateCode {
  return typeof value === 'string' && resourceStateCodes.includes(value);
}
