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
function readLocation() {
  try { state = decodeState(location.hash); $("error").hidden = true; }
  catch (error) {
    state = { ...initialState(), seeds: [] };
    $("error").textContent = error.message + " Use ‘Reset to sample basket’ to recover explicitly.";
    $("error").hidden = false;
  }
  render(true);
}
function commit(rebuildSeeds = false) {
  state = validateState(state);
  $("error").hidden = true;
  $("share-box").hidden = true;
  $("share-status").textContent = "";
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
  const matches = CATALOG.filter((game) => !chosen.has(game.id) && game.name.toLowerCase().includes(query));
  for (const game of matches) {
    const row = element("li");
    const button = element("button", `+ ${game.name}`);
    button.type = "button";
    button.setAttribute("aria-label", `Add ${game.name}`);
    button.disabled = state.seeds.length >= 5;
    button.addEventListener("click", () => {
      if (state.seeds.length >= 5 || state.seeds.some((seed) => seed.id === game.id)) return;
      state.seeds.push({ id: game.id, weight: 1 }); $("search").value = ""; commit(true); $("search").focus();
    });
    row.append(button); $("search-results").append(row);
  }
  $("search-hint").textContent = state.seeds.length >= 5 ? "Five games selected. Remove one before adding another."
    : matches.length ? `${matches.length} available fictional profiles.` : "No profiles match. Try another name.";
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
    const score = state.mode === "blend" ? item.scores.arithmetic : item.scores[state.mode];
    fit.append(element("strong", score.toFixed(3)), element("small", state.mode === "blend" ? "average fit / 1" : "fit / 1"));
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
    if (item.blend) why.append(element("p", `Blend selection objective: ${item.blend.objective.toFixed(3)}; uncovered-strand gain: ${item.blend.gain.toFixed(3)}; relevance weight λ: ${state.lambda}.`));
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
  $("empty").hidden = result.ranked.length > 0;
  $("empty").textContent = state.seeds.length ? "No eligible results. Your filters and exclusions have not been relaxed. Change them explicitly to explore another basket." : "Add a profile to start. Two or more let you compare different preferences.";
  $("status").textContent = `${result.ranked.length} shown · ${result.uncertain.length} uncertain · ${result.excluded.length} excluded (including seeds and hidden results).`;
  $("uncertainty-title").textContent = `Uncertain (${result.uncertain.length}) and excluded (${result.excluded.length}) profiles`;
  $("partition-list").replaceChildren();
  for (const item of [...result.uncertain, ...result.excluded]) {
    const reason = state.excluded.includes(item.id) ? "hidden by you" : reasons[item.reason] ?? item.reason;
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
