import './styles.css';
import './support.css';
import './discovery.css';
import './unified-support.css';
import './support-resource-context.css';
import { mountSupportPage } from './support-page';
import { apiRequest } from './api-client';
import { header, footer } from './navigation';

const localReview = import.meta.env.DEV && import.meta.env.MODE === 'eden-review'
  && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
let evaluationData = false;
const root = document.querySelector<HTMLElement>('#app')!;
if (localReview) {
  root.innerHTML = `<div class="page-shell">${header('support')}<main id="main" class="support-main og-container" tabindex="-1"><p role="status">Loading resource search…</p></main>${footer()}</div>`;
  try {
    const status = await apiRequest<{ agentAvailable?: boolean; evaluationData?: string }>('eden/status', {
      signal: AbortSignal.timeout(5000), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    evaluationData = status.agentAvailable === true && status.evaluationData === 'fictional_demo';
  } catch { /* Ordinary resource discovery remains available. */ }
}
if(window.location.pathname.replace(/\/+$/,'')==='/support')await mountSupportPage(root, {
  mapKey: import.meta.env.VITE_GEOAPIFY_BROWSER_KEY,
  ...(evaluationData ? { syntheticDemo: true } : {}),
});
