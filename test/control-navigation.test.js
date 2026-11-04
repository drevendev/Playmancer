import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const text = path => readFileSync(new URL(path, root), 'utf8');
const snapshot = () => ({
  state: text('control/STATE_AND_QUEUE.md'), index: text('control/INDEX.md'),
  order: text('control/EXECUTION_ORDER.md'), registry: text('control/UNIT_REGISTRY.csv'),
  history: text('control/CHANGELOG.md'), roadmap: text('docs/ROADMAP.md'),
});
const field = (body, key) => {
  const matches = [...body.matchAll(new RegExp('^' + key + ':\\s*(.+)$', 'gm'))];
  assert.equal(matches.length, 1, `one ${key} field`);
  return matches[0][1].trim();
};
function validateNavigation(s) {
  const revision = Number(field(s.state, 'STATE_REVISION'));
  assert.ok(Number.isInteger(revision) && revision >= 15);
  assert.equal(Number(field(s.state, 'LAST_INDEXED_REVISION')), revision);
  assert.equal(Number(s.index.match(/indexed state revision: \*\*(\d+)\*\*/i)?.[1]), revision);
  const revisions = [...s.history.matchAll(/^\d{4}-\d{2}-\d{2} \| rev (\d+) \|/gm)].map(m => Number(m[1]));
  assert.equal(revisions.at(-1), revision);
  assert.ok(revisions.every((r, i) => i === 0 || r > revisions[i - 1]));
  assert.equal(field(s.state, 'CONTROL_FORMAT_VERSION'), '2');
  assert.equal(field(s.state, 'CURRENT_UNIT'), 'none');
  assert.equal(field(s.state, 'WORKING_BRANCH'), 'none');
  assert.equal(field(s.state, 'CURRENT_UNIT_STATUS'), 'DISCOVER');
  assert.equal(field(s.state, 'WORKER_SCHEDULE_MUTATION'), 'none');
  assert.match(field(s.state, 'REFERENCE_MASTER'), /^[a-f0-9]{40}$/);
  const [header, ...lines] = s.registry.trim().split('\n');
  assert.equal(header, 'UNIT_ID,AREA,FILE,ANCHOR,STATEMENT,TYPE,PRIORITY,STATUS,DEPENDS_ON,ACCEPTANCE');
  const rows = lines.map(line => line.split(','));
  assert.ok(rows.every(row => row.length === 10), 'well-formed simple registry CSV');
  const ids = new Set(rows.map(row => row[0]));
  assert.equal(ids.size, rows.length, 'unique permanent unit IDs');
  const original = ['SETUP-REPO-001','PLAY-PREVIEW-001','PLAY-EVALUATION-001',
    'PLAY-RECOVERY-002','PLAY-BRIDGE-001','PLAY-CATALOG-001','PLAY-CONTROL-001'];
  for (const id of original) {
    const row = rows.find(row => row[0] === id);
    assert.ok(row, `preserved ${id}`); assert.equal(row[7], 'DONE', `historically delivered ${id}`);
  }
  assert.ok(rows.every(row => !row[8] || (ids.has(row[8]) && row[8] !== row[0])), 'valid registry dependencies');
  assert.match(s.order, /ALL open PRs/);
  assert.match(s.order, /Missing\/skipped\/pending is not PASS/);
  assert.match(s.roadmap, /#76/); assert.match(s.roadmap, /#1\b/);
  for (const body of [s.state, s.index, s.order, s.roadmap]) {
    assert.doesNotMatch(body, /has_pages=false|PR #22 OPEN|The only open PR at reconciliation is #22/);
  }
}

test('cold-start controls have coherent counters, historical units and native discovery', () => validateNavigation(snapshot()));
test('control history through revision 14 is preserved byte-for-byte', () => {
  const raw = Buffer.from(snapshot().history).subarray(0, 3518);
  const sha = createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
  assert.equal(sha, '38a3e0ee0181bf414c7e78e32c72cd8e2cdc2d96');
});
for (const [name, change] of [
  ['stale index', s => { s.index = s.index.replace(/(indexed state revision: \*\*)\d+/i, '$10'); }],
  ['unindexed revision', s => { s.state = s.state.replace(/^LAST_INDEXED_REVISION:\s*\d+/m, 'LAST_INDEXED_REVISION:   0'); }],
  ['persistent branch claim', s => { s.state = s.state.replace(/^WORKING_BRANCH:\s*none/m, 'WORKING_BRANCH:          stale/branch'); }],
  ['resurrected delivered unit', s => { s.registry = s.registry.replace('documentation,P1,DONE', 'documentation,P1,REVIEW'); }],
  ['duplicate permanent ID', s => { s.registry += s.registry.split('\n')[1] + '\n'; }],
  ['unknown dependency', s => { s.registry = s.registry.replace('P0,DONE,SETUP-REPO-001,', 'P0,DONE,MISSING-001,'); }],
  ['stale Pages gate', s => { s.roadmap += '\nRepository reports has_pages=false\n'; }],
  ['schedule mutation', s => { s.state = s.state.replace(/^WORKER_SCHEDULE_MUTATION:\s*none/m, 'WORKER_SCHEDULE_MUTATION: pause'); }],
]) test(`navigation guard rejects ${name}`, () => {
  const s = snapshot(); change(s); assert.throws(() => validateNavigation(s));
});
