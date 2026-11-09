import type { EdenLiveSnapshot } from '../live/session.ts';

type CallControls = {
  microphone(): void; speaker(): void; end(): void; stop(): void; skip(): void;
  captions(): void; resume(): void;
};
const microphone = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Zm-3 6a6 6 0 0 0 12 0M12 17v4m-4 0h8"/></svg>';
const speaker = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4-6 5H3v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
const telephone = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16v-4a13 13 0 0 1 16 0v4l-5-1v-3a12 12 0 0 0-6 0v3l-5 1Z"/></svg>';
const labels: Record<string, string> = {
  idle: 'Ready to talk', connecting: 'Connecting', introducing: 'Eden is saying hello',
  listening: 'Listening', processing: 'Thinking', acting: 'Updating the page', speaking: 'Speaking',
  muted: 'Microphone muted', 'permission-required': 'Microphone permission needed',
  reconnecting: 'Reconnecting', error: 'Call unavailable', ended: 'Call ended',
};

/** View only: microphone, provider credentials and action authority stay in their
 * respective controllers. Both call captions and typed messages use the host log. */
export function mountEdenCallView(panel: HTMLElement, controls: CallControls) {
  const section = document.createElement('section');
  section.className = 'eden-call'; section.hidden = true; section.setAttribute('aria-label', 'Call with Eden');
  section.innerHTML = `<div class="eden-call-main"><div class="eden-call-portrait" aria-hidden="true"><img src="/assets/eden/approved-profile/eden-launcher.png" alt="" width="282" height="282" decoding="async"></div>
    <p class="eden-call-name">Eden</p><p class="eden-call-status" role="status" aria-live="polite">Connecting</p>
    <div class="eden-call-activity" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="eden-call-microphone">Microphone paused</p><button class="eden-text" type="button" data-call-skip hidden>Skip greeting</button>
    <button class="eden-text" type="button" data-call-stop hidden>Stop speaking</button></div>
    <div class="eden-call-controls"><button type="button" data-call-mic>${microphone}<span>Mic</span></button><button type="button" data-call-speaker>${speaker}<span>Sound</span></button><button type="button" class="eden-call-end" data-call-end>${telephone}<span>End call</span></button></div>
    <button class="eden-text eden-call-captions" type="button" data-call-captions aria-controls="eden-conversation" aria-pressed="false">Show captions &amp; chat</button>`;
  panel.insertBefore(section, panel.querySelector('.eden-body'));
  const mini = document.createElement('div'); mini.className = 'eden-call-mini'; mini.hidden = true;
  mini.setAttribute('aria-label', 'Active call with Eden');
  mini.innerHTML = `<button type="button" data-call-resume aria-label="Return to call with Eden"><span class="eden-call-mini-dot" aria-hidden="true"></span><span data-call-mini-status>Call with Eden</span></button><button type="button" data-call-end aria-label="End call with Eden">${telephone}</button>`;
  panel.parentElement!.append(mini);
  const bind = (host: HTMLElement, selector: string, callback: () => void) => host.querySelector(selector)!.addEventListener('click', callback);
  bind(section, '[data-call-mic]', controls.microphone); bind(section, '[data-call-speaker]', controls.speaker);
  bind(section, '[data-call-end]', controls.end); bind(section, '[data-call-stop]', controls.stop);
  bind(section, '[data-call-skip]', controls.skip); bind(section, '[data-call-captions]', controls.captions);
  bind(mini, '[data-call-resume]', controls.resume); bind(mini, '[data-call-end]', controls.end);
  const get = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  return {
    portrait: get('.eden-call-portrait'),
    render(value: Readonly<EdenLiveSnapshot>, active: boolean, minimized: boolean, captions: boolean) {
      section.hidden = !active; mini.hidden = !active || !minimized;
      section.classList.toggle('eden-call-with-captions', captions);
      get('.eden-call-status').textContent = value.phase === 'connecting' && value.reason ? value.reason : labels[value.phase] ?? 'Call with Eden';
      get('.eden-call-microphone').textContent = value.microphoneForwarding ? 'Microphone on · audio is going to Google' : value.microphoneMuted ? 'Microphone muted' : 'Microphone paused';
      const mic = get('[data-call-mic]'), sound = get('[data-call-speaker]');
      mic.setAttribute('aria-label', value.microphoneMuted ? 'Unmute microphone' : 'Mute microphone');
      mic.setAttribute('aria-pressed', String(value.microphoneMuted));
      sound.setAttribute('aria-label', value.speakerMuted ? 'Unmute speaker' : 'Mute speaker');
      sound.setAttribute('aria-pressed', String(value.speakerMuted));
      get('[data-call-skip]').hidden = value.phase !== 'introducing';
      get('[data-call-stop]').hidden = value.phase !== 'speaking';
      get('[data-call-captions]').setAttribute('aria-pressed', String(captions));
      get('[data-call-captions]').textContent = captions ? 'Hide captions & chat' : 'Show captions & chat';
      mini.querySelector('[data-call-mini-status]')!.textContent = value.microphoneForwarding ? 'Eden · Microphone on' : 'Eden · '+(value.microphoneMuted ? 'Mic muted' : 'Mic paused');
      mini.classList.toggle('eden-call-forwarding', value.microphoneForwarding);
    },
    level(value: number) { section.style.setProperty('--eden-call-level', String(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0)); },
    dispose() { section.remove(); mini.remove(); },
  };
}
