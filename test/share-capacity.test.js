import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(join(root, 'examples/catalog.alternative.synthetic.json'), 'utf8'));

test('250-profile exclusion links round-trip with/without Bridge and preserve hard constraints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-share-capacity-'));
  try {
    const snapshot = structuredClone(fixture);
    snapshot.snapshotId = 'synthetic-share-capacity-250';
    snapshot.games = Array.from({ length: 250 }, (_, index) => ({
      ...fixture.games[index % fixture.games.length],
      id: 'capacity:g' + String(index).padStart(3, '0'),
      name: 'Synthetic Capacity ' + index,
      kind: 'game', aliases: [], externalIds: [], parentId: null,
      sourceId: fixture.sources[0].id,
    }));
    const path = join(dir, 'snapshot.json');
    writeFileSync(path, JSON.stringify(snapshot));
    const built = spawnSync(process.execPath,
      [join(root, 'scripts/build-demo.mjs'), join(dir, 'site'), '--catalog', path],
      { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
    const match = html.match(/<script type="module">\n([\s\S]*?)\n<\/script>/);
    assert.ok(match, 'the production builder must include its inline module');
    const marker = '// src/bridge-ui.js';
    assert.ok(match[1].includes(marker), 'the production bundle must preserve the module boundary');

    const checks = [
      "const __capacitySeeds = CATALOG.slice(0,2).map((game,i)=>({id:game.id,weight:i+1}));",
      "const __excluded = CATALOG.slice(2).map(game=>game.id);",
      "const __full = {...initialState(),seeds:__capacitySeeds,excluded:__excluded,mode:'blend',lambda:0.7,platform:'windows',coopOnly:true,bridge:{version:BRIDGE_STATE_VERSION,method:BRIDGE_ROUTE_METHOD_VERSION,startId:__capacitySeeds[0].id,endId:__capacitySeeds[1].id,maxHops:4,minSimilarity:0.31}};",
      "const __plain = {...__full}; delete __plain.bridge;",
      "const __round = (state) => JSON.stringify(decodeState(encodeState(state))) === JSON.stringify(validateState(state));",
      "const __hash = encodeState(__full);",
      "const __plainHash = encodeState(__plain);",
      "let __oversized=false,__malformed=false,__outdated=false;",
      "try { decodeState('#basket='+'x'.repeat(MAX_BASKET_LINK_LENGTH+1)); } catch(e) { __oversized=/oversized/.test(e.message); }",
      "try { decodeState('#basket=%Q'); } catch(e) { __malformed=/malformed/.test(e.message); }",
      "try { decodeState('#basket='+encodeURIComponent(JSON.stringify({...__full,method:'old'}))); } catch(e) { __outdated=/unavailable catalog/.test(e.message); }",
      "const __restored=decodeState(__hash);",
      "globalThis.__shareCheck={count:CATALOG.length,exclusions:__restored.excluded.length,hashLength:__hash.length,plainLength:__plainHash.length,max:MAX_BASKET_LINK_LENGTH,withBridge:__round(__full),withoutBridge:__round(__plain),defaultState:__round(initialState()),oversized:__oversized,malformed:__malformed,outdated:__outdated,weights:__restored.seeds.map(s=>s.weight).join(','),ids:__restored.seeds.map(s=>s.id).join(','),mode:__restored.mode,platform:__restored.platform,coop:__restored.coopOnly,lambda:__restored.lambda,bridgeHops:__restored.bridge.maxHops,bridgeThreshold:__restored.bridge.minSimilarity,catalog:__restored.catalog};"
    ].join('\n');
    const context = {};
    new Script(match[1].split(marker)[0] + '\n' + checks, {
      filename: 'capacity-share-compiled.js',
    }).runInNewContext(context);
    const result = context.__shareCheck;
    assert.equal(result.count, 250);
    assert.equal(result.exclusions, 248);
    assert.ok(result.hashLength > 6000 && result.plainLength > 6000,
      'the fixture must reproduce the old hardcoded 6000-character rejection');
    assert.ok(result.hashLength <= result.max);
    assert.ok(result.withBridge && result.withoutBridge && result.defaultState,
      'both capacity-sized links and an ordinary link must round-trip exactly');
    assert.ok(result.oversized && result.malformed && result.outdated,
      'hostile/malformed/stale links must still be rejected');
    assert.equal(result.weights, '1,2');
    assert.equal(result.ids, 'capacity:g000,capacity:g001');
    assert.equal(result.mode, 'blend');
    assert.equal(result.platform, 'windows');
    assert.equal(result.coop, true);
    assert.equal(result.lambda, 0.7);
    assert.equal(result.bridgeHops, 4);
    assert.equal(result.bridgeThreshold, 0.31);
    assert.equal(result.catalog, snapshot.snapshotId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
