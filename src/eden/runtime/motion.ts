import type { EdenMouthPose, EdenState } from '../types/eden.ts';
export const MOUTH_POSES: Record<EdenMouthPose, { width: number; open: number; teeth: number }> = {
  closed: { width: .88, open: .035, teeth: 0 }, slight: { width: .91, open: .25, teeth: 1 },
  medium: { width: .96, open: .57, teeth: 1 }, wide: { width: 1, open: 1.04, teeth: 1 },
  rounded: { width: .50, open: .68, teeth: .2 }, smile: { width: 1.03, open: .78, teeth: 1 },
};
export function mouthAt(level: number) {
  const poses = Object.values(MOUTH_POSES), t = Math.max(0, Math.min(1, level)) * 5;
  const i = Math.min(4, Math.floor(t)), k = t - i, a = poses[i], b = poses[i + 1];
  return { width: a.width + (b.width - a.width) * k, open: a.open + (b.open - a.open) * k, teeth: a.teeth + (b.teeth - a.teeth) * k };
}
export const EXPRESSION: Record<EdenState, { tilt: number; y: number; brow: number; gaze: number; mouth: number }> = {
  idle: { tilt: 0, y: 0, brow: 0, gaze: 0, mouth: 1 },
  listening: { tilt: -1.03, y: -4, brow: -5, gaze: 1, mouth: .20 },
  thinking: { tilt: .69, y: -2, brow: -8, gaze: 3, mouth: .08 },
  searching: { tilt: .23, y: -3, brow: -3, gaze: -3, mouth: .16 },
  speaking: { tilt: -.34, y: -3, brow: -2, gaze: 0, mouth: 0 },
  success: { tilt: 0, y: 3, brow: -7, gaze: 0, mouth: 1 },
  clarifying: { tilt: 1.26, y: -2, brow: -9, gaze: 2, mouth: .25 },
  unable: { tilt: -.46, y: 1, brow: 2, gaze: 0, mouth: .13 },
};
/** Stable critically damped spring, retaining velocity when its target changes. */
export class Spring {
  velocity = 0;
  value: number;
  constructor(value: number) { this.value = value; }
  step(target: number, dt: number, frequency = 13) {
    const offset = this.value - target, decay = Math.exp(-frequency * dt);
    const c = this.velocity + frequency * offset;
    this.value = target + (offset + c * dt) * decay;
    this.velocity = (this.velocity - frequency * c * dt) * decay;
    return this.value;
  }
  snap(value: number) { this.value = value; this.velocity = 0; }
}
/** Asymmetric closure: 75ms down, 35ms hold, 140ms open. */
export function blinkClosure(seconds: number) {
  const ease = (v: number) => v * v * (3 - 2 * v);
  if (seconds < 0 || seconds >= .25) return 0;
  if (seconds < .075) return ease(seconds / .075);
  if (seconds < .11) return 1;
  return 1 - ease((seconds - .11) / .14);
}
