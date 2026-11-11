# Demonstrate the 19+ age acknowledgment

Use Node 24.x and Google Chrome. From an interactive terminal in the repository, run:

```sh
nvm use
npm ci
npm run demo:age-gate
```

If the command reports an unsupported Node version, run `nvm use` again in the repository and check that `node --version` starts with `v24.`.

The command builds a temporary copy of the existing app, starts a server on a free loopback port and opens visible Chrome. Use Tab and Enter to operate the site, and Enter in the terminal to advance.

1. **First visit.** Show the approved confirmation screen and tab through both age choices, Terms and Privacy. The blurred preview is decorative.
2. **Session A.** Choose **I’m under 19**. Refresh to show the denial persists. To show direct navigation, add `/support` to the loopback URL printed in the terminal. Open Terms or Privacy and return to Our Ground, or use browser Back. Session A remains denied. Press Enter in the terminal to open Session B.
3. **Session B.** Show the confirmation again, choose **I’m 19 or older**, then refresh the real homepage. Press Enter in the terminal to show a fictional Harrisburg pantry in the existing Find Support directory. Press Enter again to finish.

To show one scenario, run `npm run demo:age-gate -- --scenario=first-visit`, `--scenario=denied`, or `--scenario=adult`. Use Ctrl+C to stop and rerun the command for a fresh presentation.

## What the demo exercises

The production gate handles both native forms and signs the decisions with a fresh local key. The server binds each decision to its origin, enforces denial across reloads and navigation, and rejects forged, expired and cross-origin acknowledgments. The browser cookie lasts for the session and its signature expires after at most eight hours. Terms and Privacy are accessible before entry.

Each scenario gets a disposable Chrome context with its own cookies and storage. The eligible session is independent of the denied session. Closing the presenter disposes of both contexts, the server and the temporary build. This is a self-declared age threshold. It establishes neither someone’s age or identity independently nor a shared-device handoff.

The homepage and directory are the existing app. The only directory data comes from the repository’s fictional fixtures. The runner skips environment files, has no live map, account or AI providers, and blocks requests outside its loopback origin. It lives outside the application build and is excluded from Vercel uploads.

## Browser evidence

[Desktop confirmation](first-visit.jpg) · [Desktop denial](under-19.jpg) · [Independent adult session](independent-adult.jpg) · [Mobile confirmation](mobile-first-visit.jpg) · [Mobile denial](mobile-under-19.jpg)

To repeat the checks and capture screenshots:

```sh
npm run demo:age-gate -- --verify --screenshots=tmp/age-gate
node tests/production-age-browser.mjs
```

Add `--headed` to the verification command to watch Chrome. The existing browser test exercises the four entrance states, policies, native form navigation, keyboard focus, seven viewport sizes, reduced motion and forced colors. Set `AGE_AXE` to a local copy of axe-core’s `axe.min.js` to include its accessibility checks. The existing `tests/adult-access.test.mjs` covers signatures, origin binding, expiration, persistent denial and protected APIs.
