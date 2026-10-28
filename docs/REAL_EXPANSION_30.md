# Six-game Wikidata CC0 expansion — candidate snapshot 2026-10-28

**Scope and release honesty:** These are item-level source-field receipts for the proposed
30-game snapshot `multi-store-genre-pilot-30-2026-10-28`. A PR, build or green CI does not establish a public Pages
release. The prior 24-game snapshot `multi-store-genre-pilot-2026-10-28`
stays intact, including its share-link identity.

## Source, rights, and item receipts

Wikidata structured statements are [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing);
see its [data-access guidance](https://www.wikidata.org/wiki/Wikidata:Data_access).
All six video-game item pages were reviewed **2026-10-28**.
Only the English identity/label, explicitly stated P136 genres, selected P400
desktop platforms and P1733 Steam IDs are included. These are upstream claims:
a Wikidata Steam ID is **not** independent proof of current store availability.
No other publishers' descriptions, screenshots, artwork or ratings are copied.

| Video game / Wikidata QID | Source P136 genre labels | Selected P400 desktop platforms | P1733 Steam ID |
| --- | --- | --- | --- |
| [Dwarf Fortress](https://www.wikidata.org/wiki/Q248810) · Q248810 | roguelike; construction and management simulation; adventure video game; sandbox game; text-based video game; survival game | windows, linux | [975370](https://store.steampowered.com/app/975370) |
| [FTL: Faster Than Light](https://www.wikidata.org/wiki/Q4308783) · Q4308783 | strategy video game; roguelite; space flight simulation game; science fiction video game; roguelike | windows, mac, linux | [212680](https://store.steampowered.com/app/212680) |
| [Super Meat Boy](https://www.wikidata.org/wiki/Q1784048) · Q1784048 | platform game | windows, mac, linux | [40800](https://store.steampowered.com/app/40800) |
| [Papers, Please](https://www.wikidata.org/wiki/Q14565978) · Q14565978 | adventure video game; simulation video game | windows, mac, linux | [239030](https://store.steampowered.com/app/239030) |
| [Inscryption](https://www.wikidata.org/wiki/Q109051201) · Q109051201 | roguelike deck-building game | windows, mac, linux | [1092790](https://store.steampowered.com/app/1092790) |
| [Sekiro: Shadows Die Twice](https://www.wikidata.org/wiki/Q54906424) · Q54906424 | action-adventure game; soulslike; dark fantasy video game | windows | [814380](https://store.steampowered.com/app/814380) |

## Immutable projection and coverage limitations

- Proposed checked-in JSON: [`examples/catalog.multistore-30.real.json`](../examples/catalog.multistore-30.real.json).
  Exact projection Git **blob SHA-1:** `0570fd610b14fb336c0de65e6cc3062892abe301`.
  This identifies only the versioned JSON file, not a raw source export or independent audit.
- The original 24 records and both sources/rights declarations remain **identical** and in
  original order. The new total is **30 games: 25 Wikidata CC0, five Dreven Games**.
- Known genre fields are **29/30** (previously 23/24); mechanics **0/30**;
  co-op **0/30**; descriptions **0/30**. Each new entry retains
  `mechanics: null`, `coop: null`, `description: null`, no guessed aliases or DLC merges.
- Genre labels are literal. For instance, **"platform game"** does not automatically
  equal **"platformer"** in the current exact-tag matcher. This and sparse tags can
  cause false negatives; don't claim unmeasured recommendation quality.
- P400 platform lists are *selected known evidence*, not an exhaustive proof that
  unlisted platforms are unsupported. Co-op hard constraints abstain when unknown.
- Genre-only matching retains the existing **30% comparable-feature lane**;
  this is evidence coverage, **not** accuracy. No real-user usefulness study.
- No API credentials, runtime calls to Wikidata/Steam, third-party media, tracking,
  hidden owner ranking advantage or newly cleared IP rights beyond documented CC0 claims.

## Verify before accepting or publishing

```sh
node scripts/validate-catalog.mjs examples/catalog.multistore-30.real.json --publishable
npm test
npm run build
python3 scripts/pages-preflight.py _site
python3 scripts/browser-real-catalog-acceptance.py
python3 scripts/browser-http-acceptance.py
```

Require independent exact-head PR review, all applicable checks, merge, verified
`master`, successful Pages publication, public HTTP revision and real desktop/mobile
browser inspection. `PR_OPENED` or `BUILT` is not `LIVE_VERIFIED`.
