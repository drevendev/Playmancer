import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, DEMO_SNAPSHOT, PLATFORMS, decodeState, encodeState, initialState, recommend, validateState } from "./demo.js";
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
// This exact snapshot has three separately documented data-source receipts.
// Keep the three receipt documents explicit so the original twelve Wikidata
// entries are not misrepresented as evidence for the seven later additions.
function renderCatalogReceipts() {
  if (!["multi-store-genre-pilot-2026-10-28", "multi-store-genre-pilot-30-2026-10-28"].includes(CATALOG_VERSION)) return null;
  const base = "https://github.com/drevendev/Playmancer/blob/master/";
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
function showCatalogIdentity() {
  document.querySelector(".badge").textContent = syntheticCatalog ? "Preview 0.3 · fictional games" :
    hasDreven ? "Real games · Wikidata + Dreven Games" : "Real games · Wikidata CC0 genre pilot";
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
  const versions = $("versions");
  const receipts = renderCatalogReceipts();
  document.querySelector(".foot").replaceChildren(
    element("strong", syntheticCatalog ? "Prototype, not a real catalog release." :
      hasDreven ? "Real multistore pilot · limited genre evidence." : "Real Wikidata CC0 pilot · limited genre evidence."),
    " No APIs, tracking, images, paid inference, or external assets. Missing metadata remains unknown. ",
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
    $("seeds").append(row);
  }
}
function drawSearch() {
  const query = $("search").value.trim().normalize("NFC").toLowerCase();
  const chosen = new Set(state.seeds.map((seed) => seed.id));
  $("search-results").replaceChildren();
  const matches = query
    ? CATALOG.filter((game) => !chosen.has(game.id) && [game.name, game.id, ...game.aliases, ...(game.sourceId === "dreven-owned" ? ["Dreven Games"] : [])]
      .some(value => value.normalize("NFC").toLowerCase().includes(query)))
    : [];
  for (const game of matches) {
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
    button.addEventListener("click", () => {
      if (state.seeds.length >= 5 || state.seeds.some((seed) => seed.id === game.id)) return;
      state.seeds.push({ id: game.id, weight: 1 });
      state.excluded = state.excluded.filter((id) => id !== game.id);
      $("search").value = ""; commit(true); $("search").focus();
      announceBasketAction("Added", game.name);
    });
    row.append(button); $("search-results").append(row);
  }
  const noun = syntheticCatalog ? "fictional profiles" : "catalog profiles";
  $("search-hint").textContent = state.seeds.length >= 5 ? "Five games selected. Remove one before adding another."
    : !query ? `Type a game name or declared alias to see matching ${noun}.`
    : matches.length ? `${matches.length} matching ${noun}. Use Arrow Down to browse; Enter adds a focused result.` : "No profiles match. Try another name.";
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
  explain(failed.length, "profile fails a required filter", "profiles fail a required filter");
  explain(unknown.length, "profile has unknown required platform/co-op metadata", "profiles have unknown required platform/co-op metadata");
  explain(missing.length, "profile lacks comparable feature evidence", "profiles lack comparable feature evidence");
  if (sparseSeeds.length) {
    list.append(element("li", `${sparseSeeds.map((seed) => BY_ID.get(seed.id).name).join(", ")} ${sparseSeeds.length === 1 ? "has" : "have"} no ${syntheticCatalog ? "mechanics metadata for the 70% evidence threshold" : "Wikidata genre evidence for the pilot"}. Comparisons must abstain.`));
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
  result.ranked.forEach((item, index) => {
    const game = BY_ID.get(item.id);
    const card = element("li", undefined, "card"); card.dataset.gameId = item.id;
    const top = element("div", undefined, "card-top");
    const title = element("div", undefined, "card-title");
    title.append(element("h3", game.name), element("p", game.description ?? (syntheticCatalog ? "Description unavailable for this profile." : `Recorded genre labels: ${game.themes?.join(", ") || "unknown"}. No sourced description or artwork.`), "hint"));
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
    card.append(top, element("p", `Entity: ${game.kind} · ${game.id} · Platforms: ${game.platforms?.join(", ") ?? "unknown"} · Co-op: ${game.coop == null ? "unknown" : game.coop ? "yes" : "no"}`, "metadata"));
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
      why.append(element("p", `${BY_ID.get(pair.id).name} — shared: ${pair.shared.join(", ") || "none"}. Seed tags not shared: ${pair.notShared.join(", ") || "none"}.`));
    }
    if (item.blend) why.append(element("p", `Blend selection objective: ${item.blend.objective.toFixed(3)}; average fit: ${item.scores.arithmetic.toFixed(3)}; uncovered-strand gain: ${item.blend.gain.toFixed(3)}; relevance weight λ: ${state.lambda}.`));
    if (state.mode === "intersection" && score === 0) why.append(element("p", "No overlap with at least one seed: this is not a strong whole-basket match."));
    why.append(element("p", syntheticCatalog
      ? `Comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}%. Mechanics use 70% and themes 30%; popularity is not used.`
      : `Observed comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}% of the full model (genre labels only, internally held in the themes field). Mechanics are unknown; similarities are exploratory and popularity is not used.`));
    card.append(why);
    const footer = element("div", undefined, "card-footer");
    footer.append(element("span", `Evidence coverage: ${Math.round(item.evidenceCoverage * 100)}%`, "hint"));
    const hide = element("button", "Hide result"); hide.type = "button";
    hide.setAttribute("aria-label", `Hide ${game.name}`);
    hide.addEventListener("click", () => {
      state.excluded.push(item.id);
      commit(false);
      // Keep keyboard users in the results at the same position after the
      // clicked card is replaced; use the results heading when none remain.
      const status = $("status");
      status.textContent = `${game.name} hidden. ${status.textContent}`;
      const buttons = $("results").querySelectorAll(".card-footer button");
      if (buttons.length) buttons[Math.min(index, buttons.length - 1)].focus();
      else $("recommendations").focus();
    });
    footer.append(hide); card.append(footer); $("results").append(card);
  });
  drawEmptyRecovery(result);
  // Count actual absence of overlap, not Blend's marginal list objective.
  const zeroFit = !syntheticCatalog ? result.ranked.filter((item) => item.scores.arithmetic === 0).length : 0;
  const partialIntersection = !syntheticCatalog && state.mode === "intersection"
    ? result.ranked.filter((item) => item.scores.intersection === 0 && item.scores.arithmetic > 0).length : 0;
  $("status").textContent = `${result.ranked.length} shown · ${result.uncertain.length} uncertain · ${result.excluded.length} excluded (including seeds and hidden results).` +
    (zeroFit ? ` ${zeroFit} shown with zero demonstrated basket fit; these are exploratory, not positive matches.` : "") +
    (partialIntersection ? ` ${partialIntersection} lack overlap with at least one favorite; not whole-basket matches.` : "");
  $("uncertainty-title").textContent = `Uncertain (${result.uncertain.length}) and excluded (${result.excluded.length}) profiles`;
  $("partition-list").replaceChildren();
  for (const item of [...result.uncertain, ...result.excluded]) {
    const reason = item.reason === "seed" ? reasons.seed
      : state.excluded.includes(item.id) ? "hidden by you" : reasons[item.reason] ?? item.reason;
    $("partition-list").append(element("li", `${BY_ID.get(item.id).name}: ${reason}.`));
  }
}
function render(rebuildSeeds) {
  $("seed-count").textContent = `${state.seeds.length} / 5 games`;
  $("mode").value = state.mode; $("platform").value = state.platform; $("coop").checked = state.coopOnly;
  $("lambda").value = String(state.lambda); $("lambda-value").value = String(state.lambda);
  $("blend-control").hidden = state.mode !== "blend";
  $("mode-note").textContent = notes[state.mode];
  $("restore").hidden = state.excluded.length === 0;
  if (rebuildSeeds) drawSeeds();
  drawSearch(); drawResults(); renderBridge(state);
}
$("search").addEventListener("input", drawSearch);
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
$("versions").textContent = `Catalog: ${CATALOG_VERSION} (${DEMO_SNAPSHOT.kind}) · Method: ${METHOD_VERSION} · Ranking: P03 harmonic / uncovered-strand baselines.`;
document.querySelector(".skip").addEventListener("click", (event) => { event.preventDefault(); $("recommendations").focus(); });
window.addEventListener("hashchange", readLocation);
readLocation();
bindBridgeControls(() => state, (settings) => { state.bridge = settings; commit(false); });

// A clearly disclosed editorial shortcut changes search only, never ranking.
$("dreven-browse").addEventListener("click", () => {
  $("search").value = "Dreven Games";
  drawSearch();
  $("search").focus();
  announceBasketAction("Browsing Dreven Games");
});
// First-screen actions reuse the authoritative reset/clear paths, not a second state store.
$("intro-sample").addEventListener("click", () => { $("reset").click(); $("recommendations").focus(); });
$("intro-empty").addEventListener("click", () => { $("clear").click(); $("search").focus(); });
