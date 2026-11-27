import { readFile, mkdir, writeFile, rename, rm, stat } from "node:fs/promises";
import { sealStylesheet } from "./stylesheet-integrity.mjs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { Script } from "node:vm";
import { validateCatalogSnapshot } from "../src/catalog.js";

// Deliberately bounded to seven explicit dependency-free modules, not a general bundler.
const root = fileURLToPath(new URL("../", import.meta.url));
let output = join(root, "_site"), catalogPath = null, hasOutput = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--catalog") {
    if (catalogPath !== null || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Expected one --catalog snapshot.json argument");
    }
    catalogPath = resolve(args[++i]);
  } else if (args[i].startsWith("--") || hasOutput) {
    throw new Error("Usage: node scripts/build-demo.mjs [output-directory] [--catalog snapshot.json]");
  } else {
    output = resolve(args[i]);
    hasOutput = true;
  }
}
// Ordinary parsed JSON only. API access is not a redistribution permission;
// the validator checks recorded field approvals, not their legal truth.
let selectedSnapshot = null;
if (catalogPath !== null) {
  if ((await stat(catalogPath)).size > 8 * 1024 * 1024) throw new Error("Catalog input exceeds the 8 MiB limit");
  const input = JSON.parse(await readFile(catalogPath, "utf8"));
  if (Array.isArray(input?.games) && input.games.length > 2000) throw new Error("Catalog exceeds the 2000-profile engineering bound");
  selectedSnapshot = validateCatalogSnapshot(input, { requirePublishable: true });
}
const modules = ["src/ranking.js", "src/catalog.js", "src/bridge.js", "src/bridge-preview.js", "src/demo.js", "src/bridge-ui.js", "src/demo-ui.js"];
const expectedImports = [
  null, null, null,
  "import { findBridgeRoute } from './bridge.js';\n",
  'import { blendCandidates, rankCandidates } from "./ranking.js";\nimport { validateCatalogSnapshot } from "./catalog.js";\nimport { BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\n',
  'import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\nimport { BY_ID, CATALOG, CATALOG_VERSION, BRIDGE_STATE_VERSION } from "./demo.js";\n',
  'import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, DEMO_SNAPSHOT, PLATFORMS, decodeState, encodeState, initialState, observedGenreMass, recommend, validateState, matchesRecordedStorefrontUrl } from "./demo.js";\nimport { bindBridgeControls, renderBridge } from "./bridge-ui.js";\n'
];
const defaultDemo = await import(new URL("../src/demo.js", import.meta.url));
const effectiveSnapshot = selectedSnapshot ?? defaultDemo.DEMO_SNAPSHOT;
const inlineJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
const parts = [];
for (const [index, path] of modules.entries()) {
  let source = await readFile(join(root, path), "utf8");
  // The immutable validated snapshot fixes the profile count at build time.
  // Keep the explicit abstention in large builds and source-mode execution,
  // but do not spend the strict small-player budget on an unreachable branch.
  if (path === "src/bridge-ui.js") {
    const largeCatalogGuard = [
      "  if (CATALOG.length > 250) {",
      "    cancelPendingBridge();",
      "    steps.removeAttribute(\"aria-busy\");",
      "    status.textContent = \"Bridge unavailable: this catalog exceeds the 250-profile route limit. Basket ranking and sharing remain available.\";",
      "    return;",
      "  }",
      ""
    ].join("\n");
    if (source.split(largeCatalogGuard).length !== 2)
      throw new Error("Unexpected large-catalog Bridge guard boundary");
    if (effectiveSnapshot.games.length <= 250) source = source.replace(largeCatalogGuard, "");
  }
  // Fictional/alternative synthetic previews have no publication-bound
  // observation explorer. Omit the real-only deep-link implementation from
  // their strict <95 kB self-contained bundle, keeping an inert call site.
  if (path === "src/demo-ui.js" && effectiveSnapshot.kind === "synthetic") {
    // The real-only quick path is not emitted into the fixed-size fictional build.
    const mobileStartMarker = "// Narrow screens show a single selection count/action above results. Move the";
    const quickStart = source.indexOf(mobileStartMarker);
    const quickLayout = source.indexOf("// Real quick-path layout: secondary evidence and guidance remain in tools.", quickStart);
    const quickEnd = source.indexOf("let state;", quickLayout);
    if (source.split(mobileStartMarker).length !== 2 || quickStart < 0 ||
        quickLayout <= quickStart || quickEnd <= quickLayout)
      throw new Error("Unexpected real quick-path boundary");
    source = source.slice(0, quickStart) + source.slice(quickEnd);
    for (const line of [
      'if (!syntheticCatalog) prepareRealQuickPath();\n',
      '  if (!syntheticCatalog) renderRealFilterSummary();\n',
      "  if (!syntheticCatalog) $(\"status\").textContent = conciseRealResultStatus(visible.length, result, zeroFit, partialIntersection); else\n",
      "  if (!syntheticCatalog) $(\"mobile-favorites\").textContent = `${state.seeds.length} / 5 games · ${state.seeds.length ? \"Edit favorites\" : \"Choose favorites\"}`;\n",
      "    if (CATALOG_VERSION === \"multi-store-identity-candidate-54-2026-11-26\" && /unavailable catalog/i.test(error.message)) $(\"error-message\").textContent += \" Keep the original share link. To recover a historical 51-game basket, see the README local build instructions; do not rewrite its fragment.\";\n",
    ]) {
      if (source.split(line).length !== 2) throw new Error("Unexpected real quick-path call");
      source = source.replace(line, "");
    }
    // Real-only favorite layout: synthetic fixtures retain the original controls and byte budget.
    const favoriteStart = source.indexOf("// Real favorites keep one native disclosure per row");
    const favoriteEnd = source.indexOf("function drawSeeds() {", favoriteStart);
    if (favoriteStart < 0 || favoriteEnd <= favoriteStart)
      throw new Error("Unexpected compact favorite boundary");
    source = source.slice(0, favoriteStart) + source.slice(favoriteEnd);
    for (const line of [
      '        if (!syntheticCatalog) same.closest(".seed-options").open = true;\n',
      '    if (!syntheticCatalog) compactFavorite(row, title);\n',
    ]) {
      if (source.split(line).length !== 2) throw new Error("Unexpected compact favorite call");
      source = source.replace(line, "");
    }
    // Keep the fictional preview's strict fixed-size budget: storefront
    // browse links exist only for rights-reviewed real catalog entries.
    const searchStoreLinks = [
      '    // Let players inspect recorded storefronts before using a favorite slot.',
      '    // These links are optional navigation only, never ranking or share inputs.',
      '    const storeLinks = renderStoreLinks(game);',
      '    if (storeLinks) row.append(storeLinks);',
      ''
    ].join("\n");
    if (source.split(searchStoreLinks).length !== 2)
      throw new Error("Unexpected real-only catalog search link boundary");
    source = source.replace(searchStoreLinks, "");
    // The real player includes a browsable positive-fact inventory; invented
    // games cannot expose reviewed public evidence. Strip this exact block
    // before compiling the strict-size fictional player.
    const searchFactsStart = source.indexOf("    // In a real release, reveal how many");
    const searchFactsEnd = source.indexOf('    $("search-results").append(row);', searchFactsStart);
    if (searchFactsStart < 0 || searchFactsEnd <= searchFactsStart)
      throw new Error("Unexpected real-only browse-fact boundary");
    source = source.slice(0, searchFactsStart) + source.slice(searchFactsEnd);
    // Do not ship real-only partition store navigation in fictional previews.
    const partitionStoreLinks = [
      "    // Optional source inspection does not qualify unknown hard-filter support.",
      "    // A pinned fact lookup also works when no reviewed observation is available.",
      "    if (item.reason !== \"seed\") {",
      "      const game = BY_ID.get(item.id);",
      "      const stores = renderStoreLinks(game);",
      "      if (stores) row.append(\" · Store listing (not compatibility proof): \", stores);",
      "      const entry = $(\"observation-explorer-entry\");",
      "      if (!syntheticCatalog && entry?.dataset.observationCatalog === CATALOG_VERSION) {",
      "        const facts = element(\"a\", `Inspect available gameplay evidence for ${game.name} (new tab)`, \"fact-compare-link\");",
      "        facts.href = pinnedFactsSearchLink(game.id, entry);",
      "        facts.target = \"_blank\";",
      "        facts.rel = \"noopener noreferrer\";",
      "        row.append(\" · Gameplay facts (partial or unknown; not compatibility proof): \", facts);",
      "      }",
      "    }",
      ""
    ].join("\n");
    if (source.split(partitionStoreLinks).length !== 2)
      throw new Error("Unexpected real-only uncertain-store link boundary");
    source = source.replace(partitionStoreLinks, "");
    // Fictional games have no recorded external storefront links. Retain an
    // inert call site without shipping the real-only link builder.
    const storeLinksStart = source.indexOf("function renderStoreLinks(game) {");
    const storeLinksEnd = source.indexOf("// Bind player-facing provenance documents", storeLinksStart);
    if (storeLinksStart < 0 || storeLinksEnd <= storeLinksStart)
      throw new Error("Unexpected real-only store-link renderer boundary");
    source = source.slice(0, storeLinksStart) +
      "function renderStoreLinks() { return null; }\n" + source.slice(storeLinksEnd);
    // This optional real-only positive-fact overlay has no fictional data.
    // Remove unreachable JSON map/parsing code rather than relaxing the
    // established <95 kB synthetic preview budget.
    const overlapStart = source.indexOf("const inlineGameplayFacts = (() => {");
    const overlapEnd = source.indexOf("// A positive platform observation", overlapStart);
    if (overlapStart < 0 || overlapEnd <= overlapStart)
      throw new Error("Unexpected real-only observed-overlap boundary");
    source = source.slice(0, overlapStart) +
      "const inlineGameplayFacts = null;\nfunction renderObservedOverlap() { return null; }\n" +
      source.slice(overlapEnd);
    // Invented profiles never render live-catalog provenance disclosures.
    // Remove the unreachable revision parser and receipt/evidence DOM builders
    // from only the strict-size fictional bundle. Published real builds retain
    // the complete immutable-SHA links and their interactive explanations.
    const receiptStart = source.indexOf("function catalogReceiptBase() {");
    const realEvidenceEnd = source.indexOf("function pinnedFactsLink(", receiptStart);
    if (receiptStart < 0 || realEvidenceEnd <= receiptStart) throw new Error("Unexpected receipt/evidence boundary");
    source = source.slice(0, receiptStart) +
      "function renderCatalogReceipts() { return null; }\n" +
      "function renderBasketEvidence() { return null; }\n" +
      source.slice(realEvidenceEnd);
    const start = source.indexOf("function pinnedFactsLink(");
    const end = source.indexOf("function showCatalogIdentity() {", start);
    if (start < 0 || end <= start) throw new Error("Unexpected observation deep-link boundary");
    source = source.slice(0, start) +
      "function recommendationFactComparison() { return null; }\n" +
      "function renderFavoriteFactComparisons() { $(\"basket-fact-comparisons\").hidden = true; }\n" +
      source.slice(end);
    // The searched-fact source link is real-catalog-only. Remove that unreachable
    // DOM/link builder from fictional bundles to preserve the strict HTML budget.
    const factSourceStart = source.indexOf("      // Offer the dated source before adding a game;");
    const factSourceEnd = source.indexOf("    } else if (!syntheticCatalog && !game.themes?.length) {", factSourceStart);
    if (factSourceStart < 0 || factSourceEnd <= factSourceStart)
      throw new Error("Unexpected real-only search receipt boundary");
    source = source.slice(0, factSourceStart) + source.slice(factSourceEnd);
    // Synthetic search never receives a positive-only real observation map.
    // Keep its original name/feature-tag lookup, not the real-only ID/receipt
    // matching code, to avoid shipping dead logic in the size-limited preview.
    const factSearchStart = source.indexOf("      const matchedFactEntry = ");
    const factSearchEnd = source.indexOf("    }).filter(Boolean)", factSearchStart);
    if (factSearchStart < 0 || factSearchEnd <= factSearchStart)
      throw new Error("Unexpected real-only fact-search boundary");
    source = source.slice(0, factSearchStart) +
      "      return direct || matchedTag ? { game, matchedTag, matchedFact: null } : null;\n" +
      source.slice(factSearchEnd);
    // The cross-field partial-fact fallback is real-catalog-only. Synthetic
    // fixtures use the preexisting simple name/feature-tag search contract;
    // remove the unused fallback and its copy before size-limited bundling.
    const termFallbackStart = source.indexOf("  // A phrase/URL hit always wins.");
    const termFallbackEnd = source.indexOf("  // Source order breaks ties:", termFallbackStart);
    if (termFallbackStart < 0 || termFallbackEnd <= termFallbackStart)
      throw new Error("Unexpected real-only cross-field fallback boundary");
    source = source.slice(0, termFallbackStart) + source.slice(termFallbackEnd);
    const termNoteStart = source.indexOf("    if (combinedTerms) {");
    // Storefront and positive-fact browse blocks were already removed above;
    // the retained row append is the stable boundary for synthetic stripping.
    const termNoteEnd = source.indexOf('    $("search-results").append(row);', termNoteStart);
    if (termNoteStart < 0 || termNoteEnd <= termNoteStart)
      throw new Error("Unexpected real-only cross-field explanation boundary");
    source = source.slice(0, termNoteStart) + source.slice(termNoteEnd);
    const phraseBinding = "  const phraseCandidates = query || browseAll";
    if (source.split(phraseBinding).length !== 2)
      throw new Error("Unexpected cross-field phrase-binding boundary");
    source = source.replace(phraseBinding, "  const candidates = query || browseAll");
    const factSearchDestructure = "for (const [index, { game, matchedTag, matchedFact, matchedFactId, combinedTerms }] of shown.entries()) {";
    if (source.split(factSearchDestructure).length !== 2)
      throw new Error("Unexpected real-only fact-ID binding");
    source = source.replace(factSearchDestructure,
      "for (const [index, { game, matchedTag, matchedFact }] of shown.entries()) {");
    // No fictional profile has a recorded storefront URL. Remove the
    // unreachable real-catalog empty-state recovery from this size-limited
    // synthetic bundle without weakening the HTML budget or real-player copy.
    // Only the real catalog can carry sourced "already in basket" identity hints.
    // Omit those real-only branches from the strict-size fictional bundle;
    // keep its existing name search and basket membership behavior unchanged.
    const selectedIdentityStart = source.indexOf("  // Chosen games are excluded from Add results,");
    const selectedIdentityEnd = source.indexOf("  // A pasted link can point to a game hidden by the store filter or already", selectedIdentityStart);
    if (selectedIdentityStart < 0 || selectedIdentityEnd <= selectedIdentityStart)
      throw new Error("Unexpected selected-game identity hint boundary");
    source = source.slice(0, selectedIdentityStart) + source.slice(selectedIdentityEnd);
    const selectedHintStart = source.indexOf('    : !matches.length && selectedNameMatches.length');
    const selectedHintEnd = source.indexOf('    : !matches.length && unknownStoreUrl', selectedHintStart);
    if (selectedHintStart < 0 || selectedHintEnd <= selectedHintStart)
      throw new Error("Unexpected selected-game hint branch boundary");
    source = source.slice(0, selectedHintStart) + source.slice(selectedHintEnd);
    const urlLookupStart = source.indexOf("  // A pasted link can point to a game hidden by the store filter or already");
    const urlLookupEnd = source.indexOf('  $("search-results").replaceChildren();', urlLookupStart);
    if (urlLookupStart < 0 || urlLookupEnd <= urlLookupStart)
      throw new Error("Unexpected real-only storefront recovery lookup boundary");
    source = source.slice(0, urlLookupStart) + source.slice(urlLookupEnd);
    const urlStatusStart = source.indexOf("  const selectedStoreUrl = recordedStoreUrlGame");
    const urlStatusEnd = source.indexOf('  $("search-hint").textContent', urlStatusStart);
    if (urlStatusStart < 0 || urlStatusEnd <= urlStatusStart)
      throw new Error("Unexpected real-only storefront recovery status boundary");
    source = source.slice(0, urlStatusStart) + source.slice(urlStatusEnd);
    const urlHintPattern = /^    : !matches\.length && (?:selectedStoreUrl|filteredStoreUrl|unknownStoreUrl) \? .*\n/gm;
    if ((source.match(urlHintPattern) ?? []).length !== 3)
      throw new Error("Unexpected real-only storefront recovery hint branches");
    source = source.replace(urlHintPattern, "");
    // Only the real player reports selected identity alongside other addable
    // search matches. Drop its suffix from the synthetic-sized bundle after
    // removing the real-only selected-game binding above.
    const selectedSearchSuffix = " + selectedSearchNote)";
    if (source.split(selectedSearchSuffix).length !== 2)
      throw new Error("Unexpected real-only selected-match suffix boundary");
    source = source.replace(selectedSearchSuffix, ")");
    // The synthetic preview has no store selector options to recover from.
    // Remove real-only recovery instead of relaxing the fixed HTML size gate.
    const genericHintStart = source.indexOf('    : !matches.length && store !== "all" && candidates.length');
    const genericHintEnd = source.indexOf('    : matches.length ?', genericHintStart);
    if (genericHintStart < 0 || genericHintEnd <= genericHintStart)
      throw new Error("Unexpected real-only filtered-search hint boundary");
    source = source.slice(0, genericHintStart) + source.slice(genericHintEnd);
    const candidatesBinding = "  const candidates = query || browseAll";
    const storeFilterStart = source.indexOf('  const matches = candidates.filter(({ game }) => store === "all" ||');
    // Keep shared page-count/clamping initialization in both build variants.
    const storeFilterEnd = source.indexOf('  matchCount = matches.length;', storeFilterStart);
    if (source.split(candidatesBinding).length !== 2 || storeFilterStart < 0 || storeFilterEnd <= storeFilterStart)
      throw new Error("Unexpected real-only store-search binding");
    source = source.slice(0, storeFilterStart) + source.slice(storeFilterEnd);
    source = source.replace(candidatesBinding, "  const matches = query || browseAll");
    const recoveryStateStart = source.indexOf("  // Offer a real recovery only if at least one unselected game would match");
    const recoveryStateEnd = source.indexOf("}\nfunction drawEmptyRecovery(", recoveryStateStart);
    if (recoveryStateStart < 0 || recoveryStateEnd <= recoveryStateStart)
      throw new Error("Unexpected search recovery state boundary");
    source = source.slice(0, recoveryStateStart) + source.slice(recoveryStateEnd);
    const recoveryActionStart = source.indexOf('$("search-all-stores").addEventListener("click", () => {');
    const recoveryActionEnd = source.indexOf('$("search").addEventListener("keydown", (event) => {', recoveryActionStart);
    if (recoveryActionStart < 0 || recoveryActionEnd <= recoveryActionStart)
      throw new Error("Unexpected search recovery action boundary");
    source = source.slice(0, recoveryActionStart) + source.slice(recoveryActionEnd);
    for (const line of ["  if ($(\"browse-options\")) $(\"browse-options\").hidden = !syntheticCatalog;\n", "  if ($(\"browse-options\")) $(\"browse-options\").hidden = false;\n"]) {
      if (source.split(line).length !== 2) throw new Error("Unexpected real-only browse options boundary");
      source = source.replace(line, "");
    }
    // The fictional search copy is identical; omit the unreachable real-only helper.
    const idleHint = "    : !query ? (syntheticCatalog ? `Search names, IDs, aliases or recorded feature tags to find ${noun}.` : \"Search titles, genres, gameplay facts or store links.\")";
    if (source.split(idleHint).length !== 2) throw new Error("Unexpected idle search helper boundary");
    source = source.replace(idleHint, "    : !query ? `Search names, IDs, aliases or recorded feature tags to find ${noun}.`");
    // The new empty-state evidence jump is a real-catalog recovery path.
    // Keep the fictional fixture below its fixed 95 kB budget without dropping
    // the live player's strict-filter explanation control.
    const uncertaintyJumpStart = source.indexOf(
      "  // Offer an evidence inspection path without making unknown candidates eligible.");
    const uncertaintyJumpEnd = source.indexOf("  if (hidden.length) addAction(", uncertaintyJumpStart);
    if (uncertaintyJumpStart < 0 || uncertaintyJumpEnd <= uncertaintyJumpStart)
      throw new Error("Unexpected real-only uncertainty jump boundary");
    source = source.slice(0, uncertaintyJumpStart) + source.slice(uncertaintyJumpEnd);
    // Fictional profiles have neither Wikidata QIDs nor an owner-store
    // provenance badge; retain these links in the real release only.
    const realItemStart = source.indexOf('    if (!syntheticCatalog && /^wikidata:q[0-9]+$/.test(game.id)) {');
    const realItemEnd = source.indexOf('    const stores = renderStoreLinks(game);', realItemStart);
    if (realItemStart < 0 || realItemEnd <= realItemStart)
      throw new Error("Unexpected real-only recommendation source-link boundary");
    source = source.slice(0, realItemStart) + source.slice(realItemEnd);
    // The equal-weight genre proxy is a real-catalog-only explanation.
    // The fictional preview uses authored mechanics/theme overlap instead;
    // avoid shipping unreachable sourced-genre branches in its strict 95kB HTML.
    const genreProxyStart = source.indexOf('      } else {\n        // An additional, explicitly uniform genre-mass explanation');
    const genreProxyEnd = source.indexOf('      }\n    }\n    if (item.blend)', genreProxyStart);
    if (genreProxyStart < 0 || genreProxyEnd <= genreProxyStart)
      throw new Error("Unexpected real-only genre-proxy boundary");
    source = source.slice(0, genreProxyStart) + '      }\n' +
      source.slice(genreProxyEnd + '      }\n'.length);
    // Fictional previews can never enter real-only genre-warning branches.
    // Strip those unreachable DOM labels instead of loosening the strict
    // <95kB deterministic HTML budget after real-player copy improvements.
    const genreStart = source.indexOf('    const noGenreOverlap = !syntheticCatalog &&');
    const genreEnd = source.indexOf('    top.append(element("span"', genreStart);
    if (genreStart < 0 || genreEnd <= genreStart)
      throw new Error("Unexpected real-only genre warning boundary");
    source = source.slice(0, genreStart) +
      "    const noGenreOverlap = false, noWholeBasketOverlap = false, zeroBlendGain = false;\n" +
      source.slice(genreEnd);
    const unknownStart = source.indexOf(
      '    if (!syntheticCatalog && (noGenreOverlap || noWholeBasketOverlap)) why.append');
    const unknownEnd = source.indexOf('    why.append(element("p", syntheticCatalog', unknownStart);
    if (unknownStart < 0 || unknownEnd <= unknownStart)
      throw new Error("Unexpected real-only unknown-genre explanation boundary");
    source = source.slice(0, unknownStart) + source.slice(unknownEnd);
    // Real-player compact cards do not change the fictional acceptance surface.
    const compactStart = source.indexOf("    // Real-player compact cards keep quantitative evidence in a native disclosure.");
    const compactEnd = source.indexOf('    $("results").append(card);', compactStart);
    if (compactStart < 0 || compactEnd <= compactStart)
      throw new Error("Unexpected compact real-card boundary");
    source = source.slice(0, compactStart) + source.slice(compactEnd);
    // Fictional previews retain their own footer copy; the real-only override
    // is unreachable. Keep the strict synthetic HTML budget without changing
    // real releases or the shared keyboard-navigation behavior.
    const realFooterStart = '  if (!syntheticCatalog) document.querySelector(".footer-note").textContent =';
    const realFooterEnd = '  document.querySelector("#bridge-lab .eyebrow").textContent =';
    const footerStart = source.indexOf(realFooterStart);
    const footerEnd = source.indexOf(realFooterEnd, footerStart);
    if (source.split(realFooterStart).length !== 2 || source.split(realFooterEnd).length !== 2 ||
        footerStart < 0 || footerEnd <= footerStart)
      throw new Error("Unexpected real-only footer boundary");
    source = source.slice(0, footerStart) + source.slice(footerEnd);
  }
  if (path === "src/demo.js") {
    if (effectiveSnapshot.kind === "synthetic") {
      // The fictional preview has no recorded external storefront links.
      // Keep the audited runtime call inert and retain the stricter <95 kB
      // self-contained HTML budget rather than weakening the size gate.
      const start = source.indexOf("// A pasted official storefront URL");
      const end = source.indexOf("export const BY_ID =", start);
      if (start < 0 || end <= start) throw new Error("Unexpected storefront lookup boundary");
      source = source.slice(0, start) +
        "function matchesRecordedStorefrontUrl() { return false; }\n" +
        source.slice(end);
    }
    const slot = "const BUILD_CATALOG_SNAPSHOT = null;";
    if (source.split(slot).length !== 2) throw new Error("Expected exactly one catalog build slot");
    if (selectedSnapshot !== null) {
      source = source.replace(slot, () => `const BUILD_CATALOG_SNAPSHOT = ${inlineJSON(selectedSnapshot)};`);
      // Selected publication snapshots must not also ship the fictional authoring
      // fixture in a dead JavaScript branch. Keep it in the repository for tests.
      const start = source.indexOf("const profile = (id, name, description, mechanics, themes, platforms, coop) =>");
      const end = source.indexOf("// Both the default and selected snapshot take the same publication-validation", start);
      if (start < 0 || end <= start) throw new Error("Unexpected authored-fixture boundary");
      source = source.slice(0, start) + "const AUTHORED_CATALOG = [];\n" + source.slice(end);
    }
  }
  if (expectedImports[index]) {
    if (source.split(expectedImports[index]).length !== 2) throw new Error(`Unexpected import in ${path}`);
    source = source.replace(expectedImports[index], "");
  }
  source = source.replace(/^export /gm, "");
  // A static bundle does not need source-only whole-line comments.
  // Real JavaScript, inline comments and string literals remain unchanged.
  source = source.replace(/^[ \t]*\/\/[^\r\n]*(?:\r?\n|$)/gm, "");
  // Preserve the sub-100 kB self-contained synthetic build without weakening
  // the payload test: remove only line indentation in the audited modules.
  // Refuse multiline template literals before changing generated source text.
  if (["src/ranking.js", "src/catalog.js", "src/bridge.js", "src/bridge-preview.js",
       "src/demo.js", "src/bridge-ui.js", "src/demo-ui.js"].includes(path)) {
    if (source.split(/\r?\n/).some((line) => ((line.match(/`/g) ?? []).length % 2) !== 0)) {
      throw new Error(`Cannot compact multiline template literals in ${path}`);
    }
    source = source.replace(/^[ \t]+(?=\S)/gm, "");
    // Join only explicit semicolon-terminated lines; preserve ASI-sensitive line breaks.
    // Keep the catalog projection's single JSON declaration on its own line,
    // where the existing source-bound validation can identify and inspect it.
    source = source.replace(/;\r?\n(?=[A-Za-z_$({])/g, (separator, offset, original) => {
      if (path !== "src/demo.js") return ";";
      const current = original.slice(original.lastIndexOf("\n", offset - 1) + 1, offset);
      const next = original.slice(offset + separator.length);
      return current.startsWith("const BUILD_CATALOG_SNAPSHOT = ") ||
        next.startsWith("const BUILD_CATALOG_SNAPSHOT = ") ? separator : ";";
    });
    // A comma requires continuation, and a semicolon already ends a statement.
    // Compact only their line breaks; retain one blank-line separator for ASI.
    source = source.replace(/,\r?\n/g, ",").replace(/;\r?\n(?=})/g, ";")
      .replace(/\n{2,}/g, "\n");
  }
  if (path === "src/bridge.js") {
    for (const name of ["assertCanonicalId", "assertUnitInterval", "comparePath", "compareState"]) {
      source = source.replace(new RegExp("\\b" + name + "\\b", "g"), "bridge" + name[0].toUpperCase() + name.slice(1));
    }
  }
  if (/^\s*(?:import|export)\s/m.test(source) || /<\/script/i.test(source)) {
    throw new Error(`Unsupported module structure in ${path}`);
  }
  parts.push(`// ${path}\n${source}`);
}
const revision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? "unpublished";
if (revision !== "unpublished" && !/^[0-9a-f]{40}$/.test(revision)) throw new Error("Invalid publication revision");
// Build one same-origin static worker asset from the exact same reviewed route
// source modules. There is no duplicated routing algorithm or runtime API.
const workerScript = `// playmancer-revision:${revision}\n` + [parts[2], parts[3], `
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ route: buildBridgePreview(data.input) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Unknown route error" });
  }
};
`].join("\n\n");
new Script(workerScript, { filename: "playmancer-bridge-worker.js" });
const script = parts.join("\n\n");
// Compile, never execute, the merged browser code before replacing an artifact.
// Individual modules can parse while conflicting declarations break their bundle.
new Script(script, { filename: "playmancer-browser-bundle.js" });
const entry = '<script type="application/x-playmancer-source" src="./src/demo-ui.js"></script>';
const sourceHtml = await readFile(join(root, "index.html"), "utf8");
const sourceStyles = sourceHtml.match(/<style>([\s\S]*?)<\/style>/);
if (!sourceStyles || sourceHtml.split(sourceStyles[0]).length !== 2) {
  throw new Error("Expected exactly one inline source stylesheet");
}
// Pin the complete stylesheet bytes, not only the first revision marker.
// A terminal digest catches a truncated or corrupted CDN response after 100 bytes.
const stylesheetBody = `/* playmancer-revision:${revision} */\n` + sourceStyles[1].replace(/\/\*[\s\S]*?\*\//g, "");
const stylesheet = sealStylesheet(stylesheetBody);
if (/<\/style/i.test(stylesheet) || /@import\b|url\s*\(/i.test(stylesheet)) {
  throw new Error("Stylesheet must not import other assets");
}
let template = sourceHtml.replace(sourceStyles[0], '<link rel="stylesheet" href="./player.css">');
if (effectiveSnapshot.kind === "synthetic") {
  const realOnlyRecovery = '<div id="search-recovery" hidden><button id="search-all-stores" type="button">Search all stores</button></div>';
  if (template.split(realOnlyRecovery).length !== 2)
    throw new Error("Unexpected real-only search recovery DOM boundary");
  template = template.replace(realOnlyRecovery, "");
  for (const fragment of ["<div id=\"store-scope\" class=\"hint\" hidden><span id=\"store-scope-label\"></span> <button id=\"store-scope-reset\" type=\"button\">Search all stores</button></div>", "<div id=\"browse-options\" hidden>", "<button id=\"browse-close\" type=\"button\">Close browse options</button></div>"]) {
    if (template.split(fragment).length !== 2) throw new Error("Unexpected real-only browse DOM boundary");
    template = template.replace(fragment, "");
  }
}
const sourceNotice = "<div id=\"unbuilt-source-notice\" class=\"notice\" role=\"alert\" tabindex=\"-1\" style=\"max-width:42rem;margin:2rem auto\"><strong>Player temporarily unavailable.</strong> This page is an unbuilt repository source template, not a verified Playmancer release. <p>To play locally, open <a href=\"https://github.com/drevendev/Playmancer/actions/workflows/pages.yml\">master Pages runs</a>, choose a run where <strong>Verify and package exact master</strong> passed, and download its <code>playmancer-player-[SHA]</code> ZIP artifact (GitHub sign-in may be required). Follow the <a href=\"https://github.com/drevendev/Playmancer#when-pages-is-unavailable-run-the-verified-player-locally\">local player instructions</a> to serve it over HTTP. This does not mean the public site is live.</p></div>";
const sourceWrap = '<div class="wrap" hidden>';
const sourceSkip = '<a class="skip" href="#unbuilt-source-notice">Skip to release status</a>';
const builtSkip = '<a class="skip" href="#recommendations">Skip to recommendations</a>';
if (template.split(sourceSkip).length !== 2) throw new Error("Expected exactly one source-only status skip link");
if (template.split(sourceNotice).length !== 2 || template.split(sourceWrap).length !== 2)
  throw new Error("Expected exactly one inert unbuilt-source fallback and hidden source player");
if (template.split(entry).length !== 2) throw new Error("Expected exactly one demo entry point");
if (template.split("</head>").length !== 2) throw new Error("Expected exactly one document head");
const escapeAttribute = value => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = template.replace(sourceSkip, builtSkip).replace(sourceNotice, "").replace(sourceWrap, '<div class="wrap">')
  .replace(entry, () => `<script type="module">\n${script}\n</script>`)
  .replace("</head>", () => `<meta name="playmancer-revision" content="${revision}">\n<meta name="playmancer-catalog" content="${escapeAttribute(effectiveSnapshot.snapshotId)}">\n</head>`);
await mkdir(output, { recursive: true });
const temporary = join(output, `.index.html.${process.pid}.tmp`);
const temporaryWorker = join(output, `.bridge-worker.js.${process.pid}.tmp`);
const temporaryStyles = join(output, `.player.css.${process.pid}.tmp`);
try {
  await writeFile(temporary, html);
  await writeFile(temporaryWorker, workerScript);
  await writeFile(temporaryStyles, stylesheet);
  await writeFile(join(output, ".nojekyll"), "");
  // Publish the worker first so every newly published index can load its route code.
  await rename(temporaryStyles, join(output, "player.css"));
  await rename(temporaryWorker, join(output, "bridge-worker.js"));
  await rename(temporary, join(output, "index.html"));
} finally {
  await rm(temporary, { force: true });
  await rm(temporaryWorker, { force: true });
  await rm(temporaryStyles, { force: true });
}
console.log(`Built ${Buffer.byteLength(html)} HTML bytes, ${Buffer.byteLength(stylesheet)} CSS bytes and ${Buffer.byteLength(workerScript)} worker bytes into ${output}`);
