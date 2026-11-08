import { discoverCompatibilityUrl } from './support-model';
// Replace this entry so Back does not trap bookmarked discovery links.
window.location.replace(discoverCompatibilityUrl(window.location.search));
