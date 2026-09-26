# P06 interaction specification v0

Reviewed: 2026-09-26.

Status: **implementation-ready interaction hypothesis, not user-validated**.

This specification turns issue #1's basket -> local map/list -> explanation -> share
direction into a bounded first-release interaction. It does not claim that the design
has passed usability testing. It deliberately keeps the map optional: every user task
must remain possible through ordinary controls and a readable result list.

## Evidence and upstream decisions

Product and method inputs:

- issue #1: https://github.com/drevendev/Playmancer/issues/1
- P02 identity receipt: https://github.com/drevendev/Playmancer/issues/1#issuecomment-5815966373
- P03 ranking receipt: https://github.com/drevendev/Playmancer/issues/1#issuecomment-5816985218

Accessibility references reviewed 2026-09-26:

- W3C WAI-ARIA APG combobox pattern:
  https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- W3C WAI-ARIA APG slider pattern:
  https://www.w3.org/WAI/ARIA/apg/patterns/slider/
- WCAG 2.2 Understanding 2.5.8 Target Size (Minimum):
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- WCAG 2.2 Understanding 2.4.11 Focus Not Obscured (Minimum):
  https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum

The APG is implementation guidance, not a substitute for testing with browsers and
assistive technology. WCAG conformance is not claimed by this research document.

## Decision: one progressive task, five stages

The first useful interface is a single-page flow with five visible stages:

1. **Build basket** — search and add 2–5 canonical games.
2. **Tune intent** — choose mode, seed weights and supported hard constraints.
3. **Inspect results** — ranked list is primary; local map is a synchronized secondary
   view.
4. **Understand a result** — supporting evidence, mismatches, uncertainty and applied
   constraints are readable without opening the map.
5. **Share/recover state** — copy a stable URL that reconstructs the basket controls.

Do not require an account, onboarding wizard, saved profile, global map, or modal
tutorial before a visitor can complete this task.

## 1. Build basket

### Search control

Use an editable combobox backed by canonical-title search results.

Required behavior:

- the text field remains an ordinary editable input;
- Down Arrow enters suggestions when available;
- Up/Down move through suggestions;
- Enter accepts the focused suggestion;
- Escape closes suggestions without destroying the current basket;
- browser text-editing keys continue to work;
- a selected game is added to the basket and the search field is cleared for the next
  seed;
- no title is inferred from free text: the user must select a canonical result.

Each suggestion exposes enough disambiguation to avoid name-only identity mistakes:
canonical name, release year when known, major platform summary when known, and a small
relation/type label when relevant (for example “remaster”). Missing metadata is shown as
unknown rather than fabricated.

### Basket representation

Each seed is a normal focusable basket row/card, not a draggable-only chip.

Each row includes:

- canonical game name;
- remove button;
- explicit numeric weight value;
- weight decrement/increment buttons;
- optional native range input using the same underlying value;
- relation/type warning when the selected entity is not a normal main-game title.

The product may later support drag-to-reorder, but ordering has **no ranking semantics in
v0** and drag is never required to edit or remove a seed.

Basket constraints:

- 0 seeds: show the empty-start prompt;
- 1 seed: allow previewing single-seed behavior but explain that multi-seed discovery
  begins at 2;
- 2–5 seeds: normal Playmancer basket;
- adding a duplicate canonical ID does not create a second row; it focuses the existing
  row and offers to increase its weight;
- a sixth seed is rejected with a clear limit explanation, not silently dropped.

## 2. Tune intent

### Mode control

Expose **Intersection**, **Blend**, and **Bridge** as separate labelled controls with a
one-sentence description beside or below the active mode.

Never auto-switch modes because results are sparse.

- **Intersection:** “strong across the basket.”
- **Blend:** “keep several parts of your taste represented.”
- **Bridge:** “show an understandable route from one focal game toward another.”

Bridge v0 requires two explicit endpoints. With a 2-game basket, both are endpoints.
With 3–5 seeds, the user chooses two endpoint seeds from the basket. Until endpoints are
chosen, Bridge shows an incomplete-state prompt; it must not invent a multi-terminal
route.

### Weights

Use a small bounded discrete scale so the meaning is visible and shareable. Proposed v0
input scale:

`0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x`

Default every newly added seed to `1x`.

The recommender may normalize these values internally, but the UI always shows the
user-entered relative weights. A slider, if present, has keyboard operation and a
human-readable value; adjacent decrement/increment controls provide a simple non-drag
alternative.

### Hard constraints

Hard constraints live in a clearly named “Filters” region and are applied before fit
scoring. Only constraints supported by current data may appear.

For each active hard constraint, the UI distinguishes:

- **known match**;
- **known violation**;
- **unknown / missing required data**.

Unknown never counts as a pass. If unknown data prevents a candidate from satisfying a
required filter, that candidate is excluded from the main matched list and the empty or
uncertain state explains why. Do not silently relax a filter to fill the screen.

## 3. Inspect results

### List is primary

The ranked result list is the authoritative interactive representation. Every result
card includes:

- title and identity-disambiguating metadata;
- mode-specific fit summary;
- evidence coverage;
- at least one supporting signal;
- at least one meaningful mismatch when present;
- a visible “Why?” action;
- missing-data state when material;
- no popularity/rating value presented as if it were basket fit.

Deterministic ranking/tie behavior follows the P03 receipt.

### Local map is secondary

The local map visualizes the current seeds and a bounded neighborhood of results. It is
not required for task completion and never determines similarity from screen distance.

Selecting a result in either representation synchronizes the other representation when
the map is present. The list remains usable when:

- JavaScript visualization fails;
- coordinates are missing;
- the viewport is narrow;
- reduced motion is requested;
- a keyboard-only user never enters the map.

Do not use color alone to distinguish seed/result/mismatch states. The map must have a
legend plus text labels or another non-color cue.

### Mobile layout

On narrow viewports use this order:

1. basket;
2. mode/filters;
3. result list;
4. collapsible local map;
5. result explanation.

Avoid a permanently pinned map that pushes the ranked list below the fold. Sticky
headers/footers must not obscure focused controls.

## 4. Understand a result

The “Why?” disclosure/panel exposes the explanation contract from P03 without turning it
into an opaque prose story.

Required fields:

- active mode;
- user-visible seed weights;
- per-seed affinity values;
- strongest supporting feature groups;
- meaningful mismatches;
- evidence coverage;
- hard constraints applied;
- method version;
- catalog snapshot identifier.

For Intersection, explicitly show which seed is the weakest match when useful.
For Blend, explain which basket strand this item adds or strengthens.
For Bridge, explain the feature changes for the current route hop.

Missing evidence is labelled “unknown/not available”, not converted into a negative
preference.

Opening and closing an explanation must preserve the user's result-list position and
return keyboard focus to a predictable control.

## 5. Share and recover state

A share URL encodes the **intent**, not transient presentation details.

Required URL state:

- schema/version identifier;
- canonical seed IDs;
- user-entered seed weights;
- active mode;
- Bridge endpoints when applicable;
- supported hard constraints;
- method version when needed to interpret semantics.

Do not encode:

- hover/focus state;
- map zoom/pan;
- temporary sort animations;
- private credentials or unpublished source payloads.

On load, resolve canonical IDs against the current static catalog. If an ID is no longer
available, preserve the rest of the basket and show the unresolved seed explicitly.
Never substitute a same-name title automatically.

The URL must be order-canonicalized so semantically identical baskets produce a stable
share form. Basket display order may remain user-friendly, but canonicalization must not
change seed weights or Bridge endpoint identity.

## Keyboard and pointer acceptance

Before the interaction is considered release-ready:

- all basket construction and editing works without pointer input;
- combobox keyboard behavior follows the APG pattern closely enough to preserve native
  text editing and predictable suggestion navigation;
- every weight can be changed with ordinary buttons/keys; dragging is optional;
- focus remains visible and is not hidden by sticky UI;
- pointer targets meet WCAG 2.2's 24x24 CSS-pixel minimum or its documented spacing /
  equivalent-control exceptions;
- opening/closing filters, explanations and map details leaves focus in a predictable
  place;
- no keyboard trap exists in the map or suggestion popup;
- a user can reach every recommendation and explanation while completely ignoring the
  map.

## Reduced-motion acceptance

Animations are decorative, never required to understand ranking or navigation.

When the user requests reduced motion:

- map camera transitions become instant or near-instant;
- result resort/reflow avoids large animated travel;
- highlight/pulse effects become static state changes;
- explanation panels may appear without sliding motion;
- no information is conveyed only by motion.

A no-map/list-only experience remains a valid first-class path.

## Empty, sparse and failure states

### No hard-constraint matches

Show:

- that no candidate satisfied the current hard constraints;
- which constraints were applied;
- whether unknown metadata contributed to the empty set;
- controls for the user to deliberately change a constraint.

Do not loosen constraints automatically.

### Sparse evidence

A candidate below the configured evidence threshold does not masquerade as a confident
high-fit result. Keep low-coverage candidates in a clearly separated uncertain state or
abstain until the benchmark chooses a threshold.

### Missing image

Render a stable text-first placeholder; layout and result selection must not depend on
artwork.

### Visualization failure

Keep the ranked list and explanations fully functional and display a small non-blocking
map-unavailable message.

### Stale share link

Preserve all resolvable seeds and controls. Mark unresolved canonical IDs individually.
Do not silently replace or delete them.

## Minimum implementation slice

The first implementation PR for this interaction should contain only:

1. static synthetic/independently licensed fixture data;
2. canonical-ID search combobox;
3. 2–5 seed basket with discrete weights;
4. Intersection and Blend controls wired to deterministic fixture ranking;
5. Bridge control with endpoint-selection state, even if route computation lands in a
   later PR;
6. hard-filter state plumbing with explicit unknown handling;
7. result list and explanation disclosure;
8. share-link encode/decode;
9. keyboard/mobile/reduced-motion acceptance tests for the implemented controls.

A visual map may be deferred one PR if the list/explanation/share loop is already usable.
This is preferable to shipping an impressive map before the core recommendation task is
accessible.

## Validation plan

This specification becomes a product decision only after implementation and evidence.

Prototype validation should include at least:

- keyboard-only basket creation, weighting, mode switching, filtering, result inspection
  and sharing;
- mobile-width walkthroughs;
- reduced-motion walkthrough;
- stale/missing canonical ID recovery;
- empty hard-filter result;
- sparse candidate evidence;
- duplicate seed attempt;
- one-seed basket;
- conflicting-seed basket;
- Bridge with 2 seeds and Bridge endpoint selection with 3–5 seeds.

Later user testing should evaluate whether players can answer three questions without
help:

1. “Why is this game here?”
2. “What part of my basket does it fit or miss?”
3. “What will change if I adjust a seed weight or hard constraint?”

Failure to answer those questions should revise the interaction, not be papered over by
longer generated explanations.

## Decision summary

Adopt a **list-first, map-supported** interaction for the first release. Search and basket
editing use ordinary accessible controls; weights are explicit; modes remain separate;
hard constraints never relax silently; explanations expose evidence and mismatch; share
links preserve canonical intent; and every core task works on mobile and keyboard with
reduced motion.

This is sufficient to begin a bounded UI implementation against synthetic fixtures once
the repository bootstrap/merge gate permits ordinary implementation work.
