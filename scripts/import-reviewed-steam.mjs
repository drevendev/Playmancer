#!/usr/bin/env node
// Offline projection of reviewed receipts, not a scraper or a storefront verifier.
// Usage: node scripts/import-reviewed-steam.mjs BASE.json BATCH.json NEW.json
// Keep the reviewed batch in version control alongside its resulting snapshot.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCatalogSnapshot } from "../src/catalog.js";

const fields = ["id", "kind", "name", "sourceId", "themes", "externalIds", "storeLinks"];
const dateOK = value => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const titleKey = name => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
function record(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key)))
    throw new Error("Unexpected " + label + " fields");
}

export function appendReviewedSteam(base, batch) {
  const validated = validateCatalogSnapshot(base, { requirePublishable: true });
  if (validated.kind !== "real") throw new Error("Expected a real base snapshot");
  record(batch, ["schemaVersion", "snapshotId", "reviewedAt", "games"], "batch");
  if (batch.schemaVersion !== 1 ||
      typeof batch.snapshotId !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(batch.snapshotId) ||
      batch.snapshotId === validated.snapshotId || !dateOK(batch.reviewedAt) ||
      !Array.isArray(batch.games) || !batch.games.length || batch.games.length > 2000)
    throw new Error("Invalid reviewed batch version, date or size");
  const sourceId = "wikidata-cc0-" + batch.snapshotId;
  const names = new Set(validated.games.flatMap(game => [game.name, ...game.aliases]).map(titleKey));
  const additions = [];
  for (const row of batch.games) {
    record(row, ["qid", "name", "steamAppId", "storeUrl", "reviewedBaseGame", "genres"], "receipt");
    if (typeof row.qid !== "string" || !/^Q[1-9][0-9]*$/.test(row.qid) ||
        typeof row.steamAppId !== "string" || !/^[1-9][0-9]*$/.test(row.steamAppId) ||
        row.storeUrl !== "https://store.steampowered.com/app/" + row.steamAppId ||
        row.reviewedBaseGame !== true || typeof row.name !== "string" ||
        !row.name.trim() || row.name !== row.name.trim() ||
        (row.genres !== null && (!Array.isArray(row.genres) || !row.genres.length)))
      throw new Error("Unreviewed or invalid base-game receipt");
    const key = titleKey(row.name);
    if (names.has(key)) throw new Error("Ambiguous title or alias: " + row.name);
    names.add(key);
    additions.push({
      id: "wikidata:" + row.qid.toLowerCase(), kind: "game", name: row.name,
      description: null, aliases: [],
      externalIds: [{ provider: "wikidata", id: row.qid }, { provider: "steam", id: row.steamAppId }],
      sourceId, parentId: null, mechanics: null, themes: row.genres,
      platforms: null, coop: null, storeLinks: [{ store: "steam", url: row.storeUrl }]
    });
  }
  // Stable source-independent order; the original snapshot prefix is untouched.
  additions.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const result = {
    schemaVersion: 1, snapshotId: batch.snapshotId, kind: "real",
    sources: [...validated.sources, {
      id: sourceId, kind: "licensed",
      attribution: "Wikidata contributors (CC0 identity and P136 genres); Steam base-game link receipts: " +
        batch.snapshotId + ", reviewed " + batch.reviewedAt,
      rights: { status: "approved", reference: "https://www.wikidata.org/wiki/Wikidata:Licensing", fields }
    }],
    games: [...validated.games, ...additions]
  };
  // Reject global canonical-ID, external-ID, storefront, source and feature collisions.
  // Return normalized records, never arbitrary unreviewed input properties.
  return validateCatalogSnapshot(result, { requirePublishable: true });
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length !== 3 || paths.some(path => path.startsWith("-")))
    throw new Error("Usage: node scripts/import-reviewed-steam.mjs BASE.json BATCH.json NEW.json");
  const [base, batch] = await Promise.all(paths.slice(0, 2).map(async path =>
    JSON.parse(await readFile(path, "utf8"))));
  const result = appendReviewedSteam(base, batch);
  // Do not overwrite an immutable snapshot or either input, even on reruns.
  await writeFile(paths[2], JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ snapshotId: result.snapshotId, added: batch.games.length,
    games: result.games.length, linkedBaseGames: result.games.filter(game =>
      game.kind === "game" && game.storeLinks.length).length,
    scope: "RECORDED_REVIEW_ONLY_NOT_LIVE_VERIFICATION" }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
