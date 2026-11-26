#!/usr/bin/env node
// Offline projection of reviewed factual identifiers and links, not a scraper.
// The original Steam importer and historical snapshots remain unchanged.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCatalogSnapshot } from "../src/catalog.js";

const fields = ["id", "kind", "name", "sourceId", "externalIds", "storeLinks"];
const rightsBasis = "factual-identifiers-and-links-only";
const cc0 = "https://www.wikidata.org/wiki/Wikidata:Licensing";
const titleKey = name => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const qidOK = id => typeof id === "string" && /^Q[1-9][0-9]*$/.test(id);
function record(value, keys, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw new Error("Unexpected " + label + " fields");
}
function dateOK(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function httpsReference(value) {
  if (typeof value !== "string") throw new Error("Missing identity evidence");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.hash || url.href !== value) throw new Error("Noncanonical evidence URL");
  return value;
}
function identityOf(identity) {
  record(identity, ["provider", "id", "reference", "redirectQids"], "identity");
  if (!Array.isArray(identity.redirectQids) || new Set(identity.redirectQids).size !== identity.redirectQids.length ||
      identity.redirectQids.some(id => !qidOK(id) || id === identity.id))
    throw new Error("Invalid identity redirects");
  if (identity.provider === "wikidata" && qidOK(identity.id) &&
      identity.reference === "https://www.wikidata.org/wiki/" + identity.id)
    return "wikidata:" + identity.id.toLowerCase();
  // Developer-project identity is useful for independently released games
  // without a reviewed structured-data item. Never invent an external QID.
  if (identity.provider === "github" && typeof identity.id === "string" &&
      /^[a-z0-9-]+\/[a-z0-9-]+$/.test(identity.id) &&
      identity.reference.toLowerCase() === "https://github.com/" + identity.id &&
      identity.redirectQids.length === 0)
    return "github:" + identity.id.replace("/", ".");
  throw new Error("Invalid canonical identity receipt");
}
function canonicalStore(entry) {
  record(entry, ["store", "id", "url"], "store receipt");
  if (typeof entry.id !== "string" || typeof entry.url !== "string")
    throw new Error("Missing store identifier or URL");
  let expected;
  if (entry.store === "steam" && /^[1-9][0-9]*$/.test(entry.id))
    expected = "https://store.steampowered.com/app/" + entry.id;
  else if (entry.store === "googleplay" && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(entry.id))
    expected = "https://play.google.com/store/apps/details?id=" + entry.id;
  else if (entry.store === "itch" && /^[a-z0-9-]+\.itch\.io\/[a-z0-9][a-z0-9-]*$/.test(entry.id))
    expected = "https://" + entry.id;
  if (!expected || entry.url !== expected) throw new Error("Noncanonical store receipt");
  return entry;
}

export function appendReviewedMixedStore(base, batch) {
  const validated = validateCatalogSnapshot(base, { requirePublishable: true });
  if (validated.kind !== "real") throw new Error("Expected a real base snapshot");
  record(batch, ["schemaVersion", "snapshotId", "reviewedAt", "rightsBasis", "games"], "batch");
  if (batch.schemaVersion !== 1 || typeof batch.snapshotId !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(batch.snapshotId) || batch.snapshotId === validated.snapshotId ||
      !dateOK(batch.reviewedAt) || batch.rightsBasis !== rightsBasis ||
      !Array.isArray(batch.games) || !batch.games.length ||
      validated.games.length + batch.games.length > 2000)
    throw new Error("Invalid mixed-store batch version, date, rights or size");
  const names = new Set(validated.games.flatMap(game => [game.name, ...game.aliases]).map(titleKey));
  const additions = [];
  for (const row of batch.games) {
    record(row, ["identity", "name", "reviewedBaseGame", "releaseEvidence", "stores"], "game receipt");
    if (row.reviewedBaseGame !== true || typeof row.name !== "string" ||
        !row.name.trim() || row.name !== row.name.trim() ||
        !Array.isArray(row.stores) || !row.stores.length || row.stores.length > 3)
      throw new Error("Unreviewed or invalid base game");
    const id = identityOf(row.identity);
    const release = httpsReference(row.releaseEvidence);
    if (names.has(titleKey(row.name))) throw new Error("Ambiguous title or alias: " + row.name);
    names.add(titleKey(row.name));
    const stores = row.stores.map(canonicalStore).sort((a, b) => compare(a.store, b.store));
    if (new Set(stores.map(store => store.store)).size !== stores.length)
      throw new Error("Duplicate store receipt");
    const redirects = [...row.identity.redirectQids].sort(compare);
    const externalIds = [
      { provider: row.identity.provider, id: row.identity.id },
      ...redirects.map(id => ({ provider: "wikidata", id })),
      ...stores.map(({store, id}) => ({provider: store, id}))
    ];
    const sourceId = "reviewed-mixed-" + batch.snapshotId + "-" + id.replace(":", "-");
    const attribution = [
      "Identity/title: " + row.identity.reference + (row.identity.provider === "wikidata" ? " (Wikidata CC0)" : " (developer project)"),
      ...redirects.map(qid => "Reviewed redirect: https://www.wikidata.org/wiki/" + qid),
      "Base-game release: " + release,
      ...stores.map(store => store.store + " identifier/link: " + store.url),
      "Reviewed " + batch.reviewedAt + "; factual identifiers and links only; no store content rights claimed."
    ].join("; ");
    additions.push({
      source: { id: sourceId, kind: "licensed", attribution,
        rights: { status: "approved", reference: row.identity.provider === "wikidata" ? cc0 : release, fields } },
      game: { id, kind: "game", name: row.name, description: null, aliases: [], externalIds,
        sourceId, parentId: null, mechanics: null, themes: null, platforms: null, coop: null,
        storeLinks: stores.map(({store, url}) => ({store, url})) }
    });
  }
  additions.sort((a, b) => compare(a.game.id, b.game.id));
  return validateCatalogSnapshot({
    schemaVersion: 1, snapshotId: batch.snapshotId, kind: "real",
    sources: [...validated.sources, ...additions.map(item => item.source)],
    games: [...validated.games, ...additions.map(item => item.game)]
  }, { requirePublishable: true });
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length !== 3 || paths.some(path => path.startsWith("-")))
    throw new Error("Usage: node scripts/import-reviewed-mixed.mjs BASE.json BATCH.json NEW.json");
  const [base, batch] = await Promise.all(paths.slice(0, 2).map(async path =>
    JSON.parse(await readFile(path, "utf8"))));
  const result = appendReviewedMixedStore(base, batch);
  await writeFile(paths[2], JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({snapshotId: result.snapshotId, added: batch.games.length,
    games: result.games.length, linkedBaseGames: result.games.filter(game =>
      game.kind === "game" && game.storeLinks.length).length,
    scope: "RECORDED_REVIEW_ONLY_NOT_LIVE_VERIFICATION"}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
