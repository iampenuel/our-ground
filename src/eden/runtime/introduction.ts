// v1 included automatic hiding and v2 included opening chat. Neither proves
// that the visitor pressed X, so those ambiguous flags are intentionally ignored.
export const EDEN_INTRO_VISIT_KEY = 'our-ground-eden-introduction-v3';
const EXPLICIT_DISMISSAL = 'dismissed-by-x';
type IntroductionStorage = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

/** A single presentation preference, never a draft, transcript or credential.
 * Storage failures and unknown flags must not suppress the welcome. Showing it
 * does not write a flag, probe storage, or infer an explicit dismissal.
 */
export function claimEdenIntroduction(storage: IntroductionStorage): boolean {
  try {
    return storage.getItem(EDEN_INTRO_VISIT_KEY) !== EXPLICIT_DISMISSAL;
  } catch { return true; }
}

/** Opening chat hides the welcome only for this page interaction. Only the
 * actual X listener records session dismissal. A fresh mount after a refresh
 * welcomes again unless X was recorded. There are no timers or focus changes.
 */
export function mountEdenIntroduction(card: HTMLElement, dismissButton: HTMLButtonElement, storage: IntroductionStorage) {
  let state: 'visible' | 'hidden-for-page' | 'dismissed-by-x' | 'disposed' = claimEdenIntroduction(storage) ? 'visible' : 'dismissed-by-x';
  const render = () => { card.hidden = state !== 'visible'; };
  const temporarilyHide = () => {
    if (state === 'visible') state = 'hidden-for-page';
    render();
  };
  const onDismiss = (event: Event) => {
    event.stopPropagation();
    if (state === 'disposed' || state === 'dismissed-by-x') return;
    state = 'dismissed-by-x'; render();
    try { storage.setItem(EDEN_INTRO_VISIT_KEY, EXPLICIT_DISMISSAL); } catch { /* X still hides this page's welcome in memory. */ }
  };
  dismissButton.addEventListener('click', onDismiss);
  render();
  return {
    temporarilyHide, hide: temporarilyHide,
    // Legacy callers that opened chat through these names must not record X.
    dismiss: temporarilyHide, collapse: temporarilyHide,
    dispose() { state = 'disposed'; render(); dismissButton.removeEventListener('click', onDismiss); },
  };
}
