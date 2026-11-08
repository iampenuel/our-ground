const publicPages = new Set(['/', '/support', '/discover', '/give', '/organizations', '/about', '/privacy']);
/** Presentation routing only. Account authorization and provider eligibility stay
 * at their existing server boundaries; this policy never opens either boundary.
 */
export function edenPublicPagePolicy(pathname: string): { path: string; assistant: boolean; redirect: '/support' | null } {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/eden') return { path, assistant: false, redirect: '/support' };
  const publicResource = /^\/resources\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(path);
  return { path, assistant: publicPages.has(path) || publicResource, redirect: null };
}
