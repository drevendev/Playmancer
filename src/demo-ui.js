import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, DEMO_SNAPSHOT, PLATFORMS, decodeState, encodeState, initialState, observedGenreMass, recommend, validateState, matchesRecordedStorefrontUrl } from "./demo.js";
import { bindBridgeControls, renderBridge } from "./bridge-ui.js";
const $ = (id) => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const notes = {
  intersection: "A conservative weighted harmonic mean: one weak match lowers the whole-basket fit.",
  blend: "A list-level objective: average fit plus additional coverage of currently underrepresented strands.",
  arithmetic: "The weighted arithmetic baseline. A strong match can compensate for a weak one.",
};
const reasons = { seed: "already in your basket", "hard-constraint-fail": "fails a required filter",
  "hard-constraint-unknown": "required filter evidence is unknown", "missing-seed-affinity": "insufficient comparable feature evidence" };
const syntheticCatalog = DEMO_SNAPSHOT.kind === "synthetic";
const hasDreven = DEMO_SNAPSHOT.sources.some(source => source.id === "dreven-owned");
const storeNames = { steam: "Steam", itch: "itch.io", googleplay: "Google Play" };
// The checked-in observation inventory is an independent, partial source.
// Never feed this positive-only information into scores, hard filters or shares.
const inlineGameplayFacts = (() => {
  const entry = $("observation-explorer-entry");
  const payload = $("inline-gameplay-facts");
  if (!entry || !payload || syntheticCatalog) return null;
  const data = JSON.parse(payload.textContent);
  if (data.catalog !== CATALOG_VERSION ||
      data.version !== entry.dataset.observationVersion ||
      data.evidence !== entry.dataset.observationEvidence) {
    throw new Error("Inline Gameplay Facts revision does not match the player");
  }
  return new Map(data.games.map(game => [game.id,
    new Map(game.facts.map(fact => [fact.id, fact.label]))]));
})();
function renderObservedOverlap(game) {
  const candidate = inlineGameplayFacts?.get(game.id);
  if (!candidate) return null;
  const matches = state.seeds.flatMap(seed => {
    const favorite = inlineGameplayFacts.get(seed.id);
    if (!favorite || seed.id === game.id) return [];
    const labels = [...candidate].filter(([tag]) => favorite.has(tag))
      .map(([, label]) => label);
    return labels.length ? [{ id: seed.id, name: BY_ID.get(seed.id).name, labels }] : [];
  });
  if (!matches.length) return null;
  const count = matches.reduce((sum, match) => sum + match.labels.length, 0);
  const details = element("details", undefined, "observed-overlap");
  details.append(element("summary", `Extra recorded gameplay overlap (${count} positive observations)`));
  details.append(element("p",
    "Independently recorded selected facts, not a full feature comparison. Missing or unrecorded facts are unknown, not mismatches. These facts do not change ranking.", "hint"));
  for (const match of matches) {
    details.append(element("p", `With ${match.name}: ${match.labels.join(", ")}.`));
    // The compact positive summary is not the evidence receipt: open the
    // separately version-pinned two-game view for inspectable source links.
    const receipt = element("a", `Inspect sources with ${match.name} (new tab)`, "fact-compare-link");
    receipt.href = pinnedFactsLink(match.id, game.id, $("observation-explorer-entry"));
    receipt.target = "_blank";
    receipt.rel = "noopener noreferrer";
    details.append(receipt);
  }
  return details;
}

// A positive platform observation is not an exhaustive compatibility list.
// Keep strict filtering, but do not tell players that an unlisted platform is
// known to be unsupported. Explicitly observed non-co-op is different.
function hardFilterExplanation(game) {
  // A sourced negative co-op observation is an actual failure. An unlisted
  // platform in the real catalog is instead a positive-receipt gap (unknown).
  if (state.coopOnly && game.coop === false) return "co-op explicitly recorded as unavailable";
  if (syntheticCatalog && state.platform !== "any" && game.platforms !== null &&
      !game.platforms.includes(state.platform))
    return `no recorded ${state.platform} support in this fictional profile`;
  return reasons["hard-constraint-fail"];
}
// A hard-filter unknown is not the same as a documented failure. Explain
// which required facts are missing without inferring unsupported platforms.
function hardUnknownExplanation(game) {
  const missing = [];
  if (state.platform !== "any") {
    if (game.platforms === null)
      missing.push(`support for required platform ${state.platform} is unrecorded`);
    else if (!syntheticCatalog && !game.platforms.includes(state.platform))
      missing.push(`no recorded ${state.platform} support in this snapshot (not proof the game is unavailable there)`);
  }
  if (state.coopOnly && game.coop === null)
    missing.push("required co-op support is unrecorded");
  return missing.length ? `missing evidence: ${missing.join("; ")} (not proof of incompatibility)`
    : reasons["hard-constraint-unknown"];
}
function renderStoreLinks(game) {
  if (!game.storeLinks?.length) return null;
  const row = element("span", undefined, "storefront-links");
  for (const link of game.storeLinks) {
    const anchor = element("a", storeNames[link.store]);
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.setAttribute("aria-label", "View " + game.name + " on " + storeNames[link.store]);
    row.append(anchor);
  }
  return row;
}
// Bind player-facing provenance documents to the exact built release, not the
// moving master branch. Local unpublished previews use master as navigation only.
function catalogReceiptBase() {
  const revision = document.querySelector('meta[name="playmancer-revision"]')?.getAttribute("content") ?? "";
  const ref = /^[0-9a-f]{40}$/.test(revision) ? revision : "master";
  return `https://github.com/drevendev/Playmancer/blob/${ref}/`;
}
// This exact snapshot has three separately documented data-source receipts.
// Keep the three receipt documents explicit so the original twelve Wikidata
// entries are not misrepresented as evidence for the seven later additions.
function renderCatalogReceipts() {
  if (!["multi-store-genre-pilot-2026-10-28", "multi-store-genre-pilot-30-2026-10-28", "multi-store-genre-pilot-31-2026-11-24"].includes(CATALOG_VERSION)) return null;
  const base = catalogReceiptBase();
  const row = element("span", undefined, "source-receipts");
  row.append("Snapshot field receipts: ");
  const references = [
    ["Original Wikidata games", "docs/REAL_PILOT.md"],
    ["Seven added Wikidata games", "docs/REAL_EXPANSION.md"],
    ...(["multi-store-genre-pilot-30-2026-10-28", "multi-store-genre-pilot-31-2026-11-24"].includes(CATALOG_VERSION) ? [["Six new Wikidata games", "docs/REAL_EXPANSION_30.md"]] : []),
    ...(CATALOG_VERSION === "multi-store-genre-pilot-31-2026-11-24" ? [["Bellbloom source receipt", "docs/REAL_EXPANSION_31.md"]] : []),
    ["Dreven Games storefronts", "docs/STOREFRONTS.md"],
  ];
  for (const [index, [label, path]] of references.entries()) {
    if (index) row.append("; ");
    const link = element("a", label);
    link.href = base + path;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    row.append(link);
  }
  return row;
}
// Inspect source-backed favorite facts before changing weights. This does not
// upgrade missing genre/mechanic/coop evidence or change recommendation scores.
function renderBasketEvidence(game) {
  if (syntheticCatalog) return null;
  const details = element("details", undefined, "basket-evidence");
  details.append(element("summary", `Inspect evidence for ${game.name}`));
  const genreOrigin = game.sourceId === "wikidata-cc0"
    ? "Wikidata genre statements" : "publisher-authored tags";
  details.append(element("p", `Recorded genres (${genreOrigin}): ${game.themes?.length ? game.themes.join(", ") : "unknown"}.`));
  details.append(element("p", `Recorded platforms (positive observations, not an exhaustive support list): ${game.platforms?.length ? game.platforms.join(", ") : "unknown"}.`));
  details.append(element("p", `Catalog mechanics: ${game.mechanics?.length ? game.mechanics.join(", ") : "unknown"}. Co-op: ${game.coop === null ? "unknown" : game.coop ? "recorded yes" : "recorded no"}.`));
  // The independent, partial Gameplay Facts inventory can contain positive
  // observations even when the ranking catalog records no mechanics. Make
  // that distinction inspectable without upgrading those facts into taste fit.
  const entry = $("observation-explorer-entry");
  if (inlineGameplayFacts && entry) {
    const reviewed = inlineGameplayFacts.get(game.id);
    details.append(element("p", reviewed?.size
      ? `Separately reviewed gameplay facts (${reviewed.size} selected, partial): ${[...reviewed.values()].join(", ")}. Not a complete mechanic list; not used for ranking.`
      : "No separately reviewed gameplay facts for this game. Unrecorded features remain unknown."));
    const inspect = element("a", `Inspect gameplay fact sources for ${game.name} (new tab)`, "basket-fact-link");
    // Resolve this exact favorite, not every title sharing part of its display name.
    inspect.href = pinnedFactsSearchLink(game.id, entry);
    inspect.target = "_blank";
    inspect.rel = "noopener noreferrer";
    details.append(inspect);
  }
  const wikidataQid = game.sourceId === "wikidata-cc0"
    ? game.externalIds.find(item => item.provider === "wikidata")?.id : null;
  const source = element("a", wikidataQid ? "Inspect Wikidata item" : "Inspect publisher/storefront receipts");
  source.href = wikidataQid && /^Q[1-9][0-9]*$/.test(wikidataQid)
    ? `https://www.wikidata.org/wiki/${wikidataQid}`
    : catalogReceiptBase() + (game.sourceId === "dreven-owned-bellbloom" ? "docs/REAL_EXPANSION_31.md" : "docs/STOREFRONTS.md");
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  details.append(source);
  return details;
}
// Choose which favorite to compare with a recommendation rather than
// arbitrarily comparing only the first basket seed. This only navigates to
// source-backed observations; partial facts never enter ranking or filters.
function pinnedFactsLink(firstId, secondId, entry, tag = "") {
  const evidenceState = {
    version: entry.dataset.observationVersion,
    catalog: entry.dataset.observationCatalog,
    evidence: entry.dataset.observationEvidence,
    pair: tag ? [] : [firstId, secondId], query: tag ? firstId : "", tag
  };
  return "./observations.html#facts=" + encodeURIComponent(JSON.stringify(evidenceState));
}
// Deep-link to the independently versioned fact explorer's name search.
// A single favorite is not a fabricated pairwise overlap or a taste score.
function pinnedFactsSearchLink(query, entry) {
  const evidenceState = {
    version: entry.dataset.observationVersion,
    catalog: entry.dataset.observationCatalog,
    evidence: entry.dataset.observationEvidence,
    pair: [], query, tag: ""
  };
  return "./observations.html#facts=" + encodeURIComponent(JSON.stringify(evidenceState));
}
function recommendationFactComparison(game) {
  const entry = $("observation-explorer-entry");
  if (syntheticCatalog || !entry ||
      entry.dataset.observationCatalog !== CATALOG_VERSION) return null;
  const favorites = state.seeds.filter(seed => seed.id !== game.id && BY_ID.has(seed.id));
  if (!favorites.length) return null;
  // This independently reviewed positive inventory is not the recommendation
  // coverage percentage or a ranking input; never treat unreviewed as zero fit.
  const reviewed = inlineGameplayFacts?.get(game.id);
  const inventory = reviewed?.size
    ? `${reviewed.size} selected positive gameplay facts (partial)`
    : "gameplay facts unreviewed (unknown, not absent)";
  const chooser = element("details", undefined, "fact-compare-menu");
  chooser.append(element("summary", `Compare recorded facts with your favorites · ${inventory}`));
  chooser.append(element("p", "Selected observations are partial; unrecorded is unknown, not a mismatch. These facts do not change ranking.", "hint"));
  // Pairwise links and this exact-game inventory lookup have different meanings.
  const direct = element("a", `Inspect gameplay fact sources for ${game.name} (new tab)`, "basket-fact-link");
  direct.href = pinnedFactsSearchLink(game.id, entry);
  direct.target = "_blank";
  direct.rel = "noopener noreferrer";
  chooser.append(direct);
  const list = element("ul");
  for (const favorite of favorites) {
    const link = element("a", `With ${BY_ID.get(favorite.id).name} (new tab)`, "fact-compare-link");
    link.href = pinnedFactsLink(favorite.id, game.id, entry);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const row = element("li");
    row.append(link);
    list.append(row);
  }
  chooser.append(list);
  return chooser;
}
// Offer all unordered basket pairs (at most 10), preserving selection order.
// This is an evidence explorer, not a source of ranking weights or inferred fit.
function renderFavoriteFactComparisons() {
  const container = $("basket-fact-comparisons");
  container.replaceChildren();
  const entry = $("observation-explorer-entry");
  if (syntheticCatalog || !entry ||
      entry.dataset.observationCatalog !== CATALOG_VERSION || state.seeds.length < 2) {
    container.hidden = true;
    return;
  }
  const disclosure = element("details");
  disclosure.append(element("summary", "Compare recorded facts between favorites"));
  disclosure.append(element("p", "Observations are partial; unrecorded means unknown, not a mismatch. These comparisons do not change ranking.", "hint"));
  const list = element("ul");
  for (let i = 0; i < state.seeds.length; i++) {
    for (let j = i + 1; j < state.seeds.length; j++) {
      const first = BY_ID.get(state.seeds[i].id);
      const second = BY_ID.get(state.seeds[j].id);
      if (!first || !second) continue;
      const link = element("a", `${first.name} ↔ ${second.name} (new tab)`, "basket-fact-link");
      link.href = pinnedFactsLink(first.id, second.id, entry);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const row = element("li");
      row.append(link);
      list.append(row);
    }
  }
  disclosure.append(list);
  container.append(disclosure);
  container.hidden = list.children.length === 0;
}
function showCatalogIdentity() {
  const stores = ["steam", "googleplay", "itch"]
    .filter(store => CATALOG.some(game => game.storeLinks?.some(link => link.store === store)));
  const storeLabels = stores.map(store => storeNames[store]);
  const all = element("option", "All games"); all.value = "all";
  const options = stores.map(store => {
    const count = CATALOG.filter(game => game.storeLinks?.some(link => link.store === store)).length;
    const option = element("option", `${storeNames[store]} (${count})`);
    option.value = store; return option;
  });
  $("store-filter").replaceChildren(all, ...options);
  $("store-filter-wrap").hidden = stores.length === 0;
  // Present actionable storefronts, not catalog-data provenance, in the hero.
  document.querySelector(".badge").textContent = syntheticCatalog ? "Preview 0.3 · fictional games" :
    "Real games" + (storeLabels.length ? " · " + storeLabels.join(" · ") : "");
  document.querySelector(".intro p").replaceChildren(
    syntheticCatalog ? "Build a basket, adjust what matters, and see why each result appears. This snapshot contains " :
      hasDreven ? "Combine real favorites, see sourced genre overlap and visit official game stores. This multistore pilot contains " :
      "Explore real favorites with transparent genre overlap. This Wikidata CC0 pilot contains ",
    element("strong", `${CATALOG.length} ${syntheticCatalog ? "invented profiles" : "real games"}`),
    syntheticCatalog ? " — not a real game catalog or measured recommendation quality." : ". No third-party descriptions or artwork are copied. Genre comparisons cover 30% of the full feature model; usefulness is unmeasured."
  );
  $("search").placeholder = `Search ${CATALOG.length} ${syntheticCatalog ? "profiles" : "real games"} or aliases…`;
  document.querySelector('label[for="search"]').textContent = syntheticCatalog ? "Add a fictional game" : "Add a real game";
  const labels = { any: "Any platform", mac: "macOS", android: "Android", browser: "Browser (HTML5)" };
  $("platform").replaceChildren(...PLATFORMS.map(value => {
    const option = element("option", labels[value] ?? value);
    option.value = value;
    return option;
  }));
  $("dreven-browse").hidden = !hasDreven;
  $("catalog-browse").textContent = `Browse all ${CATALOG.length} ${syntheticCatalog ? "profiles" : "real games"}`;
  const versions = $("versions");
  const receipts = renderCatalogReceipts();
  document.querySelector(".foot").replaceChildren(
    element("strong", syntheticCatalog ? "Prototype, not a real catalog release." :
      hasDreven ? "Real multistore pilot · limited genre evidence." : "Real Wikidata CC0 pilot · limited genre evidence."),
    " No APIs, tracking, images, paid inference, or external assets. Missing metadata remains unknown. " +
      (syntheticCatalog ? "" : "Platform lists record positive evidence only; unlisted platforms are not verified unsupported. "),
    "Source attribution: " + DEMO_SNAPSHOT.sources.map(source => source.attribution).join("; ") + ".",
    ...(receipts ? [element("br"), receipts] : []),
    element("br"), versions
  );
  if (!syntheticCatalog) document.querySelector(".footer-note").textContent = hasDreven ?
    "Only Wikidata CC0 genres and carefully normalized Dreven Games publisher tags affect fit (30% coverage). Storefront URLs and owner association never affect ranking. Mechanics and co-op remain unknown; platform constraints stay strict." :
    "Only Wikidata CC0 genres affect fit (30% coverage). Mechanics and co-op remain unknown; platform constraints stay strict.";
  document.querySelector("#bridge-lab .eyebrow").textContent = syntheticCatalog
    ? "Synthetic research · separate route experiment" : "Catalog evidence · separate route experiment";
}
let state;
let browseAll = false;
const SEARCH_PAGE_SIZE = 8;
let searchPage = 0;
let searchMatchCount = 0;
let compactResults = false;
function announceBasketAction(action, name) {
  const count = state.seeds.length;
  const summary = `${count} of 5 ${count === 1 ? "game" : "games"} selected.`;
  $("basket-feedback").textContent = `${action}${name ? ` ${name}` : ""}. ${summary}`;
}
function clearShareFeedback() {
  $("share-box").hidden = true;
  $("share-link").value = "";
  $("share-status").textContent = "";
}
function readLocation() {
  let invalidLink = false;
  try { state = decodeState(location.hash); $("error").hidden = true; }
  catch (error) {
    // Do not silently substitute sample favorites for an incompatible link.
    state = { ...initialState(), seeds: [] };
    $("error-message").textContent = error.message + " This basket was not restored.";
    $("error").hidden = false;
    invalidLink = true;
  }
  $("search").value = "";
  $("store-filter").value = "all";
  browseAll = false; searchPage = 0; compactResults = false;
  clearShareFeedback();
  render(true);
  // A newly opened or navigated invalid link should announce the error and
  // leave keyboard users one Tab away from the explicit recovery action.
  if (invalidLink) $("error").focus();
  else announceBasketAction(location.hash.startsWith("#basket=") ? "Shared basket restored" : "Sample basket ready");
}
function commit(rebuildSeeds = false) {
  if (state.bridge && [state.bridge.startId, state.bridge.endId].some((id) => id && !state.seeds.some((seed) => seed.id === id))) state.bridge = null;
  state = validateState(state);
  $("error").hidden = true;
  clearShareFeedback();
  try { history.replaceState(null, "", encodeState(state)); }
  catch { /* Local file browsers may prohibit History API updates; sharing still works. */ }
  render(rebuildSeeds);
}
function drawSeeds() {
  $("seeds").replaceChildren();
  for (const [index, seed] of state.seeds.entries()) {
    const row = element("li", undefined, "seed");
    const title = element("div", undefined, "row");
    title.append(element("span", BY_ID.get(seed.id).name, "seed-name"));
    const remove = element("button", "Remove", "remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${BY_ID.get(seed.id).name}`);
    remove.addEventListener("click", () => {
      state.seeds = state.seeds.filter((s) => s.id !== seed.id);
      commit(true);
      $("search").focus();
      announceBasketAction("Removed", BY_ID.get(seed.id).name);
    });
    title.append(remove);
    const stores = renderStoreLinks(BY_ID.get(seed.id));
    if (stores) title.append(stores);
    const label = element("label", `Weight for ${BY_ID.get(seed.id).name}: `, "weight-label");
    const input = element("input");
    input.id = `weight-${seed.id.startsWith("demo:") ? seed.id.slice(5) : encodeURIComponent(seed.id)}`;
    input.type = "range"; input.min = "1"; input.max = "10"; input.step = "1"; input.value = String(seed.weight);
    label.htmlFor = input.id;
    const output = element("output", String(seed.weight));
    output.htmlFor = input.id;
    label.append(output);
    input.addEventListener("input", () => {
      state.seeds.find((s) => s.id === seed.id).weight = Number(input.value);
      output.value = input.value;
      commit(false);
    });
    row.append(title, label, input);
    // Closures use this rendered index; every move rebuilds the ordered list.
    // Only adjacent seed entries move. Weights, constraints and Bridge IDs stay.
    const orderActions = element("div", undefined, "actions seed-order-actions");
    for (const step of [-1, 1]) {
      const direction = step < 0 ? "up" : "down";
      const move = element("button", `Move ${direction}`);
      move.type = "button";
      move.setAttribute("aria-label", `Move ${BY_ID.get(seed.id).name} ${direction}`);
      move.disabled = index + step < 0 || index + step >= state.seeds.length;
      move.addEventListener("click", () => {
        [state.seeds[index], state.seeds[index + step]] = [state.seeds[index + step], state.seeds[index]];
        commit(true);
        // The old control is gone: focus the new same-direction button, or
        // the opposite enabled one if this favorite reached an edge.
        const buttons = $("seeds").children[index + step].querySelectorAll(".seed-order-actions button");
        const same = buttons[step < 0 ? 0 : 1];
        (same.disabled ? buttons[step < 0 ? 1 : 0] : same).focus();
        announceBasketAction("Moved", `${BY_ID.get(seed.id).name} ${direction}`);
      });
      orderActions.append(move);
    }
    row.append(orderActions);
    // A source-sparse favorite must not look as if its weight supplies
    // genre evidence. This is a disclosure only; ranking stays unchanged.
    if (!syntheticCatalog && !BY_ID.get(seed.id).themes?.length) {
      row.append(element("p",
        "No recorded genres for this favorite. Its weight cannot create source-backed genre similarity; comparisons may abstain.",
        "hint seed-evidence-warning"));
    }
    const inspected = renderBasketEvidence(BY_ID.get(seed.id));
    if (inspected) row.append(inspected);
    $("seeds").append(row);
  }
}
// A recommendation is also a discovery entry point: promote it to a weighted
// favorite without losing the current filters, browse context or share state.
function addFavorite(game, resultIndex = null) {
  if (state.seeds.length >= 5 || state.seeds.some(seed => seed.id === game.id)) return;
  state.seeds.push({ id: game.id, weight: 1 });
  state.excluded = state.excluded.filter(id => id !== game.id);
  if (resultIndex === null) {
    if ($("search").value) searchPage = 0;
    $("search").value = "";
    if ($("store-filter").value !== "all") browseAll = true;
  }
  commit(true);
  if (resultIndex === null) {
    $("search").focus();
  } else {
    // The clicked card has disappeared. Move focus to the next actionable
    // result, or the stable heading when the basket reaches its five-game cap.
    const next = [...$("results").querySelectorAll(".add-result:not(:disabled)")];
    (next[Math.min(resultIndex, next.length - 1)] ?? $("recommendations")).focus();
  }
  announceBasketAction("Added", game.name);
}
// Omitted title punctuation is a common search input (e.g. "Papers Please").
// Keep IDs and evidence tags exact-substring only; this is not fuzzy feature inference.
function titleNameMatches(value, query) {
  const text = value.normalize("NFC").toLowerCase();
  if (text.includes(query)) return true;
  const words = text => text.replace(/['\u2019]/g, "").replace(/[,:;.!?()[\]{}\-–—]/g, " ")
    .replace(/\s+/g, " ").trim();
  const foldedQuery = words(query);
  return foldedQuery.length >= 2 && words(text).includes(foldedQuery);
}
function drawSearch() {
  const entered = $("search").value.trim().normalize("NFC");
  const query = entered.toLowerCase();
  const store = $("store-filter").value;
  const chosen = new Set(state.seeds.map((seed) => seed.id));
  // Chosen games are excluded from Add results, but direct name/ID searches
  // must not falsely report that they are absent from the catalog. Tag/fact
  // matches alone do not establish game identity.
  const selectedNameMatches = query ? state.seeds.map(seed => BY_ID.get(seed.id)).filter(game =>
    game && ([game.name, ...game.aliases].some(value => titleNameMatches(value, query)) ||
      game.id.normalize("NFC").toLowerCase().includes(query))) : [];
  // A pasted link can point to a game hidden by the store filter or already
  // selected. Explain those cases instead of falsely saying the URL is unknown.
  const recordedStoreUrlGame = !syntheticCatalog && query
    ? CATALOG.find(game => matchesRecordedStorefrontUrl(game, entered))
    : null;
  $("search-results").replaceChildren();
  $("catalog-browse").setAttribute("aria-expanded", String(browseAll && !query));
  // Explicit catalog genre labels improve discovery without inventing a
  // mechanic, co-op flag or source-backed match where none is recorded.
  const phraseCandidates = query || browseAll
    ? CATALOG.filter((game) => !chosen.has(game.id)).map((game) => {
      if (!query) return { game, matchedTag: null };
      const nameMatch = [game.name, ...game.aliases].some(value => titleNameMatches(value, query));
      const direct = nameMatch ||
        [game.id, ...(game.sourceId === "dreven-owned" ? ["Dreven Games"] : [])]
          .some(value => value.normalize("NFC").toLowerCase().includes(query)) ||
        matchesRecordedStorefrontUrl(game, entered);
      const tags = syntheticCatalog
        ? [...(game.mechanics ?? []), ...(game.themes ?? [])] : (game.themes ?? []);
      const matchedTag = direct ? null
        : (tags.find((value) => value.normalize("NFC").toLowerCase().includes(query)) ?? null);
      // Independently reviewed positive Gameplay Facts are searchable as
      // discovery evidence only; unlisted facts never become negative evidence,
      // similarity scores, hard filters, or share-state fields.
      const matchedFactEntry = direct || matchedTag || syntheticCatalog ? null :
        ([...(inlineGameplayFacts?.get(game.id) ?? [])]
          .find(([, label]) => label.normalize("NFC").toLowerCase().includes(query)) ?? null);
      const matchedFact = matchedFactEntry?.[1] ?? null;
      return direct || matchedTag || matchedFact
        ? { game, matchedTag, matchedFact, matchedFactId: matchedFactEntry?.[0],
          searchPriority: nameMatch ? 0 : direct ? 1 : matchedTag ? 2 : 3 } : null;
    }).filter(Boolean)
    : [];
  // A phrase/URL hit always wins. Only when no whole-phrase hit exists,
  // permit AND-search across independently recorded catalog fields.
  // This is discovery over partial positive facts, never inferred similarity.
  const searchTerms = query.split(/\s+/).filter(Boolean);
  // Whole-phrase priority applies within the chosen discovery storefront.
  // A phrase found only in another store must not suppress recorded AND-term
  // matches in this one (store filtering is not a ranking hard constraint).
  const phraseInChosenStore = phraseCandidates.some(({ game }) => store === "all" ||
    game.storeLinks?.some(link => link.store === store));
  const combinedTermFallback = searchTerms.length > 1 && !entered.includes("://") &&
    !phraseInChosenStore;
  const candidates = combinedTermFallback
    ? CATALOG.filter(game => !chosen.has(game.id)).filter(game => {
      const fields = [game.name, ...(game.aliases ?? []), game.id,
        ...(game.themes ?? []), ...(syntheticCatalog ? (game.mechanics ?? []) :
          [...(inlineGameplayFacts?.get(game.id)?.values() ?? [])])];
      return searchTerms.every(term => fields.some(value =>
        value.normalize("NFC").toLowerCase().includes(term)));
    }).map(game => ({ game, matchedTag: null, combinedTerms: true, searchPriority: 4 }))
    : phraseCandidates;
  // Source order breaks ties: identity/URL lookups precede genres and partial facts.
  const matches = candidates.filter(({ game }) => store === "all" ||
    game.storeLinks?.some(link => link.store === store))
    .sort((a, b) => (a.searchPriority ?? 0) - (b.searchPriority ?? 0));
  searchMatchCount = matches.length;
  // Keep the DOM bounded even when a broad search matches the whole catalog.
  // Clamp if a favorite or a changed basket removes the last row on this page.
  const lastPage = Math.max(0, Math.ceil(searchMatchCount / SEARCH_PAGE_SIZE) - 1);
  searchPage = Math.min(searchPage, lastPage);
  const start = searchPage * SEARCH_PAGE_SIZE;
  const shown = matches.slice(start, start + SEARCH_PAGE_SIZE);
  const range = `${start + 1}–${start + shown.length}`;
  for (const [index, { game, matchedTag, matchedFact, matchedFactId, combinedTerms }] of shown.entries()) {
    const row = element("li");
    const button = element("button", `+ ${game.name}`);
    button.type = "button";
    button.setAttribute("aria-label", `Add ${game.name}`);
    if (game.kind !== "game") button.append(element("span", ` · ${game.kind} (${game.id})`, "hint"));
    button.disabled = state.seeds.length >= 5;
    // Native buttons remain tabbable; arrow keys are an optional shortcut
    // through the visible choices, without misrepresenting this as a combobox.
    button.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Escape") { $("search").focus(); return; }
      const choices = [...$("search-results").querySelectorAll("li > button:not(:disabled)")];
      const index = choices.indexOf(button);
      if (index < 0) return;
      if (event.key === "ArrowUp" && index === 0) $("search").focus();
      else choices[(index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length].focus();
    });
    button.addEventListener("click", () => addFavorite(game));
    if (matchedTag || matchedFact) {
      // Keep "Add GAME" as the button name; the matched source evidence is
      // associated for both sighted and assistive-technology users.
      const matchDescription = matchedFact
        ? `Recorded gameplay fact (partial evidence): ${matchedFact}. Other facts may be unrecorded.`
        : `${syntheticCatalog ? "Recorded feature tag" : "Recorded genre"}: ${matchedTag}`;
      const evidence = element("span", matchDescription, "hint");
      evidence.id = `search-match-${index}`;
      button.setAttribute("aria-describedby", evidence.id);
      row.append(button, evidence);
      // Offer the dated source before adding a game; the observed fact does not affect fit.
      if (matchedFactId && $("observation-explorer-entry")?.dataset.observationCatalog === CATALOG_VERSION) {
        const receipt = element("a", `Inspect ${game.name} fact source (new tab)`, "fact-compare-link");
        receipt.href = pinnedFactsLink(game.id, null, $("observation-explorer-entry"), matchedFactId);
        receipt.target = "_blank"; receipt.rel = "noopener noreferrer";
        row.append(receipt);
      }
    } else if (!syntheticCatalog && !game.themes?.length) {
      // Surface the gap during direct name search as well as browsing, before
      // the player spends a basket slot or assigns this game a high weight.
      const evidence = element("span",
        "No recorded genres; recommendations involving this favorite may lack comparable evidence.",
        "hint seed-evidence-warning");
      evidence.id = `search-evidence-${index}`;
      button.setAttribute("aria-describedby", evidence.id);
      row.append(button, evidence);
    } else if (browseAll && !query) {
      row.append(button, element("span", `${syntheticCatalog ? "Recorded themes" : "Recorded genres"}: ${game.themes?.join(", ") || "unknown"}`, "hint"));
    } else {
      row.append(button);
    }
    if (combinedTerms) {
      row.append(element("span",
        "All search words appear in recorded name, ID, genre or selected positive gameplay facts. Partial evidence, not a recommendation fit score.",
        "hint"));
    }
    // Let players inspect recorded storefronts before using a favorite slot.
    // These links are optional navigation only, never ranking or share inputs.
    const storeLinks = renderStoreLinks(game);
    if (storeLinks) row.append(storeLinks);
    // In a real release, reveal how many *selected positive observations* were
    // reviewed before players spend a favorite slot. Zero is an evidence gap,
    // never a claim that the game lacks those gameplay features.
    const evidenceEntry = $("observation-explorer-entry");
    if (!syntheticCatalog && evidenceEntry?.dataset.observationCatalog === CATALOG_VERSION && !matchedFactId) {
      const count = inlineGameplayFacts?.get(game.id)?.size ?? 0;
      row.append(element("span", count
        ? `${count} selected gameplay facts (partial evidence; unrecorded facts unknown).`
        : "No reviewed gameplay facts yet (unknown, not absent).", "hint"));
      const inspect = element("a", `Inspect ${game.name} gameplay evidence (new tab)`, "fact-compare-link");
      inspect.href = pinnedFactsSearchLink(game.id, evidenceEntry);
      inspect.target = "_blank";
      inspect.rel = "noopener noreferrer";
      row.append(inspect);
    }
    $("search-results").append(row);
  }
  if (lastPage) {
    const row = element("li");
    const nav = element("div");
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Catalog result pages");
    for (const [step, label] of [[-1, "Previous page"], [1, "Next page"]]) {
      const button = element("button", label);
      button.type = "button";
      button.disabled = step < 0 ? searchPage === 0 : searchPage === lastPage;
      button.addEventListener("click", () => {
        searchPage += step;
        drawSearch();
        ($("search-results").querySelector("li > button:not(:disabled)") ?? $("search")).focus();
      });
      nav.append(button);
    }
    row.append(nav);
    $("search-results").append(row);
  }
  const noun = syntheticCatalog ? "fictional profiles" : "catalog profiles";
  const fromStore = store === "all" ? "" : ` with a recorded ${storeNames[store]} link`;
  const selectedStoreUrl = recordedStoreUrlGame && chosen.has(recordedStoreUrlGame.id);
  const filteredStoreUrl = recordedStoreUrlGame && !selectedStoreUrl && store !== "all" &&
    !recordedStoreUrlGame.storeLinks.some(link => link.store === store);
  const unknownStoreUrl = !syntheticCatalog && !recordedStoreUrlGame && entered.includes("://");
  // A chosen title can coexist with still-addable genre/fact matches.
  // Mention that identity without allowing duplicate seeds or hiding other results.
  const selectedSearchNote = selectedNameMatches.length
    ? ` Already in basket: ${selectedNameMatches.map(game => game.name).join(", ")}. Adjust weights above or remove a favorite.`
    : "";
  $("search-hint").textContent = state.seeds.length >= 5 ? "Five games selected. Remove one before adding another."
    : browseAll && !query && !matches.length ? `No available ${noun}${fromStore}. Choose another store or remove a favorite.`
    : browseAll && !query ? `${range} of ${matches.length} available ${noun}${fromStore}.`
    : !query ? `Search names, IDs, aliases${syntheticCatalog ? "" : ", recorded store URLs"} or ${syntheticCatalog ? "recorded feature tags" : "recorded genres and positive gameplay facts"} to find ${noun}.`
    : !matches.length && selectedStoreUrl ? `${recordedStoreUrlGame.name} is already in your basket. Adjust its weight or remove it above.`
    : !matches.length && filteredStoreUrl ? `${recordedStoreUrlGame.name} is in the catalog, but the ${storeNames[store]} store filter hides it. Choose All games to add it.`
    : !matches.length && selectedNameMatches.length
      ? `Already in basket: ${selectedNameMatches.map(game => game.name).join(", ")}. Adjust ${selectedNameMatches.length === 1 ? "its weight" : "their weights"} or remove a favorite above.`
    : !matches.length && unknownStoreUrl ? "This URL is not a recorded HTTPS store link in our catalog. Search by game name or choose Browse games; no external URLs are fetched."
    : !matches.length && store !== "all" && candidates.length
      ? `${candidates.length} matching ${candidates.length === 1 ? "game is" : "games are"} hidden by the ${storeNames[store]} store filter. Search all stores to see ${candidates.length === 1 ? "it" : "them"}.`
    : matches.length ? ((lastPage
      ? `${range} of ${matches.length} matching ${noun}${fromStore}.`
      : `${matches.length} matching ${noun}${fromStore}. Enter adds a single match; for multiple matches, Enter or Arrow Down focuses the first choice.`) + selectedSearchNote)
    : store === "all" ? (syntheticCatalog ? "No profiles match. Try another name or recorded tag." :
        "No profiles match. Try another name, genre, gameplay fact or recorded store URL; unrecorded facts remain unknown.")
      : `No ${noun}${fromStore} match this search. Try another name, genre, gameplay fact or store; unrecorded facts remain unknown.`;
  // Offer a real recovery only if at least one unselected game would match
  // outside its discovery-store filter, or a name/tag/fact query has no hits.
  // Unrecorded storefront URLs retain their explicit no-fetch guidance.
  // Never relax ranking hard constraints or replace an already chosen game.
  // At five favorites require removal before offering another Add action.
  const filteredRecovery = state.seeds.length < 5 && store !== "all" &&
    !matches.length && candidates.length > 0;
  const browseRecovery = state.seeds.length < 5 && !!query && !matches.length &&
    !selectedNameMatches.length && !selectedStoreUrl && !unknownStoreUrl && !filteredRecovery;
  $("search-recovery").hidden = !(filteredRecovery || browseRecovery);
  $("search-all-stores").dataset.mode = filteredRecovery ? "all-stores" : "browse";
  $("search-all-stores").textContent = filteredRecovery ? "Search all stores" : "Browse available games";
}
function drawEmptyRecovery(result) {
  const empty = $("empty");
  empty.replaceChildren();
  empty.hidden = !!result.ranked.length;
  if (empty.hidden) return;
  if (!state.seeds.length) {
    empty.append(element("p", "Add a game to start; two or more compare tastes."));
    const browse = element("button", "Browse available games");
    browse.onclick = () => $("intro-browse").click();
    empty.append(browse);
    return;
  }

  // Abstentions are not denied platform support.
  empty.append(element("p", "No rankable recommendations for this basket. Hard filters and hidden results have not been relaxed."));
  const list = element("ul", undefined, "empty-reasons");
  const hidden = result.excluded.filter((item) => state.excluded.includes(item.id));
  const failed = result.excluded.filter((item) => item.reason === "hard-constraint-fail" && !state.excluded.includes(item.id));
  const unknown = result.uncertain.filter((item) => item.reason === "hard-constraint-unknown");
  const missing = result.uncertain.filter((item) => item.reason === "missing-seed-affinity");
  const sparseSeeds = state.seeds.filter((seed) => syntheticCatalog
    ? !BY_ID.get(seed.id)?.mechanics?.length : !BY_ID.get(seed.id)?.themes?.length);
  const explain = (count, singular, plural) => {
    if (count) list.append(element("li", `${count} ${count === 1 ? singular : plural}.`));
  };
  explain(hidden.length, "profile was explicitly hidden", "profiles were explicitly hidden");
  explain(failed.length, "profile lacks recorded support for a required filter", "profiles lack recorded support for a required filter");
  explain(unknown.length, "profile has unknown required platform/co-op metadata", "profiles have unknown required platform/co-op metadata");
  explain(missing.length, "profile lacks comparable feature evidence", "profiles lack comparable feature evidence");
  if (missing.length) empty.append(element("p",
    "Missing comparable feature evidence means unknown similarity, not a zero match."));
  if (sparseSeeds.length) {
    list.append(element("li", `${sparseSeeds.map((seed) => BY_ID.get(seed.id).name).join(", ")} ${sparseSeeds.length === 1 ? "has" : "have"} no ${syntheticCatalog ? "mechanics metadata for the 70% evidence threshold" : "recorded genre evidence for this pilot"}. Comparisons must abstain.`));
  }
  if (!list.children.length) list.append(element("li", "No catalog profiles remain outside your basket."));
  empty.append(list);

  const actions = element("div", undefined, "actions empty-actions");
  const addAction = (label, mutate, removedName = null) => {
    const button = element("button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      mutate();
      commit(true);
      $("recommendations").focus();
      if (removedName) announceBasketAction("Removed", removedName);
    });
    actions.append(button);
  };
  // Offer an evidence inspection path without making unknown candidates eligible.
  if (result.uncertain.length) {
    const inspect = element("button", `Review ${result.uncertain.length} uncertain games`);
    inspect.setAttribute("aria-controls", "uncertainty");
    inspect.onclick = () => { $("uncertainty").open = true; $("uncertainty-title").focus(); };
    actions.append(inspect);
  }
  if (hidden.length) addAction(`Restore ${hidden.length} hidden ${hidden.length === 1 ? "profile" : "profiles"}`, () => { state.excluded = []; });
  // Strict constraints change only by explicit player action.
  if ((failed.length || unknown.length) && state.platform !== "any") addAction("Allow any platform", () => { state.platform = "any"; });
  if ((failed.length || unknown.length) && state.coopOnly) addAction("Remove co-op requirement", () => { state.coopOnly = false; });
  for (const seed of sparseSeeds) {
    const name = BY_ID.get(seed.id).name;
    addAction(`Remove ${name} from basket`, () => { state.seeds = state.seeds.filter((item) => item.id !== seed.id); }, name);
  }
  if (actions.children.length) empty.append(actions);
}

function drawResults() {
  const result = recommend(state);
  $("results").replaceChildren();
  const visible = compactResults ? result.ranked.slice(0, 5) : result.ranked;
  visible.forEach((item, index) => {
    const game = BY_ID.get(item.id);
    const card = element("li", undefined, "card"); card.dataset.gameId = item.id;
    const top = element("div", undefined, "card-top");
    const title = element("div", undefined, "card-title");
    title.append(element("h3", game.name), element("p", game.description ?? (syntheticCatalog ? "Description unavailable for this profile." : `Recorded genre labels: ${game.themes?.join(", ") || "unknown"}. No sourced description or artwork.`), "hint"));
    if (game.kind !== "game") title.append(element("p", `Type: ${game.kind}`, "hint"));
    if (!syntheticCatalog && /^wikidata:q[0-9]+$/.test(game.id)) {
      const itemLink = element("a", "View Wikidata source");
      itemLink.href = `https://www.wikidata.org/wiki/${game.id.split(":")[1].toUpperCase()}`;
      itemLink.target = "_blank";
      itemLink.rel = "noopener noreferrer";
      title.append(itemLink);
    }
    if (game.sourceId === "dreven-owned")
      title.append(element("p", "Dreven Games · creator-associated; no ranking boost.", "hint"));
    const stores = renderStoreLinks(game);
    if (stores) title.append(stores);
    const fit = element("div", undefined, "fit");
    const blendSelection = state.mode === "blend" && item.blend;
    const score = blendSelection ? item.blend.objective : item.scores[state.mode === "blend" ? "arithmetic" : state.mode];
    const scoreLabel = blendSelection ? "selection objective / 1" : state.mode === "blend" ? "average fit / 1" : "fit / 1";
    fit.append(element("strong", score.toFixed(3)), element("small", scoreLabel));
    // Blend's list-level marginal objective is not a candidate's source-backed
    // affinity. Even at objective zero, the candidate can share genres with
    // multiple seeds once earlier results have covered their taste strands.
    const noGenreOverlap = !syntheticCatalog && item.scores.arithmetic === 0;
    const noWholeBasketOverlap = !syntheticCatalog && state.mode === "intersection" && item.scores.intersection === 0;
    const zeroBlendGain = !syntheticCatalog && blendSelection && item.blend.objective === 0 && item.scores.arithmetic > 0;
    if (noGenreOverlap) {
      fit.append(element("small", "No recorded genre overlap with any favorite", "fit-warning"));
    } else if (noWholeBasketOverlap) {
      fit.append(element("small", "No recorded genre overlap with at least one favorite", "fit-warning"));
    } else if (zeroBlendGain) {
      fit.append(element("small", "No additional uncovered-strand gain here; some genres still overlap", "fit-warning"));
    }
    top.append(element("span", String(index + 1).padStart(2, "0"), "rank"), title, fit);
    card.append(top);
    // Technical identifiers and source-filter fields are available on demand;
    // keep per-seed affinities, compromise warnings and coverage visible in the list.
    const technicalMetadata = element("p", `Entity: ${game.kind} · ${game.id} · ${syntheticCatalog ? "Platforms" : "Recorded platforms (not exhaustive)"}: ${game.platforms?.join(", ") ?? "unknown"} · Co-op: ${game.coop == null ? "unknown" : game.coop ? "yes" : "no"}`, "metadata");
    const affinities = element("div", undefined, "affinities");
    item.evidence.forEach((pair) => {
      const row = element("div", undefined, "affinity");
      row.append(element("span", `${syntheticCatalog ? "Match to" : "Recorded genre score vs"} ${BY_ID.get(pair.id).name}`), element("b", pair.affinity.toFixed(3)));
      affinities.append(row);
    });
    card.append(affinities);
    const why = element("details", undefined, "explanation");
    why.append(element("summary", noGenreOverlap || noWholeBasketOverlap || zeroBlendGain
      ? `Why ${game.name} appears in this list`
      : `Why ${game.name} matches your basket`));
    for (const pair of item.evidence) {
      const favorite = BY_ID.get(pair.id);
      if (syntheticCatalog) {
        why.append(element("p", `${favorite.name} — shared: ${pair.shared.join(", ") || "none"}. Seed tags not shared: ${pair.notShared.join(", ") || "none"}.`));
      } else {
        // An additional, explicitly uniform genre-mass explanation, NOT the
        // score used for this ranked list. No fabricated tag importance.
        const proxy = observedGenreMass(game, favorite);
        if (proxy === null) {
          why.append(element("p", `${favorite.name} — genre-mass comparison unavailable: recorded genres are missing. Unknown is not a zero match.`));
        } else {
          const percent = weight => (weight * 100).toFixed(1) + "%";
          const gaps = proxy.favoriteGaps.map(entry =>
            `${entry.tag} (${percent(entry.mass)})`).join(", ") || "none";
          why.append(element("p", `${favorite.name} — equal-weight genre proxy (not used for ranking): ${percent(proxy.shared)} observed overlap; ${percent(proxy.favoriteResidual)} favorite genre weight not represented at equal emphasis. Residual genres: ${gaps}. Uniform weights are experimental, not source-supplied importance.`));
        }
      }
    }
    if (item.blend) why.append(element("p", `Blend selection objective: ${item.blend.objective.toFixed(3)}; average fit: ${item.scores.arithmetic.toFixed(3)}; uncovered-strand gain: ${item.blend.gain.toFixed(3)}; relevance weight λ: ${state.lambda}.`));
    if (state.mode === "intersection" && score === 0) why.append(element("p", syntheticCatalog
      ? "No overlap with at least one seed: this is not a strong whole-basket match."
      : "No recorded genre overlap with at least one favorite: not a demonstrated whole-basket match."));
    if (!syntheticCatalog && (noGenreOverlap || noWholeBasketOverlap)) why.append(element("p",
      "Missing recorded overlap does not prove unrelated gameplay. Unrecorded mechanics and other facts remain unknown."));
    why.append(element("p", syntheticCatalog
      ? `Comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}%. Mechanics use 70% and themes 30%; popularity is not used.`
      : `Observed comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}% of the full model (genre labels only, internally held in the themes field). Mechanics are unknown; similarities are exploratory and popularity is not used.`));
    why.append(technicalMetadata);
    card.append(why);
    // Why-game remains the first card summary.
    const observedOverlap = renderObservedOverlap(game);
    if (observedOverlap) card.append(observedOverlap);
    const footer = element("div", undefined, "card-footer");
    footer.append(element("span", `Evidence coverage: ${Math.round(item.evidenceCoverage * 100)}%`, "hint"));
    const factsLink = recommendationFactComparison(game);
    if (factsLink) footer.append(factsLink);
    const add = element("button", "Add to favorites", "add-result");
    add.type = "button";
    add.setAttribute("aria-label", `Add to favorites: ${game.name}`);
    add.disabled = state.seeds.length >= 5;
    if (add.disabled) add.title = "Remove a favorite to add another game";
    add.addEventListener("click", () => addFavorite(game, index));
    footer.append(add);
    const hide = element("button", "Hide result"); hide.type = "button";
    hide.setAttribute("aria-label", `Hide ${game.name}`);
    hide.addEventListener("click", () => {
      state.excluded.push(item.id);
      commit(false);
      // Keep keyboard users in the results at the same position after the
      // clicked card is replaced; use the results heading when none remain.
      const status = $("status");
      status.textContent = `${game.name} hidden. ${status.textContent}`;
      const cards = [...$("results").querySelectorAll(".card")];
      const nextCard = cards[Math.min(index, cards.length - 1)];
      (nextCard?.querySelector(".card-footer button:not(:disabled)") ?? $("recommendations")).focus();
    });
    footer.append(hide); card.append(footer); $("results").append(card);
  });
  drawEmptyRecovery(result);
  const view = $("results-view");
  view.hidden = result.ranked.length <= 5;
  view.setAttribute("aria-pressed", String(compactResults));
  view.textContent = compactResults ? `Show all ${result.ranked.length} recommendations` : "Show top 5 recommendations";
  // Count actual absence of overlap, not Blend's marginal list objective.
  const zeroFit = !syntheticCatalog ? visible.filter((item) => item.scores.arithmetic === 0).length : 0;
  const partialIntersection = !syntheticCatalog && state.mode === "intersection"
    ? visible.filter((item) => item.scores.intersection === 0 && item.scores.arithmetic > 0).length : 0;
  $("status").textContent = `${visible.length} of ${result.ranked.length} ranked shown · ${result.uncertain.length} uncertain · ${result.excluded.length} excluded (including seeds and hidden results).` +
    (zeroFit ? ` ${zeroFit} shown with zero demonstrated basket fit; these are exploratory, not positive matches.` : "") +
    (partialIntersection ? ` ${partialIntersection} lack recorded genre overlap with at least one favorite; not demonstrated whole-basket matches.` : "");
  $("uncertainty-title").textContent = `Uncertain (${result.uncertain.length}) and excluded (${result.excluded.length}) profiles`;
  $("partition-list").replaceChildren();
  for (const item of [...result.uncertain, ...result.excluded]) {
    const reason = item.reason === "seed" ? reasons.seed
      : state.excluded.includes(item.id) ? "hidden by you"
      : item.reason === "hard-constraint-fail" ? hardFilterExplanation(BY_ID.get(item.id))
      : item.reason === "hard-constraint-unknown" ? hardUnknownExplanation(BY_ID.get(item.id))
      : reasons[item.reason] ?? item.reason;
    // The mixed partition must identify each row's status without relying
    // on its position, color, or the collapsed disclosure heading.
    const row = element("li", `${item.status === "excluded" ? "Excluded" : "Uncertain"} · ${BY_ID.get(item.id).name}: ${reason}.`);
    // Optional source inspection does not qualify unknown hard-filter support.
    // A pinned fact lookup also works when no reviewed observation is available.
    if (item.reason !== "seed") {
      const game = BY_ID.get(item.id);
      const stores = renderStoreLinks(game);
      if (stores) row.append(" · Store listing (not compatibility proof): ", stores);
      const entry = $("observation-explorer-entry");
      if (!syntheticCatalog && entry?.dataset.observationCatalog === CATALOG_VERSION) {
        const facts = element("a", `Inspect available gameplay evidence for ${game.name} (new tab)`, "fact-compare-link");
        facts.href = pinnedFactsSearchLink(game.id, entry);
        facts.target = "_blank";
        facts.rel = "noopener noreferrer";
        row.append(" · Gameplay facts (partial or unknown; not compatibility proof): ", facts);
      }
    }
    // A mistaken hide must be reversible without also restoring every other
    // exclusion. This is an explicit player action, never a filter fallback.
    if (state.excluded.includes(item.id)) {
      const restoreOne = element("button", "Restore this game");
      restoreOne.type = "button";
      restoreOne.setAttribute("aria-label", `Restore ${BY_ID.get(item.id).name}`);
      restoreOne.addEventListener("click", () => {
        state.excluded = state.excluded.filter((id) => id !== item.id);
        commit(false);
        // The clicked row is rebuilt; leave focus on a persistent, visible
        // native summary rather than dropping keyboard users into the body.
        $("uncertainty-title").focus();
        $("status").textContent = `${BY_ID.get(item.id).name} restored from hidden games. Required filters are unchanged. ${$("status").textContent}`;
      });
      row.append(" ", restoreOne);
    }
    $("partition-list").append(row);
  }
}
function render(rebuildSeeds) {
  $("seed-count").textContent = `${state.seeds.length} / 5 games`;
  $("mode").value = state.mode; $("platform").value = state.platform; $("coop").checked = state.coopOnly;
  $("lambda").value = String(state.lambda); $("lambda-value").value = String(state.lambda);
  $("blend-control").hidden = state.mode !== "blend";
  $("mode-note").textContent = notes[state.mode];
  $("restore").hidden = state.excluded.length === 0;
  $("restore").textContent = state.excluded.length === 1 ? "Restore 1 hidden game" : `Restore all ${state.excluded.length} hidden games`;
  // Changes to weights, ranking mode and hard filters must not close the
  // favorite-pair disclosure or drop keyboard focus: pair identities only
  // change when the seed list is rebuilt.
  if (rebuildSeeds) {
    drawSeeds();
    renderFavoriteFactComparisons();
  }
  drawSearch(); drawResults(); renderBridge(state);
}
$("search").addEventListener("input", () => {
  searchPage = 0;
  browseAll = !$("search").value.trim() && $("store-filter").value !== "all";
  drawSearch();
});
$("store-filter").addEventListener("change", () => { browseAll = true; searchPage = 0; drawSearch(); });
$("search-all-stores").addEventListener("click", () => {
  const browse = $("search-all-stores").dataset.mode === "browse";
  $("store-filter").value = "all";
  searchPage = 0;
  if (browse) {
    // A failed search becomes explicit catalog discovery; only the search
    // controls change, never the weighted basket, filters, exclusions or URL.
    $("search").value = "";
    browseAll = true;
  }
  drawSearch();
  // Move focus off the vanished recovery button onto the first available game.
  const first = $("search-results").querySelector("li > button:not(:disabled)");
  (first ?? $("search")).focus();
});
$("search").addEventListener("keydown", (event) => {
  // Composition keys belong to the input method, not catalog navigation.
  if (event.isComposing || event.keyCode === 229) return;
  // Escape from a result returns to the search field (above). A second Escape
  // clears the query or closes an open Browse list without touching the basket,
  // selected store, hard filters or the versioned share URL.
  if (event.key === "Escape" && ($("search").value || browseAll)) {
    event.preventDefault();
    $("search").value = "";
    browseAll = false;
    searchPage = 0;
    drawSearch();
    return;
  }
  const choices = $("search-results").querySelectorAll("li > button:not(:disabled)");
  const first = choices[0];
  if (!first) return;
  if (event.key === "Enter" && $("search").value.trim()) {
    event.preventDefault();
    // An ambiguous search must not silently pick the first catalog entry.
    if (searchMatchCount === 1) first.click();
    else first.focus();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    first.focus();
  }
});
$("mode").addEventListener("change", (event) => { state.mode = event.target.value; commit(); });
$("platform").addEventListener("change", (event) => { state.platform = event.target.value; commit(); });
$("coop").addEventListener("change", (event) => { state.coopOnly = event.target.checked; commit(); });
$("lambda").addEventListener("input", (event) => { state.lambda = Number(event.target.value); commit(); });
$("results-view").addEventListener("click", () => { compactResults = !compactResults; drawResults(); $("results-view").focus(); });
$("restore").addEventListener("click", () => { state.excluded = []; commit(); $("recommendations").focus(); });
$("clear").addEventListener("click", () => { state = { ...state, seeds: [], excluded: [] }; $("search").value = ""; commit(true); $("search").focus(); announceBasketAction("Basket cleared"); });
$("reset").addEventListener("click", () => { state = initialState(); $("search").value = ""; commit(true); $("search").focus(); announceBasketAction("Sample basket restored"); });
$("error-recover").addEventListener("click", () => { $("reset").click(); $("recommendations").focus(); });
$("share").addEventListener("click", async () => {
  const url = new URL(location.href); url.hash = encodeState(state);
  $("share-link").value = url.href; $("share-box").hidden = false;
  try { await navigator.clipboard.writeText(url.href); $("share-status").textContent = "Basket link copied. It includes weights, filters, exclusions, and both versions."; }
  catch { $("share-status").textContent = "Copy the selected URL manually. Your basket is fully encoded in it."; $("share-link").focus(); $("share-link").select(); }
});
showCatalogIdentity();
$("search").placeholder = `Search ${CATALOG.length} ${syntheticCatalog ? "fictional profiles or features" : "real games or genres"}…`;
$("versions").textContent = `Catalog: ${CATALOG_VERSION} (${DEMO_SNAPSHOT.kind}) · Method: ${METHOD_VERSION} · Ranking: P03 harmonic / uncovered-strand baselines.`;
document.querySelector(".skip").addEventListener("click", (event) => { event.preventDefault(); $("recommendations").focus(); });
window.addEventListener("hashchange", readLocation);
readLocation();
bindBridgeControls(() => state, (settings) => { state.bridge = settings; commit(false); });

// A clearly disclosed editorial shortcut changes search only, never ranking.
$("catalog-browse").addEventListener("click", () => {
  const filtered = $("store-filter").value !== "all";
  $("store-filter").value = "all";
  browseAll = filtered || !browseAll; searchPage = 0;
  $("search").value = "";
  drawSearch();
});
$("dreven-browse").addEventListener("click", () => {
  browseAll = false; searchPage = 0;
  $("store-filter").value = "all";
  $("search").value = "Dreven Games";
  drawSearch();
  $("search").focus();
  announceBasketAction("Browsing Dreven Games");
});
// First-screen actions preserve the shared basket; catalog discovery is not a reset.
$("intro-sample").addEventListener("click", () => { $("reset").click(); $("recommendations").focus(); });
// Start an empty basket from the first screen without relaxing hard filters.
// Reuse the accessible Clear action to preserve share and focus behavior.
$("intro-empty").addEventListener("click", () => { $("clear").click(); });
$("intro-browse").addEventListener("click", () => {
  browseAll = true; searchPage = 0;
  $("store-filter").value = "all";
  $("search").value = "";
  drawSearch();
  ($("search-results").querySelector("button:not(:disabled)") ?? $("search")).focus();
});
