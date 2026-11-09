# Speaking animation: timing correction

Research and implementation reviewed **2026-11-07**. This is a browser-native, amplitude-driven approximation, not phoneme-accurate lip synchronization. No provider, audio service, model, billing, or production setting was changed for this work.

## Observed defect and code evidence

The owner confirmed that the mouth was visible but moved too quickly and unnaturally. The existing chain was genuine PCM playback → post-gain time-domain RMS → controller → visible SVG. The problem was the animation interpretation:

- `LivePcmOutput` measures 512 time-domain samples per animation frame. At an actual 48 kHz context this window spans about 10.7 ms, so individual measurements change quickly. The existing output multiplier is four; this is an activity measure, not calibrated loudness or a phoneme estimate.
- The square-root mapping traversed `closed → slight → medium → wide → rounded → smile`. That sequence is not monotonic: a louder value could abruptly halve mouth width, reduce its opening, change tooth visibility, then return to a smile.
- The renderer used a fast spring and immediately replaced the moving mouth with the original open smile whenever a sample fell below .008. Low-level fluctuations could therefore flash the original smile between speaking shapes.
- A separate fixed 3.1 Hz sinusoid added audio-scaled head and earring motion. It did not derive its rhythm from the spoken syllables.

These are source-level findings. Naturalness still requires the owner's audiovisual review; test success alone cannot establish it.

## Primary-source findings

| Source, retrieved 2026-11-07 | Evidence and implication |
| --- | --- |
| [W3C Web Audio API, AnalyserNode](https://www.w3.org/TR/webaudio/#AnalyserNode) and [setTargetAtTime](https://www.w3.org/TR/webaudio/#dom-audioparam-settargetattime) | The analyser's built-in smoothing applies to frequency data. Reading time-domain samples and calculating RMS does not acquire that smoothing. A separate causal envelope is needed here. The specification describes exponential approach using elapsed time and a time constant; this provides a frame-rate-independent filter form. The current 1.1 publication is a Working Draft, not a claim about a newly finalized standard. |
| Edwards et al., SIGGRAPH 2016, [JALI: An Animator-Centric Viseme Model for Expressive Lip Synchronization](https://dgp.toronto.edu/~elf/JALISIG16.pdf) | Jaw and lip articulation are separate controls. JALI uses phonetic alignment and several acoustic features rather than treating one amplitude value as a complete viseme classification. Its analysis also avoids reacting indiscriminately to every sound fluctuation. For Eden, amplitude can support opening strength; it does not justify cycling through rounding and smiling categories. |
| Microsoft, [Get facial position with viseme](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme) | Visemes correspond to phonetic groups and can be supplied with audio timestamps. The documentation distinguishes these timed articulations from a general speech activity signal. This is explanatory research only: no Azure integration or provider substitution was added. |
| NVIDIA, [Audio2Face configuration guide: face region control](https://github.com/NVIDIA/Audio2Face-3D-Training-Framework/blob/main/docs/config_details.md#face-region-control) | A production facial animation system exposes separate temporal smoothing and strength controls for the lower and upper face. That supports tuning motion independently, but its model-specific numbers are not copied into Eden's 2D renderer. No NVIDIA component or service was installed. |
| Zhou et al., SIGGRAPH 2018, [VisemeNet](https://arxiv.org/abs/1805.09488) | The authors use phonetic groups, temporal neural processing, and animator motion curves for audio-driven visemes. This demonstrates why raw RMS alone should not be described as a phoneme solution. Adding such a model would be a different integration and is outside this correction. |
| Schwartz and Savariaux, 2014, [Audiovisual speech timing](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1003743) | The authors reject a universal fixed visual lead: the relationship depends on speech material and how events are measured. Eden therefore adds no arbitrary playback delay or claimed universal lip-sync offset. This paper does not prescribe the envelope values below. |

## Implemented correction

The six source-derived poses remain available as a reference catalog. Live RMS now drives only a continuous, monotonic interpolation through the compatible closed, slight, medium, and wide contours. Lip rounding and smile categories are not inferred from volume. The original source palette, mask, approved PNG, brow layers, and editable Rive reference are preserved.

The renderer uses an explicit elapsed-time envelope, logarithmic level compression, a small target deadband, and bounded opening/closing speed. It does not change the audio signal or buffering. The fixed audio-scaled head/hoop oscillator was removed; existing unhurried idle motion and small, smoothed amplitude responses remain.

The final portrait asset cache contains **15 fixed PNG layers**, shared across portrait instances; decoding and disposal remain independent per instance.

These parameters are **engineering and animation tuning choices**, not measurements established by the cited papers:

| Control | Value | Purpose |
| --- | --- | --- |
| Envelope attack / release time constant | 45 / 110 ms | Respond to onset while softening short fluctuations and closure. |
| Positive-level onset | 20 ms above .020 | Avoid activating on one small noise spike. |
| Hysteresis exit | .009 | Avoid repeatedly crossing one activation threshold. |
| Minimum positive activity / low-level hush | 140 / 110 ms | Keep short nonzero fluctuations from switching the original smile on and off. Mouth openness still moves continuously during this interval. |
| Openness target deadband | .035 | Ignore tiny target changes. |
| Openness limit | .86 of the monotonic range | Keep normal conversation restrained while remaining clearly visible. |
| Maximum opening / closing rate | 4 / 2.6 normalized units per second | Bound frame-to-frame changes without inventing a phoneme clock. |

**Safety and accessibility override the smoothing:** an actual zero level, mute/Stop, state interruption, pause, or reduced motion restores the exact approved resting image immediately. Holds never keep the mouth moving after playback stops. Nonzero near-silence is treated differently from explicit zero so ordinary small RMS dips do not repeatedly flash the full smile.

## Verification and limits

Focused tests cover monotonic geometry, reference-catalog preservation, envelope behavior at 30/60/120 Hz, chatter reduction, movement bounds, threshold hysteresis, minimum dwell, and immediate zero-level restoration. Existing source-pixel reconstruction and lifecycle tests remain required.

### Actual Aoede review and owner acceptance

The corrected **EDEN-05 Call 2**, reviewed on **2026-11-07**, supplied **18.46 seconds and 145 DOM samples** during genuine Aoede playback. The capture observed all four amplitude-driven mouth poses, return to the exact approved resting artwork, and independent blinking and eyebrow movement. The owner reviewed the revised motion and accepted it: **“Yes, this looks natural enough.”** This acceptance comes from the real audiovisual review, not from the unit tests or the earlier static pose sheet.

| Actual-playback frame | Evidence |
| --- | --- |
| [Closed](verification/eden-05/corrected-closed.png) | Clearly closed speaking moment. |
| [Slight](verification/eden-05/corrected-slight.png) | Small opening. |
| [Medium](verification/eden-05/corrected-medium.png) | Intermediate opening. |
| [Wide](verification/eden-05/corrected-wide.png) | Larger opening within the restrained range. |
| [Rest](verification/eden-05/corrected-rest.png) | Approved resting artwork restored after speaking activity. Source-pixel neutrality is independently covered by reconstruction tests. |

This evidence verifies the revised visual pacing and pose variation. Mute/Stop, reduced motion, lifecycle cleanup, page actions, and broader release readiness retain their separate verification requirements.

The accepted result remains **amplitude-driven speaking animation, not phoneme-accurate lip sync**. The renderer cannot produce reliable /oo/, /ee/, /f/, /p/ or other timed phonetic articulation from RMS. It also cannot anticipate speech without a new timing source; no raw recordings, transcript alignment service, or new provider was added.
