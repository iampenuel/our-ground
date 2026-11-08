import {legacyResourceSupportUrl} from './support-model';

// Existing public bookmarks open the same published identity in Find Support.
// Replacement avoids adding a redirect hop to Back/Forward history.
window.location.replace(legacyResourceSupportUrl(window.location.pathname,window.location.search));
