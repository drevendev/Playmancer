import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, DEMO_SNAPSHOT, PLATFORMS, decodeState, encodeState, initialState, observedGenreMass, recommend, validateState } from "./demo.js";
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
// A positive platform observation is not an exhaustive compatibility list.
// Keep strict filtering, but do not tell players that an unlisted platform is
// known to be unsupported. Explicitly observed non-co-op is different.
function hardFilterExplanation(game) {
  if (state.platform !== "any" && game.platforms !== null &&
      !game.platforms.includes(state.platform)) {
    return syntheticCatalog ? `no recorded ${state.platform} support in this fictional profile`
      : `no recorded ${state.platform} support in this snapshot (not proof the game is unavailable there)`;
  }
  if (state.coopOnly && game.coop === false) return "co-op explicitly recorded as unavailable";
  return reasons["hard-constraint-fail"];
}
// A hard-filter unknown is not the same as a documented failure. Explain
// which required facts are missing without inferring unsupported platforms.
function hardUnknownExplanation(game) {
  const missing = [];
  if (state.platform !== "any" && game.platforms === null)
    missing.push(`support for required platform ${state.platform} is unrecorded`);
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
  if (!["multi-store-genre-pilot-2026-10-28", "multi-store-genre-pilot-30-2026-10-28"].includes(CATALOG_VERSION)) return null;
  const base = catalogReceiptBase();
  const row = element("span", undefined, "source-receipts");
  row.append("Snapshot field receipts: ");
  const references = [
    ["Original Wikidata games", "docs/REAL_PILOT.md"],
    ["Seven added Wikidata games", "docs/REAL_EXPANSION.md"],
    ...(CATALOG_VERSION === "multi-store-genre-pilot-30-2026-10-28" ? [["Six new Wikidata games", "docs/REAL_EXPANSION_30.md"]] : []),
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
  details.append(element("p", `Mechanics: ${game.mechanics?.length ? game.mechanics.join(", ") : "unknown"}. Co-op: ${game.coop === null ? "unknown" : game.coop ? "recorded yes" : "recorded no"}.`));
  const wikidataQid = game.sourceId === "wikidata-cc0"
    ? game.externalIds.find(item => item.provider === "wikidata")?.id : null;
  const source = element("a", wikidataQid ? "Inspect Wikidata item" : "Inspect publisher/storefront receipts");
  source.href = wikidataQid && /^Q[1-9][0-9]*$/.test(wikidataQid)
    ? `https://www.wikidata.org/wiki/${wikidataQid}`
    : catalogReceiptBase() + "docs/STOREFRONTS.md";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  details.append(source);
  return details;
}
// Choose which favorite to compare with a recommendation rather than
// arbitrarily comparing only the first basket seed. This only navigates to
// source-backed observations; partial facts never enter ranking or filters.
function pinnedFactsLink(firstId, secondId, entry) {
  const evidenceState = {
    version: entry.dataset.observationVersion,
    catalog: entry.dataset.observationCatalog,
    evidence: entry.dataset.observationEvidence,
    pair: [firstId, secondId], query: "", tag: ""
  };
  return "./observations.html#facts=" + encodeURIComponent(JSON.stringify(evidenceState));
}
function recommendationFactComparison(game) {
  const entry = $("observation-explorer-entry");
  if (syntheticCatalog || !entry ||
      entry.dataset.observationCatalog !== CATALOG_VERSION) return null;
  const favorites = state.seeds.filter(seed => seed.id !== game.id && BY_ID.has(seed.id));
  if (!favorites.length) return null;
  const chooser = element("details", undefined, "fact-compare-menu");
  chooser.append(element("summary", "Compare recorded facts with your favorites"));
  chooser.append(element("p", "Selected observations are partial; unrecorded is unknown, not a mismatch.", "hint"));
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
let browseLimit = 8;
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
  $("store-filter").value = "all"; // Discovery filters are not part of shared basket state.
  browseAll = false; browseLimit = 8; compactResults = false;
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
  for (const seed of state.seeds) {
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
function drawSearch() {
  const query = $("search").value.trim().normalize("NFC").toLowerCase();
  const store = $("store-filter").value;
  const chosen = new Set(state.seeds.map((seed) => seed.id));
  $("search-results").replaceChildren();
  $("catalog-browse").setAttribute("aria-expanded", String(browseAll && !query));
  // Explicit catalog genre labels improve discovery without inventing a
  // mechanic, co-op flag or source-backed match where none is recorded.
  const matches = query || browseAll
    ? CATALOG.filter((game) => !chosen.has(game.id) &&
        (store === "all" || game.storeLinks?.some(link => link.store === store))).map((game) => {
      if (!query) return { game, matchedTag: null };
      const direct = [game.name, game.id, ...game.aliases, ...(game.sourceId === "dreven-owned" ? ["Dreven Games"] : [])]
        .some((value) => value.normalize("NFC").toLowerCase().includes(query));
      const tags = syntheticCatalog
        ? [...(game.mechanics ?? []), ...(game.themes ?? [])] : (game.themes ?? []);
      const matchedTag = direct ? null
        : (tags.find((value) => value.normalize("NFC").toLowerCase().includes(query)) ?? null);
      return direct || matchedTag ? { game, matchedTag } : null;
    }).filter(Boolean)
    : [];
  const shown = browseAll && !query ? matches.slice(0, browseLimit) : matches;
  for (const [index, { game, matchedTag }] of shown.entries()) {
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
      const choices = [...$("search-results").querySelectorAll("button:not(:disabled)")];
      const index = choices.indexOf(button);
      if (index < 0) return;
      if (event.key === "ArrowUp" && index === 0) $("search").focus();
      else choices[(index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length].focus();
    });
    button.addEventListener("click", () => addFavorite(game));
    if (matchedTag) {
      // Keep the button's stable "Add GAME" accessible name while exposing
      // why a tag-only search matched, also for keyboard/screen-reader users.
      const evidence = element("span", `${syntheticCatalog ? "Recorded feature tag" : "Recorded genre"}: ${matchedTag}`, "hint");
      evidence.id = `search-match-${index}`;
      button.setAttribute("aria-describedby", evidence.id);
      row.append(button, evidence);
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
    $("search-results").append(row);
  }
  if (browseAll && !query && shown.length < matches.length) {
    const row = element("li");
    const more = element("button", `Show ${Math.min(8, matches.length - shown.length)} more games`);
    more.type = "button";
    more.addEventListener("click", () => {
      const firstNew = shown.length;
      browseLimit += 8;
      drawSearch();
      $("search-results").querySelectorAll("li > button")[firstNew]?.focus();
    });
    row.append(more); $("search-results").append(row);
  }
  const noun = syntheticCatalog ? "fictional profiles" : "catalog profiles";
  const fromStore = store === "all" ? "" : ` with a recorded ${storeNames[store]} link`;
  $("search-hint").textContent = state.seeds.length >= 5 ? "Five games selected. Remove one before adding another."
    : browseAll && !query && !matches.length ? `No available ${noun}${fromStore}. Choose another store or remove a favorite.`
    : browseAll && !query ? `${shown.length} of ${matches.length} available ${noun}${fromStore} shown. Add a favorite or show more games.`
    : !query ? `Search names, IDs, aliases or ${syntheticCatalog ? "recorded feature tags" : "recorded genres"} to find ${noun}.`
    : matches.length ? `${matches.length} matching ${noun}${fromStore}. Use Arrow Down to browse; Enter adds a focused result.`
    : store === "all" ? "No profiles match. Try another name or recorded tag." : `No ${noun}${fromStore} match this search. Try another name, tag, or store.`;
}
function drawEmptyRecovery(result) {
  const empty = $("empty");
  empty.hidden = result.ranked.length > 0;
  empty.replaceChildren();
  if (result.ranked.length > 0) return;
  if (state.seeds.length === 0) {
    empty.append(element("p", "Add a profile to start. Two or more let you compare different preferences."));
    return;
  }

  empty.append(element("p", "No eligible results. Hard filters and hidden results have not been relaxed."));
  const list = element("ul", undefined, "empty-reasons");
  const hidden = result.excluded.filter((item) => state.excluded.includes(item.id));
  const failed = result.excluded.filter((item) => item.reason === "hard-constraint-fail" && !state.excluded.includes(item.id));
  const unknown = result.uncertain.filter((item) => item.reason === "hard-constraint-unknown");
  const missing = result.uncertain.filter((item) => item.reason === "missing-seed-affinity");
  const sparseSeeds = state.seeds.filter((seed) => syntheticCatalog ? BY_ID.get(seed.id)?.mechanics == null : BY_ID.get(seed.id)?.themes == null);
  const explain = (count, singular, plural) => {
    if (count) list.append(element("li", `${count} ${count === 1 ? singular : plural}.`));
  };
  explain(hidden.length, "profile was explicitly hidden", "profiles were explicitly hidden");
  explain(failed.length, "profile lacks recorded support for a required filter", "profiles lack recorded support for a required filter");
  explain(unknown.length, "profile has unknown required platform/co-op metadata", "profiles have unknown required platform/co-op metadata");
  explain(missing.length, "profile lacks comparable feature evidence", "profiles lack comparable feature evidence");
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
  if (hidden.length) addAction(`Restore ${hidden.length} hidden ${hidden.length === 1 ? "profile" : "profiles"}`, () => { state.excluded = []; });
  // Unknown source metadata can leave zero eligible results without any explicit
  // failures. Offer a deliberate recovery choice; never relax constraints silently.
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
      fit.append(element("small", "No shared genres with any favorite", "fit-warning"));
    } else if (noWholeBasketOverlap) {
      fit.append(element("small", "No shared genres with at least one favorite", "fit-warning"));
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
      row.append(element("span", `Match to ${BY_ID.get(pair.id).name}`), element("b", pair.affinity.toFixed(3)));
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
    if (state.mode === "intersection" && score === 0) why.append(element("p", "No overlap with at least one seed: this is not a strong whole-basket match."));
    why.append(element("p", syntheticCatalog
      ? `Comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}%. Mechanics use 70% and themes 30%; popularity is not used.`
      : `Observed comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}% of the full model (genre labels only, internally held in the themes field). Mechanics are unknown; similarities are exploratory and popularity is not used.`));
    why.append(technicalMetadata);
    card.append(why);
    const footer = element("div", undefined, "card-footer");
    footer.append(element("span", `Evidence coverage: ${Math.round(item.evidenceCoverage * 100)}%`, "hint"));
    const factsLink = recommendationFactComparison(game);
    if (factsLink) footer.append(factsLink);
    const add = element("button", "Add to favorites", "add-result");
    add.type = "button";
    add.setAttribute("aria-label", `Add ${game.name} to favorites`);
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
  $("status").textContent = `${visible.length} of ${result.ranked.length} eligible shown · ${result.uncertain.length} uncertain · ${result.excluded.length} excluded (including seeds and hidden results).` +
    (zeroFit ? ` ${zeroFit} shown with zero demonstrated basket fit; these are exploratory, not positive matches.` : "") +
    (partialIntersection ? ` ${partialIntersection} lack overlap with at least one favorite; not whole-basket matches.` : "");
  $("uncertainty-title").textContent = `Uncertain (${result.uncertain.length}) and excluded (${result.excluded.length}) profiles`;
  $("partition-list").replaceChildren();
  for (const item of [...result.uncertain, ...result.excluded]) {
    const reason = item.reason === "seed" ? reasons.seed
      : state.excluded.includes(item.id) ? "hidden by you"
      : item.reason === "hard-constraint-fail" ? hardFilterExplanation(BY_ID.get(item.id))
      : item.reason === "hard-constraint-unknown" ? hardUnknownExplanation(BY_ID.get(item.id))
      : reasons[item.reason] ?? item.reason;
    const row = element("li", `${BY_ID.get(item.id).name}: ${reason}.`);
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
  browseAll = !$("search").value.trim() && $("store-filter").value !== "all";
  drawSearch();
});
$("store-filter").addEventListener("change", () => { browseAll = true; browseLimit = 8; drawSearch(); });
$("search").addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  const first = $("search-results").querySelector("button:not(:disabled)");
  if (!first) return;
  event.preventDefault();
  first.focus();
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
  browseAll = filtered || !browseAll; browseLimit = 8;
  $("search").value = "";
  drawSearch();
});
$("dreven-browse").addEventListener("click", () => {
  browseAll = false;
  $("store-filter").value = "all";
  $("search").value = "Dreven Games";
  drawSearch();
  $("search").focus();
  announceBasketAction("Browsing Dreven Games");
});
// First-screen actions preserve the shared basket; catalog discovery is not a reset.
$("intro-sample").addEventListener("click", () => { $("reset").click(); $("recommendations").focus(); });
$("intro-browse").addEventListener("click", () => {
  browseAll = true; browseLimit = 8;
  $("store-filter").value = "all";
  $("search").value = "";
  drawSearch();
  ($("search-results").querySelector("button:not(:disabled)") ?? $("search")).focus();
});
