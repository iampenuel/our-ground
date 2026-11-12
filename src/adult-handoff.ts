import './adult-handoff.css';

export async function showAdultSession() {
  let banner: HTMLElement | undefined;
  let expiry: number | undefined;
  async function refresh() {
    const status = await fetch('/eligibility', {
      headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(6000),
    }).then(response => response.ok ? response.json() : null).catch(() => null);
    if (!Number.isSafeInteger(status?.verifiedUntil) || !Number.isSafeInteger(status?.serverTime)) {
      if (banner) location.replace('/adult-handoff');
      return;
    }
    const remaining = status.verifiedUntil - status.serverTime;
    if (remaining <= 0 || remaining > 900) { location.replace('/adult-handoff'); return; }
    window.clearTimeout(expiry);
    expiry = window.setTimeout(() => location.replace('/adult-handoff'), remaining * 1000);
    if (banner) return;
    banner = document.createElement('aside');
    banner.className = 'og-adult-session';
    banner.setAttribute('aria-label', 'Temporary adult session');
    banner.innerHTML = '<p role="status">Verified adult session. Finish before handing the device back.</p>' +
      '<form method="post" action="/adult-handoff/finish"><button type="submit">Finish adult session</button></form>';
    document.body.prepend(banner);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  }
  await refresh();
}
