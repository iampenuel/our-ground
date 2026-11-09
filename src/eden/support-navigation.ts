import { edenCityQuery, validateEdenAction } from '../../shared/eden-assistant.ts';
import type { EdenAction } from '../../shared/eden-assistant.ts';
import type { SupportPageOptions } from '../support-page.ts';
import { edenPublicPagePolicy } from './public-page-policy.ts';
import {trackPublicPageNavigation} from '../public-page-lifecycle.ts';

type MountSupportPage = (root: HTMLElement, options?: SupportPageOptions) => Promise<void>;
export type EdenSupportNavigationResult = { mounted: boolean; initialSearch: boolean };
export type EdenSupportNavigationOptions = {
  signal: AbortSignal;
  hasSupportPage: () => boolean;
  /** Trusted caller only: true after the server reports agentAvailable and
   * evaluationData === 'fictional_demo'. It is never taken from a model tool. */
  evaluationData?: boolean;
  publicDirectory?: boolean;
  resumedKeyword?: string;
};
const reused: EdenSupportNavigationResult = { mounted: false, initialSearch: false };
const loopback = (hostname: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);

/** Only validated coarse locality and finite radius/category values enter this URL. */
export function edenSupportNavigationUrl(value: unknown, evaluationData = false): string {
  const action = validateEdenAction(value), query = new URLSearchParams();
  if (!action || !['search', 'navigate-support'].includes(action.type)) throw new Error('Choose a supported search before opening Find Support.');
  if (action.type === 'search') {
    if (!action.city) throw new Error('Choose a location before opening Find Support.');
    query.set('location', edenCityQuery(action.city)); query.set('category', action.category); query.set('radius_miles', String(action.radius ?? 10));
  }
  if (evaluationData) query.set('mode', 'demo');
  return '/support' + (query.size ? '?' + query : '');
}
async function loadExistingSupportPage(): Promise<MountSupportPage> {
  const [{ mountSupportPage }] = await Promise.all([
    import('../support-page.ts'), import('../styles.css'), import('../support.css'),
    import('../discovery.css'), import('../unified-support.css'), import('../support-resource-context.css'),
  ]);
  return (root, options) => mountSupportPage(root, { mapKey: import.meta.env.VITE_GEOAPIFY_BROWSER_KEY, ...options });
}

/** A single home-to-support transition, not a general SPA router. The factory's
 * mount port permits isolated tests without replacing the site's resource API.
 */
export function createEdenSupportNavigator(loadPage: () => Promise<MountSupportPage> = loadExistingSupportPage) {
  let pending: Promise<EdenSupportNavigationResult> | undefined;
  return async function ensure(value: EdenAction, options: EdenSupportNavigationOptions): Promise<EdenSupportNavigationResult> {
    options.signal.throwIfAborted();
    const action = validateEdenAction(value);
    if (!action) throw new Error('This navigation action is unavailable.');
    if (pending) {
      // The waiting action did not own the first search; its caller must execute
      // its own action normally after the page finishes mounting.
      try { await pending; } catch { /* Re-check actual mounted state below. */ }
      options.signal.throwIfAborted();
      if (options.hasSupportPage() || window.location.pathname.replace(/\/+$/, '') === '/support') return { ...reused };
      throw new Error('Find Support could not be opened.');
    }
    if (options.hasSupportPage() || window.location.pathname.replace(/\/+$/, '') === '/support') return { ...reused };
    if (!edenPublicPagePolicy(window.location.pathname).assistant) throw new Error('Open Find Support from a public page.');
    if (options.evaluationData && !loopback(window.location.hostname)) throw new Error('This evaluation is unavailable here.');
    const url = edenSupportNavigationUrl(action, options.evaluationData === true);
    const startingPath = window.location.pathname;
    const work = async (): Promise<EdenSupportNavigationResult> => {
      const mountPage = await loadPage();
      options.signal.throwIfAborted();
      if (options.hasSupportPage()) return { ...reused };
      if (window.location.pathname !== startingPath) throw new Error('The page changed. Try the action again.');
      const root = document.getElementById('app');
      const assistant = document.getElementById('eden-assistant');
      if (!root || (assistant && root.contains(assistant))) throw new Error('Find Support could not be opened.');
      // Manual Back/Forward outside this narrow route returns to the ordinary
      // document router. No second page mount or duplicate search listeners.
      trackPublicPageNavigation('/support');
      window.history.pushState(null, '', url);
      // The existing page owns HTTP resource/location requests, validation,
      // attribution, map handling and cleanup. No alternate fixture transport.
      await mountPage(root, {...(options.evaluationData === true ? { syntheticDemo: true } : options.publicDirectory && action.type==='search' ? {initialDirectoryCity:action.city} : {}),...(action.type==='search'&&options.resumedKeyword?{resumedKeyword:options.resumedKeyword}:{})});
      options.signal.throwIfAborted();
      if (!options.hasSupportPage()) throw new Error('Find Support is not ready.');
      // Canonical URL hydration performs the first search. The caller confirms
      // adapter metadata/results, rather than issuing that search a second time.
      return { mounted: true, initialSearch: action.type === 'search' };
    };
    pending = work();
    try { return await pending; } finally { pending = undefined; }
  };
}
export const ensureEdenSupportPage = createEdenSupportNavigator();
