# EDEN character animation

Implemented November 6, 2026, inside the existing Our Ground Vite/TypeScript repository. **Local only; nothing deployed.**

> **Scope update:** This remains the preserved Rive studio/character record. The current launcher and conversation header independently animate the exact approved 282px PNG-derived layers through source-owned SVG; see [current architecture](current-architecture.md). The Rive studio and RML/`.riv` source/reference artifacts remain unchanged, including required free-export branding. Normal EDEN conversations use the approved SVG portrait. No splash is concealed or bypassed.

## Actual result

EDEN now has a real native Rive state machine, a compiled `.riv`, an editable Editor `.rev`, readable RML source, and a responsive browser studio. The browser plays the `.riv` through the official runtime. It can fall back to a separate SVG implementation of the same layered artwork, then the untouched approved PNG if artwork loading fails.

This is a **faithful partial rig**, not a fully reconstructed mesh character. The eyes/pupils, eyelids, eyebrows, mouth, head, front and back hair, earrings, and upper torso are separate movable elements. The neck, cardigan, cream top, shoulders, and necklace remain attached within one torso artwork group. They breathe together. No independent necklace deformation, shoulder articulation, head yaw, or full hidden-body reconstruction is claimed.

The eight operational states are idle, listening, thinking, searching, speaking, success, clarifying, and unable to help. The browser accepts interruptions immediately. Success returns to idle through the application controller after 1.7 seconds; any newer state cancels that return. Searching has **no completion timer**.

## Files

| Artifact | Location |
| --- | --- |
| Approved original, unchanged | `public/assets/eden/approved-original/eden.png` |
| Reconstructed skin underlayer | `public/assets/eden/rig/face-clean-plate.png` |
| Native runtime | `public/assets/eden/rig/eden.riv` |
| Editable Editor handoff | `docs/eden/eden-character.rev` |
| Native RML and project configuration | `src/eden/animation/rive/scene.rml`, `rive.yaml` |
| Rive image assets | `src/eden/animation/rive/assets/` |
| Portable layered SVG | `public/assets/eden/rig/eden-layered.svg` |
| Layer manifest and exact exterior contour | `public/assets/eden/rig/layers.json`, `silhouette.json` |
| Typed state/event API | `src/eden/types/eden.ts`, `src/eden/runtime/controller.ts` |
| Official runtime adapter | `src/eden/runtime/rive-renderer.ts` |
| SVG fallback and motion helpers | `src/eden/runtime/svg-renderer.ts`, `motion.ts` |
| Local studio | `eden-preview.html`, `src/eden/components/` |
| Artwork construction tools | `scripts/eden/` |
| Verification evidence | `docs/eden/verification/` |

The source PNG is 1254 × 1254. Its SHA-256 is `3684dc5bf698214170022b433f440634f2b41c6ec0a6b737ef25448097dbd871`, matching the supplied Downloads file byte for byte. That invariant is tested.

## Artwork assessment and reconstruction

The reference has a broad oval face, a prominent coral nose, solid dark stylized eyes, thick brown brows, six freckles, a tilted open smile, and a shaded neck. Dark brown hair has distinct tied-up tufts, crown mass, two short front locks, and long side sections. The black cardigan overlaps a cream top, with gold hoop earrings and a gold necklace.

The source has no hidden layers, separate irises, white sclera, or complete neck beneath the jaw. Importing it into Rive did not create a rig.

The original texture is retained in contour-clipped raster artwork for the body, long hair, brows, eyes and jewelry. The `face-clean-plate.png` was prepared with imagegen: eyes, brows and mouth were removed while retaining the surrounding design. This underlayer is used behind the extracted facial features. It is a reconstructed image and is not represented as pixel-identical to the original.

The outer silhouette is traced as vector geometry from the original image, using exterior-background flood fill and contour simplification. The raster itself is never modified by the tracing tool. Native clipping removes the cream background around the hair. A hidden dark-hair region and a shaded neck overlap are reconstructed as vector shapes, preventing the original face/jewelry from appearing twice during head movement. Facial cutouts follow feature contours; no rectangular skin patches are used.

The mouth is reconstructed from the approved smile as three vector paths: cavity, teeth and tongue. Six poses share the same topology and blend width, opening and tooth visibility: closed, slightly open, medium, wide, rounded, and smile-compatible. This is a practical amplitude-driven speaking foundation, not anatomical jaw deformation or phoneme-accurate lip-sync.

### Hierarchy

- Back hair, with reconstructed occluded hair fill.
- Torso artwork: shoulders, neck, cardigan, top and necklace; reconstructed neck overlap.
- Left/right long hair.
- Head pivot: small planar tilt around the neck.
  - Clean underlayer, original eyes/pupils and brows, clipped eyelid apertures.
  - Single closed-lid paths; the eye artwork is clipped away rather than squashed.
  - Mouth cavity/teeth/tongue, six compatible poses.
  - Left/right hoops, and front hair locks.

Head tilt is approximately ±1.3 degrees. Breathing scale changes are about 0.25%; secondary motion is similarly restrained. These narrow limits protect the flattened source's proportions and overlaps.

## Rive toolchain

- Official CLI **1.9.1**, installed from the vendor installer with its SHA-256 verification. The task installation is temporary at `/tmp/eden-rive-toolchain/versions/1.9.1/rive`; install normally for durable use.
- Official web runtime **`@rive-app/canvas` 2.49.4**, pinned in the package manifest and lockfile.
- RML syntax, property names, bindings, clipping, blending, transitions, export flags, and verification commands were checked against the CLI's bundled version-matched documentation and `rive schema`.
- RML compiles and renders. `rive inspect` reports no problems.
- `.riv` and `.rev` exports succeeded after browser/device authentication became available. Initial browser attempts showed an invalid/expired device-code error, but the later CLI session authenticated successfully.
- The rig uses native Rive elements and timelines, **no scripts**. The CLI therefore correctly reports that there is nothing to sign and writes an unsigned runtime file. This is not an unsigned-script workaround.

Authoritative references: [CLI](https://rive.app/cli), [agent workflow](https://rive.app/agents), [CLI commands](https://rive.app/docs/cli/reference/commands), [RML](https://rive.app/docs/runtimes/advanced-topic/rml). Prefer the installed CLI's `docs` and `schema` for exact version behavior.

### Licensing and original Editor file

The existing [Rive Editor file](https://editor.rive.app/file/untitled/2710160) was inspected. It contained the approved flattened illustration. **It was not overwritten, updated, or synchronized.** No `rive push` was performed and no paid plan or credit resource was activated. Export reports contain `credits: null`.

The exported file has **Rive's opening splash/watermark**. The CLI reported that local projects without `push.fileId` are watermarked. Do not remove or bypass it. Account/file binding and plan entitlements govern any later watermark-free export; no entitlement is promised here.

## State machine and bindings

Artboard: `Eden`. State machine: `Eden`. View model: `EdenControls`, default instance `Default`.

| Property | Type/range | Purpose |
| --- | --- | --- |
| `state` | number, integer 0–7 | idle, listening, thinking, searching, speaking, success, clarifying, unable |
| `audioLevel` | number 0–1 | speaking mouth blend; meaningful in speaking only |
| `reducedMotion` | boolean | switches the quiet-motion layer to a static pose |
| `mouthOverride` | number −1 or 0–5 | inspection only; −1 releases override |
| `blinkNow` | boolean | inspection/host-scheduled native blink |
| `hostBlinks` | boolean | browser uses irregular blink scheduling; false retains standalone timeline blinks |

The Expression layer owns head and brow poses. The Speech layer uses a native `BlendState1DViewModel` for speaking, and appropriate resting poses for other states. The Quiet motion layer owns breathing, subtle gaze/earring/long-hair movement and the standalone blink sequence. Separate inspection layers temporarily override mouth/blink behavior. These layers deliberately own different properties, except the explicit inspection overrides.

Expression transitions use approximately 320 ms blends with early exit enabled, and mouth transitions use approximately 200 ms. The host smooths audio changes with a critically damped spring before setting the view model value. The number-to-blend mapping converts 0–1 audio activity into Rive's 0–100 blend axis.

Browser blinks are scheduled 2.8–8.6 seconds apart with random variation. Each invokes the actual native blink timeline. Standalone Rive has a 31-second sequence with varied intervals and a double blink. Closing clips away the eye artwork, briefly shows one closed-lid curve, then reopens it. No white eye or separate iris was invented.

Success auto-return belongs to `EdenController`, not to the `.riv` alone. Likewise random browser blink scheduling and audio smoothing are host responsibilities. A raw Editor preview can inspect all poses and the native motion, but does not recreate these host lifecycle policies automatically.

## Local preview

Use the repository's Node **24.x**, then:

```sh
npm install
npm run dev:eden
```

Open [the local studio](http://127.0.0.1:5198/eden-preview.html). The source server must remain running. The task leaves this preview available for review.

The studio provides eight state buttons, a keyboard-operable amplitude slider, silent speech simulation, six pose inspection buttons under the notes disclosure, a blink preview, reset, pause, reduced motion, and comparison with the approved original. It does not use a microphone, synthesize audio, call a search endpoint, or communicate with an AI service.

For an explicit SVG fallback review, use [the fallback studio](http://127.0.0.1:5198/eden-preview.html?renderer=svg).

```sh
npm run build:eden
npm run test:eden
node scripts/eden/verify-evidence.mjs
```

The separate build goes to `dist-eden/`. Normal application routing and `src/main.ts` are untouched.

### Security, accessibility and lifecycle

The Rive WASM is bundled locally; CDN fallbacks are disabled. Only `vite.eden.config.ts` grants `wasm-unsafe-eval` to the exact local `/eden-preview.html` document. Other application routes retain the original CSP, verified via response headers. Production headers, microphone permissions, account/security code and deployment configuration were not changed.

Reduced motion follows the operating-system preference until the user explicitly changes it. Ambient movement and automatic blinks stop; speaking amplitude is suppressed. Native rendering pauses after the chosen expression settles. Text status remains independently available. Buttons/checkboxes are native keyboard controls, state selection uses `aria-pressed`, and the status is announced politely without announcing every audio frame.

Both renderers stop work when hidden/offscreen and support disposal. The Rive canvas caps its drawing pixel ratio at 2. The original PNG is shown during load and after unrecoverable artwork failure; a Rive load failure first attempts SVG fallback. A pause button is provided independently of reduced motion.

## Future application integration

```ts
import { EdenController } from './src/eden/runtime/controller';
import { loadEdenRive } from './src/eden/runtime/rive-renderer';

const eden = new EdenController(await loadEdenRive(canvas));
eden.setEdenState('listening');
eden.dispatch({ type: 'search-started', requestId });
// Call only when the actual operation resolves; stale request IDs are ignored.
eden.dispatch({ type: 'search-completed', requestId });
eden.dispatch({ type: 'playback-started' });
eden.setEdenAudioLevel(0.6);
eden.dispatch({ type: 'playback-interrupted' });
// On unmount:
eden.dispose();
```

The event union also supports microphone activation, listening start/stop, user speech detection, processing, clarification, search failure, and playback completion. `thinking` is a processing status, not a display of private model reasoning.

A future Gemini Aoede pipeline can send playback RMS amplitude normalized to 0–1. Pause, interruption and completion must explicitly reset amplitude/state. Better lip synchronization needs time-aligned phoneme/viseme labels, durations and coarticulation rules, plus authored poses for those visemes. Audio amplitude alone cannot supply them. No Gemini integration, credentials, API credit consumption, conversational model, or autonomous page action was added.

A future page-aware controller should own the request/playback lifecycle and pass events into this animation adapter. Production adoption also needs an explicit CSP/integration review for WASM, since this task intentionally leaves the application's existing policy intact.

Thinking Orbs remain a separate component. They can subscribe to `eden.subscribe(snapshot => ...)` and consume the same state/audio fields without being inside the character hierarchy. No orb or particle system is implemented.

## Editor handoff and regeneration

Import `docs/eden/eden-character.rev` **as a new Editor file**, leaving the original approved workspace file intact. Select artboard/state machine `Eden`, then inspect the `EdenControls` view model and the named layers/timelines. The `.rev` contains embedded image assets and editor-positioned states.

For local CLI work with version 1.9.1:

```sh
rive src/eden/animation/rive --verify --format=json
rive inspect src/eden/animation/rive --json
rive src/eden/animation/rive
# Local runtime export; this is not web deployment:
rive src/eden/animation/rive --publish=local --output-dir=../../../../public/assets/eden/rig
rive src/eden/animation/rive --rev=docs/eden/eden-character.rev
```

Use absolute output paths if launching from another directory. Login is required for exports. Never substitute `--publish=web` for a local export.

The artwork generators are reproducible construction tools:

```sh
node scripts/eden/trace-silhouette.mjs
npm run eden:artwork
```

**Regeneration replaces `scene.rml` and the SVG.** Preserve a copy before regenerating after manual Editor/RML work. CLI-exported IDs are written back to the RML and should be retained for any future round trip. The canonical current source is the exported, formatted `scene.rml`, not an automatically synchronized cloud project.

## Verification and remaining work

- Main `npm run build`: passed, including secret/env checks and frontend/backend type checks. Existing large-chunk warnings remain.
- Full repository `npm test`: **449 passed, 0 failed**. Localhost fixture tests needed execution outside the network-restricted sandbox; the rerun passed.
- EDEN targeted tests: **9 passed**, including all 64 directed state pairs, stale search completions, audio bounds, success cancellation, disposal, blink timing, mouth blending, spring behavior, original hash, and real `.riv` magic bytes.
- Official Rive `--verify`: zero errors/warnings. `inspect`: zero problems.
- Native renders: **14 captures**, including all eight states, speech at multiple inputs, closed/open blink, and two reduced-motion samples three seconds apart. Distinct state/audio image hashes and identical reduced-motion hashes are checked by `verify-evidence.mjs`.
- Browser: native runtime loaded, all eight buttons selected correctly, keyboard End drove the speech slider to 100%, silent simulation changed amplitude, and reduced motion disabled continuous speech/blink controls. All six mouth inspection controls, original comparison, success-to-idle return, and the explicit SVG fallback were also exercised. Desktop 1280 × 960 and mobile 390 × 844 were inspected; mobile content width equals viewport width (390 px), with a 350 px portrait panel.
- Local native benchmark, 600 frames at 1254²: mean advance **0.044 ms**, mean render **1.109 ms**, render p95 **2.627 ms**. No scripted WASM memory growth. This is a Mac/Metal measurement, not a mobile battery or device benchmark.

Visual inspection found and corrected cream edge fragments, duplicated face/jewelry beneath a tilted head, an incomplete eyelid closure, and a narrow mobile panel. The final native captures show the corrected behavior. At high magnification or against dark backgrounds, raster-mask antialiasing and the reconstructed hair/neck texture can still be discerned. The design is intended for the cream studio/Our Ground surface and small motion ranges. It is not claimed to be a perfect all-background production mesh.

Remaining Editor work: individually reconstruct clothing/necklace/shoulders if independent movement is needed; refine hidden hair/neck textures for larger turns; add mesh/bone deformation for yaw; author real phoneme poses for future timed speech; and validate on physical low-end mobile devices. The current state/event architecture is ready for future integration, but voice and page-aware assistant behavior remain unimplemented.

### Completion gates

| Gate | Result |
| --- | --- |
| A — Identity | Faithful reference-based appearance; original preserved. Underlayer and mouth are reconstructed, not pixel-identical. Owner approval of the moving rendition remains a visual review. |
| B — Rig | Genuine layered **partial** rig; combined clothing/necklace/neck explicitly remain. |
| C — Natural animation | Working blinks, breathing, restrained movement and transitions; limited to small planar motion. |
| D — State machine | Native Rive machine and typed application controller operational. |
| E — Speaking | Six native blended mouth poses respond to simulated amplitude; no phoneme claim. |
| F — Preview | Working local native Rive studio with SVG/static fallback paths. |
| G — Rive artifacts | RML, `.riv` and `.rev` produced; runtime has vendor splash/watermark. |
| H — Product preservation | No existing product routes/features/security files edited; full build and test suite pass; no deployment. |
