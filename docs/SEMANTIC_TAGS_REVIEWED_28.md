# Twenty-eight sourced Gameplay Facts profiles — 7 November 2026

**Positive selected facts; no recommender v2 activation.** Six more catalog games have 24 independently authored, source-backed observations. The immutable 30-game catalog now contains **28 partial, 2 unknown profiles; 114 positive observations; 76 taxonomy IDs; zero complete whole-game vectors**.

| Game | Selected positive facts | First-party/publisher source |
| --- | --- | --- |
| Mortal Shell (`wikidata:q96991833`) | `activity:exploration`, `mechanic:action-combat`, `mechanic:deliberate-combat`, `mechanic:shell-possession` | [Publisher/developer/owner page](https://news.xbox.com/en-us/2020/08/18/mortal-shell-is-now-available-for-xbox-one/) |
| Infamous 2 (`wikidata:q24300`) | `activity:exploration`, `mechanic:action-combat`, `mechanic:elemental-powers`, `mechanic:karma-choices` | [Publisher/developer/owner page](https://sony.mediaroom.com/2011-06-07-PlayStation-3-Exclusive-inFAMOUS-2-Powers-Up-North-America-With-Breathtaking-Cinematics-and-Epic-Open-World-Superhero-Adventure) |
| Tell Me Why (`wikidata:q75493248`) | `activity:character-stories`, `activity:memory-exploration`, `mechanic:branching-choices`, `structure:story-driven` | [Publisher/developer/owner page](https://www.tellmewhygame.com/about/) |
| Minecraft Legends (`wikidata:q112430705`) | `activity:strategic-battles`, `activity:village-defense`, `mechanic:army-command`, `mechanic:building` | [Publisher/developer/owner page](https://www.minecraft.net/en-us/about-legends) |
| Shadow Runner (`dreven:shadow-runner`) | `mechanic:light-magic`, `mechanic:platforming`, `mechanic:ranged-attacks`, `structure:procedural-levels` | [Publisher/developer/owner page](https://drevengames.itch.io/shadow-runner) |
| Hunter Adventure (`dreven:hunter-adventure`) | `activity:exploration`, `activity:hunting`, `mechanic:choice-events`, `mechanic:survival-management` | [Publisher/developer/owner page](https://drevengames.itch.io/hunter-adventure) |

Sources reviewed on **2026-11-07**. Original short classifications and URLs only; no copyrighted descriptions, artwork, ratings or community tags imported. Each four-fact profile's four 0.25 weights are **editorial normalization of selected facts**, not source-derived whole-game importance, measured affinity, confidence or verified absence of other mechanics.

Observed shared facts include Mortal Shell ↔ Sekiro (action combat), Infamous 2 ↔ Mortal Shell (action combat/exploration), Tell Me Why ↔ To the Moon (stories/plot progression), Minecraft Legends ↔ Dwarf Fortress (construction), Shadow Runner ↔ Celeste (platforming). These are narrow factual overlaps, not claims of complete gameplay similarity.

The new source is `examples/semantic-tags-reviewed-28.v1.json` (revision Git blob bound in source/preflight). Its unchanged predecessor `semantic-tags-reviewed-22.v1.json` is blob `73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9`; immutable catalog is `0570fd610b14fb336c0de65e6cc3062892abe301`. DevMatch and Circlanoid remain unknown. `#facts=` links reject older source fingerprints. Public ranker `feature-overlap-2`, game IDs, hard constraints, Bridge and basket share versions do not change. The [22-profile frozen study](REVIEWED_TAG_READINESS_22.md) remains the latest comparable v2 readiness gate. This expansion has not passed v2 release acceptance or human preference evaluation.

Acceptance: `node --test test/semantic-tags-reviewed-28.test.js`, `npm test`, `npm run build`, `python3 scripts/release-preflight.py _site`, `python3 scripts/browser-observations-acceptance.py --engine all`. Refs [#76](https://github.com/drevendev/Playmancer/issues/76).
