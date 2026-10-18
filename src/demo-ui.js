import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, decodeState, encodeState, initialState, recommend, validateState } from "./demo.js";
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
let state;
function clearShareFeedback() {
  $("share-box").hidden = true;
  $("share-link").value = "";
  $("share-status").textContent = "";
}
function readLocation() {
  try { state = decodeState(location.hash); $("error").hidden = true; }
  catch (error) {
    state = { ...initialState(), seeds: [] };
    $("error").textContent = error.message + " Use ‘Reset to sample basket’ to recover explicitly.";
    $("error").hidden = false;
  }
  $("search").value = "";
  clearShareFeedback();
  render(true);
}
function commit(rebuildSeeds = false) {
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
    remove.addEventListener("click", () => { state.seeds = state.seeds.filter((s) => s.id !== seed.id); commit(true); $("search").focus(); });
    title.append(remove);
    const label = element("label", `Weight for ${BY_ID.get(seed.id).name}: `, "weight-label");
    const input = element("input");
    input.id = `weight-${seed.id.slice(5)}`;
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
  const query = $("search").value.trim().toLowerCase();
  const chosen = new Set(state.seeds.map((seed) => seed.id));
  $("search-results").replaceChildren();
  const matches = query
    ? CATALOG.filter((game) => !chosen.has(game.id) && game.name.toLowerCase().includes(query))
    : [];
  for (const game of matches) {
    const row = element("li");
    const button = element("button", `+ ${game.name}`);
    button.type = "button";
    button.setAttribute("aria-label", `Add ${game.name}`);
    button.disabled = state.seeds.length >= 5;
    button.addEventListener("click", () => {
      if (state.seeds.length >= 5 || state.seeds.some((seed) => seed.id === game.id)) return;
      state.seeds.push({ id: game.id, weight: 1 });
      state.excluded = state.excluded.filter((id) => id !== game.id);
      $("search").value = ""; commit(true); $("search").focus();
    });
    row.append(button); $("search-results").append(row);
  }
  $("search-hint").textContent = state.seeds.length >= 5 ? "Five games selected. Remove one before adding another."
    : !query ? "Type a game name to see matching fictional profiles."
    : matches.length ? `${matches.length} matching fictional profiles.` : "No profiles match. Try another name.";
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
  const sparseSeeds = state.seeds.filter((seed) => BY_ID.get(seed.id)?.mechanics == null);
  const explain = (count, singular, plural) => {
    if (count) list.append(element("li", `${count} ${count === 1 ? singular : plural}.`));
  };
  explain(hidden.length, "profile was explicitly hidden", "profiles were explicitly hidden");
  explain(failed.length, "profile fails a required filter", "profiles fail a required filter");
  explain(unknown.length, "profile has unknown required platform/co-op metadata", "profiles have unknown required platform/co-op metadata");
  explain(missing.length, "profile lacks comparable feature evidence", "profiles lack comparable feature evidence");
  if (sparseSeeds.length) {
    list.append(element("li", `${sparseSeeds.map((seed) => BY_ID.get(seed.id).name).join(", ")} ${sparseSeeds.length === 1 ? "has" : "have"} no mechanics metadata. Comparisons to these basket games cannot meet the 70% evidence threshold.`));
  }
  if (!list.children.length) list.append(element("li", "No catalog profiles remain outside your basket."));
  empty.append(list);

  const actions = element("div", undefined, "actions empty-actions");
  const addAction = (label, mutate) => {
    const button = element("button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      mutate();
      commit(true);
      $("recommendations").focus();
    });
    actions.append(button);
  };
  if (hidden.length) addAction(`Restore ${hidden.length} hidden ${hidden.length === 1 ? "profile" : "profiles"}`, () => { state.excluded = []; });
  if (failed.length && state.platform !== "any") addAction("Allow any platform", () => { state.platform = "any"; });
  if (failed.length && state.coopOnly) addAction("Remove co-op requirement", () => { state.coopOnly = false; });
  for (const seed of sparseSeeds) {
    const name = BY_ID.get(seed.id).name;
    addAction(`Remove ${name} from basket`, () => { state.seeds = state.seeds.filter((item) => item.id !== seed.id); });
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
    title.append(element("h3", game.name), element("p", game.description, "hint"));
    const fit = element("div", undefined, "fit");
    const blendSelection = state.mode === "blend" && item.blend;
    const score = blendSelection ? item.blend.objective : item.scores[state.mode === "blend" ? "arithmetic" : state.mode];
    const scoreLabel = blendSelection ? "selection objective / 1" : state.mode === "blend" ? "average fit / 1" : "fit / 1";
    fit.append(element("strong", score.toFixed(3)), element("small", scoreLabel));
    top.append(element("span", String(index + 1).padStart(2, "0"), "rank"), title, fit);
    card.append(top, element("p", `Platforms: ${game.platforms?.join(", ") ?? "unknown"} · Co-op: ${game.coop == null ? "unknown" : game.coop ? "yes" : "no"}`, "metadata"));
    const affinities = element("div", undefined, "affinities");
    item.evidence.forEach((pair) => {
      const row = element("div", undefined, "affinity");
      row.append(element("span", `Match to ${BY_ID.get(pair.id).name}`), element("b", pair.affinity.toFixed(3)));
      affinities.append(row);
    });
    card.append(affinities);
    const why = element("details", undefined, "explanation");
    why.append(element("summary", "Why this match?"));
    for (const pair of item.evidence) {
      why.append(element("p", `${BY_ID.get(pair.id).name} — shared: ${pair.shared.join(", ") || "none"}. Seed tags not shared: ${pair.notShared.join(", ") || "none"}.`));
    }
    if (item.blend) why.append(element("p", `Blend selection objective: ${item.blend.objective.toFixed(3)}; average fit: ${item.scores.arithmetic.toFixed(3)}; uncovered-strand gain: ${item.blend.gain.toFixed(3)}; relevance weight λ: ${state.lambda}.`));
    if (state.mode === "intersection" && score === 0) why.append(element("p", "No overlap with at least one seed: this is not a strong whole-basket match."));
    why.append(element("p", `Comparable feature weight: ${Math.round(item.evidenceCoverage * 100)}%. Mechanics use 70% and themes 30%; popularity is not used.`));
    card.append(why);
    const footer = element("div", undefined, "card-footer");
    footer.append(element("span", `Evidence coverage: ${Math.round(item.evidenceCoverage * 100)}%`, "hint"));
    const hide = element("button", "Hide result"); hide.type = "button";
    hide.setAttribute("aria-label", `Hide ${game.name}`);
    hide.addEventListener("click", () => { state.excluded.push(item.id); commit(false); $("recommendations").focus(); });
    footer.append(hide); card.append(footer); $("results").append(card);
  });
  drawEmptyRecovery(result);
  $("status").textContent = `${result.ranked.length} shown · ${result.uncertain.length} uncertain · ${result.excluded.length} excluded (including seeds and hidden results).`;
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
  drawSearch(); drawResults();
}
$("search").addEventListener("input", drawSearch);
$("mode").addEventListener("change", (event) => { state.mode = event.target.value; commit(); });
$("platform").addEventListener("change", (event) => { state.platform = event.target.value; commit(); });
$("coop").addEventListener("change", (event) => { state.coopOnly = event.target.checked; commit(); });
$("lambda").addEventListener("input", (event) => { state.lambda = Number(event.target.value); commit(); });
$("restore").addEventListener("click", () => { state.excluded = []; commit(); $("recommendations").focus(); });
$("clear").addEventListener("click", () => { state = { ...state, seeds: [], excluded: [] }; $("search").value = ""; commit(true); $("search").focus(); });
$("reset").addEventListener("click", () => { state = initialState(); $("search").value = ""; commit(true); $("search").focus(); });
$("share").addEventListener("click", async () => {
  const url = new URL(location.href); url.hash = encodeState(state);
  $("share-link").value = url.href; $("share-box").hidden = false;
  try { await navigator.clipboard.writeText(url.href); $("share-status").textContent = "Basket link copied. It includes weights, filters, exclusions, and both versions."; }
  catch { $("share-status").textContent = "Copy the selected URL manually. Your basket is fully encoded in it."; $("share-link").focus(); $("share-link").select(); }
});
$("versions").textContent = `Catalog: ${CATALOG_VERSION} · Method: ${METHOD_VERSION} · Ranking: P03 harmonic / uncovered-strand baselines.`;
document.querySelector(".skip").addEventListener("click", (event) => { event.preventDefault(); $("recommendations").focus(); });
window.addEventListener("hashchange", readLocation);
readLocation();

// First-screen actions reuse the authoritative reset/clear paths, not a second state store.
$("intro-sample").addEventListener("click", () => { $("reset").click(); $("recommendations").focus(); });
$("intro-empty").addEventListener("click", () => { $("clear").click(); $("search").focus(); });
