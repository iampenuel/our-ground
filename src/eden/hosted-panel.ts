import {EDEN_MAX_COMMAND_LENGTH} from '../../shared/eden-assistant.ts';

/** The hosted widget shares the approved header and launcher with the review
 * widget. Only the transcript area scrolls, including when consent is visible. */
export function renderHostedPanel(panel: HTMLElement) {
  const header=panel.querySelector('header')!;
  panel.replaceChildren(header);
  header.insertAdjacentHTML('afterend', `
    <div class="eden-page"><span data-context></span></div>
    <div class="eden-body" id="eden-conversation">
      <div data-history>
        <p class="eden-welcome">What can I help you find?</p>
        <div class="eden-log" role="log" aria-label="Conversation with Eden" aria-live="polite" aria-relevant="additions"></div>
        <div class="eden-consent" hidden>
          <h3>Before we chat</h3>
          <label data-age-row><input type="checkbox" data-adult> I am 19 or older.</label>
          <label data-privacy-row><input type="checkbox" data-hosted-consent> I agree to use Google Gemini. Google may use requests and answers for product improvement and human review.</label>
          <div class="eden-consent-actions"><button type="button" class="eden-primary" data-continue>Continue</button><button type="button" class="eden-text" data-consent-cancel>Not now</button></div>
        </div>
      </div>
      <section class="eden-settings" id="eden-settings" aria-labelledby="eden-settings-title" hidden>
        <h3 id="eden-settings-title" tabindex="-1">Privacy &amp; voice</h3>
        <p>Google processes approved requests and may use them for product improvement and human review. Keep personal, medical and financial details out of chat.</p>
        <p><strong>Dictate</strong> uses on-device English recognition to put your words in a draft. Edit the draft and press Send when you’re ready. Our Ground does not record or store microphone audio.</p>
        <p><strong>Read reply</strong> reads an eligible answer aloud with Google’s Aoede voice. To use an installed device voice, choose one below.</p>
        <p>Chat history stays in this page’s memory. New chat clears it. <a href="/privacy#edenPrivacyTitle">Full privacy details</a></p>
        <label for="eden-read-voice">Read replies with</label><select id="eden-read-voice"></select>
        <button type="button" class="eden-text" data-preview>Preview device voice</button>
      </section>
    </div>
    ${import.meta.env.VITE_EDEN_HOSTED_LIVE==='true'?`<section class="eden-live-strip" aria-label="Voice call">
      <button class="eden-text" type="button" data-live-start>Talk to Eden</button>
      <div data-live-consent hidden><p>During a call, your microphone audio goes directly to Google. Google may use it for product improvement and human review. Avoid personal or medical information. Our Ground does not save call audio or transcripts.</p><button data-live-confirm type="button">Agree and start call</button> <button class="eden-text" data-live-cancel type="button">Cancel</button></div>
      <div data-live-actions hidden><span data-live-clock aria-label="Time remaining"></span>
        <button data-live-mute type="button">Mute</button> <button data-live-interrupt type="button">Interrupt</button> <button data-live-end type="button">End call</button>
      </div><span role="status" data-live-state></span><details hidden data-live-details><summary>Call details</summary><small data-live-receipt></small></details></section>`:''}
    <p class="eden-state" role="status" aria-live="polite" aria-atomic="true" hidden></p>
    <form class="eden-composer"><label class="eden-sr-only" for="eden-command">Message Eden</label>
      <div class="eden-input"><textarea id="eden-command" rows="1" maxlength="${EDEN_MAX_COMMAND_LENGTH}" placeholder="Message Eden…" aria-describedby="eden-input-help"></textarea>
        <div class="eden-composer-actions"><button type="button" class="eden-icon" data-call aria-label="Dictate a message" title="Dictate a message to review before sending" aria-pressed="false"><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v4m-3 0h6"/></svg><span data-dictation-label>Dictate</span></button>
          <button type="button" class="eden-text" data-speak title="Read Eden’s reply aloud" hidden>Read reply</button>
          <button type="button" class="eden-text" data-retry hidden>Try again</button>
          <button type="submit" class="eden-send" data-send aria-label="Send request">↑</button>
          <button type="button" class="eden-send eden-stop" data-stop hidden aria-label="Stop response">■</button>
        </div>
      </div>
      <p id="eden-input-help">Avoid sharing personal or medical details.</p>
    </form>
    <footer class="eden-footer"><button type="button" class="eden-text" data-reset>New chat</button>
      <button type="button" class="eden-text" data-settings aria-expanded="false" aria-controls="eden-settings">Privacy &amp; voice</button></footer>`);
}
