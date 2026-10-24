import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateCatalogSnapshot, resolveCatalogIdentity, catalogCoverage } from '../src/catalog.js';
import { DEMO_SNAPSHOT, CATALOG } from '../src/demo.js';
const copy = () => structuredClone(DEMO_SNAPSHOT);
const game = (id, kind = 'game', parentId = null) => ({ ...copy().games[0], id, name: 'Same title', kind, parentId, aliases: [], externalIds: [] });
const fixture = () => ({ ...copy(), games: [game('test:base'), game('test:edition','edition','test:base'),
  game('test:dlc','dlc','test:base'), game('test:remake','remake','test:base')] });

test('the actual player catalog passes the publication gate without fabricated coverage', () => {
  const valid = validateCatalogSnapshot(DEMO_SNAPSHOT, { requirePublishable: true });
  assert.equal(valid.games.length, 12); assert.equal(valid.kind, 'synthetic');
  assert.deepEqual(valid.games.map(g => g.id), CATALOG.map(g => g.id));
  assert.deepEqual(catalogCoverage(valid), { mechanics: { known:10,total:12 }, themes: { known:11,total:12 },
    platforms: { known:10,total:12 }, coop: { known:9,total:12 } });
});
test('editions DLC and remakes retain distinct identities; display names do not resolve automatically', () => {
  const input = fixture(); const valid = validateCatalogSnapshot(input);
  assert.equal(valid.games.length, 4); assert.equal(resolveCatalogIdentity(valid, 'Same title'), null);
  for (const item of input.games) assert.equal(resolveCatalogIdentity(valid, item.id), item.id);
});
test('explicit aliases resolve without changing the entity kind', () => {
  const input = fixture(); input.games[1].aliases = ['Deluxe alias'];
  assert.equal(resolveCatalogIdentity(input, 'DELUXE ALIAS'), 'test:edition');
});
test('unknown snapshot schemas and kinds are rejected', () => {
  assert.throws(() => validateCatalogSnapshot({ ...copy(), schemaVersion: 99 }), /schemaVersion/);
  assert.throws(() => validateCatalogSnapshot({ ...copy(), kind: 'mixed' }), /catalog kind/);
});
test('empty or missing catalogs and sources are not publishable', () => {
  for (const patch of [{ games: [] }, { sources: [] }, { games: null }]) assert.throws(() => validateCatalogSnapshot({ ...copy(), ...patch }));
});
test('canonical ID collisions and malformed IDs fail closed', () => {
  const input = fixture(); input.games[1].id = input.games[0].id;
  assert.throws(() => validateCatalogSnapshot(input), /Duplicate game ID/);
  for (const id of ['', 'name only', 'test:A', ' test:a']) assert.throws(() => validateCatalogSnapshot({ ...fixture(), games: [game(id)] }));
});
test('case and Unicode equivalent aliases cannot select different games', () => {
  for (const pair of [['Alias','ALIAS'], ['café','cafe\u0301']]) {
    const input = fixture(); input.games[0].aliases=[pair[0]];input.games[1].aliases=[pair[1]];
    assert.throws(() => validateCatalogSnapshot(input), /Ambiguous alias/);
  }
});
test('an alias cannot shadow a canonical ID', () => {
  const input = fixture(); input.games[1].aliases=['test:base'];
  assert.throws(() => validateCatalogSnapshot(input), /Ambiguous alias/);
});
test('external IDs are namespaced but cannot collide within a provider', () => {
  const input = fixture();input.games[0].externalIds=[{provider:'store-a',id:'123'}];
  input.games[1].externalIds=[{provider:'store-b',id:'123'}];
  assert.doesNotThrow(() => validateCatalogSnapshot(input));
  input.games[1].externalIds[0].provider='store-a';assert.throws(() => validateCatalogSnapshot(input), /External ID collision/);
});
test('invalid or unknown parent relations are rejected', () => {
  for (const parentId of [null, 'test:missing', 'test:edition']) {
    const input=fixture();input.games[1].parentId=parentId;assert.throws(() => validateCatalogSnapshot(input));
  }
  const input=fixture();input.games[0].parentId='test:remake';assert.throws(() => validateCatalogSnapshot(input), /Base game/);
});
test('relation cycles are rejected rather than collapsed', () => {
  const input={...fixture(),games:[game('test:a','remake','test:b'),game('test:b','remake','test:a')]};
  assert.throws(() => validateCatalogSnapshot(input), /relation cycle/);
});
test('editions cannot silently become parents of DLC', () => {
  const input=fixture();input.games[2].parentId='test:edition';assert.throws(() => validateCatalogSnapshot(input), /Parent must/);
});
test('missing metadata remains null; an explicit empty array remains known empty', () => {
  const input=fixture();delete input.games[0].mechanics;input.games[0].themes=[];input.games[0].coop=null;
  const valid=validateCatalogSnapshot(input);assert.equal(valid.games[0].mechanics,null);assert.deepEqual(valid.games[0].themes,[]);assert.equal(valid.games[0].coop,null);
});
test('metadata types and duplicate tags are rejected rather than coerced', () => {
  for(const patch of [{coop:'yes'},{platforms:'linux'},{themes:['x','x']},{mechanics:[1]}]) {
    const input=fixture();Object.assign(input.games[0],patch);assert.throws(() => validateCatalogSnapshot(input));
  }
});
test('unknown and duplicate sources are rejected', () => {
  const input=fixture();input.games[0].sourceId='missing';assert.throws(() => validateCatalogSnapshot(input), /Unknown source/);
  const duplicate=fixture();duplicate.sources.push(duplicate.sources[0]);assert.throws(() => validateCatalogSnapshot(duplicate), /Duplicate source/);
});
test('real-source rights cannot be inferred from API availability or synthetic labeling', () => {
  const input=fixture();input.kind='real';assert.throws(() => validateCatalogSnapshot(input), /synthetic source rights/);
  input.sources[0].kind='licensed';input.sources[0].rights.status='unreviewed';
  assert.doesNotThrow(() => validateCatalogSnapshot(input));
  assert.throws(() => validateCatalogSnapshot(input,{requirePublishable:true}), /rights not approved/);
  input.sources[0].rights.status='denied';assert.throws(() => validateCatalogSnapshot(input,{requirePublishable:true}), /rights not approved/);
});
test('publication requires a recorded rights reference and field-level allowlist', () => {
  const input=fixture();input.kind='real';input.sources[0].kind='licensed';input.sources[0].rights.status='approved';
  assert.doesNotThrow(() => validateCatalogSnapshot(input,{requirePublishable:true}));
  input.sources[0].rights.fields=input.sources[0].rights.fields.filter(x=>x!=='description');
  assert.throws(() => validateCatalogSnapshot(input,{requirePublishable:true}), /Field not cleared/);
  input.sources[0].rights.reference='';assert.throws(() => validateCatalogSnapshot(input), /rights reference/);
});
test('public projection removes unrecognized assets and private extra fields', () => {
  const input=fixture();input.privateNote='internal';input.games[0].image='https://example.invalid/unlicensed.png';input.games[0].privateNote='internal';
  const valid=validateCatalogSnapshot(input,{requirePublishable:true});
  assert.equal(valid.privateNote,undefined);assert.equal(valid.games[0].image,undefined);assert.equal(valid.games[0].privateNote,undefined);
});
test('normalized snapshots are detached immutable JSON and round-trip exactly', () => {
  const input=fixture();const before=structuredClone(input);const valid=validateCatalogSnapshot(input);
  assert.deepEqual(input,before);input.games[0].mechanics.push('new');
  assert.ok(!valid.games[0].mechanics.includes('new'));assert.ok(Object.isFrozen(valid.games[0].mechanics));
  assert.deepEqual(validateCatalogSnapshot(JSON.parse(JSON.stringify(valid))),valid);
});
test('catalog CLI reports only validation facts and rejects unreviewed publication', () => {
  const dir=mkdtempSync(join(tmpdir(),'playmancer-catalog-'));
  try {
    const file=join(dir,'catalog.json'), cli=new URL('../scripts/validate-catalog.mjs',import.meta.url).pathname;
    const input=fixture();input.kind='real';input.sources[0].kind='licensed';input.sources[0].rights.status='unreviewed';writeFileSync(file,JSON.stringify(input));
    let out=spawnSync(process.execPath,[cli,file],{encoding:'utf8'});assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).publication_gate_checked,false);
    out=spawnSync(process.execPath,[cli,file,'--publishable'],{encoding:'utf8'});assert.equal(out.status,1);assert.equal(out.stdout,'');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('catalog CLI supports the publication flag without a file and rejects unknown flags', () => {
  const cli = new URL('../scripts/validate-catalog.mjs', import.meta.url).pathname;
  const good = spawnSync(process.execPath, [cli, '--publishable'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).publication_gate_checked, true);
  for (const args of [['--unknown'], ['--publishable', '--publishable']]) {
    const bad = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(bad.status, 1); assert.equal(bad.stdout, ''); assert.match(bad.stderr, /Usage:/);
  }
});

test('a licensed identifiers-only catalog can publish without inventing description or feature coverage', () => {
  const input = fixture();
  input.kind = 'real';
  input.sources[0].kind = 'licensed';
  input.sources[0].rights.status = 'approved';
  input.sources[0].rights.fields = ['id', 'kind', 'name', 'sourceId'];
  input.games = [{ id: 'real:only-id', kind: 'game', name: 'Known title', sourceId: input.sources[0].id }];
  const validated = validateCatalogSnapshot(input, { requirePublishable: true });
  assert.equal(validated.games[0].description, null);
  for (const key of ['mechanics', 'themes', 'platforms', 'coop', 'parentId']) {
    assert.equal(validated.games[0][key], null);
  }
  assert.deepEqual(validated.games[0].aliases, []);
  assert.deepEqual(validated.games[0].externalIds, []);
  assert.deepEqual(catalogCoverage(validated).mechanics, { known: 0, total: 1 });
  assert.ok(Object.isFrozen(validated.games[0]));
});
test('publication rejects uncleared observed fields even with otherwise approved identity', () => {
  const input = fixture();
  input.kind = 'real';
  input.sources[0].kind = 'licensed';
  input.sources[0].rights.status = 'approved';
  input.sources[0].rights.fields = ['id', 'kind', 'name', 'sourceId'];
  input.games = [{ id: 'real:base', kind: 'game', name: 'Known title', sourceId: input.sources[0].id }];
  const record = input.games[0];
  const assertUncleared = (field, value) => {
    record[field] = value;
    assert.throws(() => validateCatalogSnapshot(input, { requirePublishable: true }), new RegExp('Field not cleared.*' + field));
    delete record[field];
  };
  assertUncleared('description', 'Description with unapproved redistribution');
  assertUncleared('mechanics', []);
  assertUncleared('platforms', ['linux']);
  assertUncleared('coop', false);
  assertUncleared('aliases', ['Known alternative']);
  assertUncleared('externalIds', [{provider: 'store', id: '123'}]);
  input.sources[0].rights.fields = ['id', 'kind', 'sourceId'];
  assert.throws(() => validateCatalogSnapshot(input, { requirePublishable: true }), /Field not cleared.*name/);
});
test('explicit approval permits partial known-empty metadata without licensing a description', () => {
  const input = fixture();
  input.kind = 'real';
  input.sources[0].kind = 'licensed';
  input.sources[0].rights.status = 'approved';
  input.sources[0].rights.fields = ['id', 'kind', 'name', 'sourceId', 'mechanics'];
  input.games = [{ id: 'real:base', kind: 'game', name: 'Known title',
    sourceId: input.sources[0].id, mechanics: [] }];
  const validated = validateCatalogSnapshot(input, { requirePublishable: true });
  assert.deepEqual(validated.games[0].mechanics, []);
  assert.equal(validated.games[0].description, null);
  assert.deepEqual(catalogCoverage(validated).mechanics, { known: 1, total: 1 });
});


test('publication rejects inherited source rights, records and game identities', () => {
  const inheritedRights = fixture();
  inheritedRights.sources[0].rights = Object.create(inheritedRights.sources[0].rights);
  assert.throws(() => validateCatalogSnapshot(inheritedRights, { requirePublishable: true }), /plain JSON object/);

  const inheritedSource = fixture();
  inheritedSource.sources[0] = Object.create(inheritedSource.sources[0]);
  assert.throws(() => validateCatalogSnapshot(inheritedSource, { requirePublishable: true }), /plain JSON object/);

  const inheritedGame = fixture();
  inheritedGame.games[0] = Object.create(inheritedGame.games[0]);
  assert.throws(() => validateCatalogSnapshot(inheritedGame, { requirePublishable: true }), /plain JSON object/);

  const missingApproval = fixture();
  delete missingApproval.sources[0].rights.status;
  assert.throws(() => validateCatalogSnapshot(missingApproval, { requirePublishable: true }),
    /missing or inherited required fields/);
});

test('explicit null-prototype source rights and game records retain publication semantics', () => {
  const input = fixture();
  const expected = validateCatalogSnapshot(input, { requirePublishable: true });
  input.sources[0].rights = Object.assign(Object.create(null), input.sources[0].rights);
  input.games[0] = Object.assign(Object.create(null), input.games[0]);
  assert.deepEqual(validateCatalogSnapshot(input, { requirePublishable: true }), expected);
});
