export const EDEN_STATES = ['idle', 'listening', 'thinking', 'searching', 'speaking', 'success', 'clarifying', 'unable'] as const;
export type EdenState = typeof EDEN_STATES[number];
export type EdenMouthPose = 'closed' | 'slight' | 'medium' | 'wide' | 'rounded' | 'smile';
export interface EdenSnapshot { state: EdenState; audioLevel: number; reducedMotion: boolean; paused: boolean }
export type EdenEvent =
  | { type: 'microphone-activated' | 'listening-started' | 'speech-detected' | 'listening-stopped' | 'processing' | 'clarification-needed' | 'playback-started' | 'playback-interrupted' | 'playback-completed' }
  | { type: 'audio-level'; level: number }
  | { type: 'search-started' | 'search-completed' | 'search-failed'; requestId: string };
export interface EdenRenderer {
  setState(state: EdenState): void;
  setAudioLevel(level: number): void;
  setReducedMotion(reduced: boolean): void;
  setPaused(paused: boolean): void;
  setMouthPose?(pose: EdenMouthPose | null): void;
  blink?(): void;
  dispose(): void;
}
export const STATE_COPY: Record<EdenState, { label: string; status: string; description: string }> = {
  idle: { label: 'Idle', status: 'Here when you need me.', description: 'A relaxed smile, quiet breathing, and unhurried blinks.' },
  listening: { label: 'Listening', status: 'You have my attention.', description: 'A gentle head tilt and a focused, welcoming expression.' },
  thinking: { label: 'Thinking', status: 'Taking a moment to understand.', description: 'A small glance and thoughtful brow movement.' },
  searching: { label: 'Searching', status: 'Looking for a way forward.', description: 'Attentive eyes while a resource request is in progress.' },
  speaking: { label: 'Speaking', status: 'Let’s take the next step together.', description: 'Mouth movement follows the activity control below.' },
  success: { label: 'Success', status: 'One step closer.', description: 'A small nod, a brighter smile, then a return to idle.' },
  clarifying: { label: 'Clarifying', status: 'Tell me a little more.', description: 'A curious tilt with a gently raised brow.' },
  unable: { label: 'Unable to help', status: 'We can try another way.', description: 'A calm, considerate expression that stays reassuring.' },
};
