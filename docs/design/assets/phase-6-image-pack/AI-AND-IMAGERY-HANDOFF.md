# Central AI and imagery transparency — Codex handoff

## Product decision

Keep the approved Documentary Editorial Modernism × Cartographic Utility design.
The user does not want a repetitive large caption on every generic editorial image.
Replace redundant image-by-image synthetic captions **only when** a clear, accessible
central disclosure covers the generic photos without misleading visitors.

## Proposed location

Add a clearly reachable section on `/about` with a stable ID `ai-and-imagery`.
Add a discreet, understandable footer link labeled **"AI & imagery"** to
`/about#ai-and-imagery`. The link must work directly and via keyboard on all routes.
Consider also one short footer disclosure if needed for clarity, but do not turn
images into marketing slogans about AI.

## Suggested truthful page copy

### How we use AI and imagery

Some photographs on Our Ground are AI-generated illustrations used to communicate
our mission. They depict imagined people, settings and community interactions—not
our actual partner organizations, real service locations, or documented events.

Our directory is built around structured resource records and their sources.
AI-assisted resource explanations using Gemini are planned; they are not active
until we explicitly implement and verify them. If enabled later, these tools will
help people understand retrieved resource information, not independently verify
service availability, determine eligibility, diagnose conditions, or make
financial or medical decisions. People should confirm important service details
directly with providers.

## Safety and semantics

- Do not imply current Gemini functionality until it is tested and enabled.
- Preserve provider-specific provenance, fictional-demo labels, directions/contact
  restrictions and data-quality messages. Central imagery disclosure does NOT
  replace resource-specific safety information.
- For genuine named service providers, use only appropriately authorized actual
  photos; do not map these generic synthetic scenes to a real provider ID.
- Keep photographs and their alt behavior accessible. Decorative editorial images
  can use empty alt; informative authentic provider photos require factual alt.
- Never hide the disclosure in a tooltip/modal alone, an unreadable footer, or a
  cookie-style banner. It should be reachable from all public pages.
- If a local layout genuinely risks visitors mistaking the photo for a verified
  actual facility or event, add modest contextual clarification rather than
  forcing a blanket no-caption rule.
- Do not change AI APIs, credentials, data sources, search correctness, auth,
  backend contracts, or deployment config as part of this visual-integration task.
