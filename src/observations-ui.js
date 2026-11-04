import { compareObservations, searchObservations, encodeObservationState, decodeObservationState } from './observations.js';
const OBSERVATION_DATA = null;
const observationModel = OBSERVATION_DATA;
const observationElement = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const observationById = id => document.getElementById(id);
const observationBaseState = () => ({ version: observationModel.version, catalog: observationModel.catalog,
  evidence: observationModel.evidence, pair: [], query: '', tag: '' });
let observationState = observationBaseState();
function observationSource(fact, name) {
  const link = observationElement('a', `${name} · ${fact.publisher} · reviewed ${fact.reviewedOn}`);
  link.href = fact.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function observationFactList(facts, name) {
  const list = observationElement('ul', undefined, 'fact-list');
  for (const fact of facts) {
    const item = observationElement('li');
    item.append(observationElement('strong', fact.label), observationSource(fact, name));
    list.append(item);
  }
  if (!facts.length) list.append(observationElement('li', 'No observations recorded here. This does not prove absence.'));
  return list;
}
function drawObservationComparison() {
  const output = observationById('comparison'); output.replaceChildren();
  if (!observationState.pair.length) {
    output.append(observationElement('p', 'Choose two different games, or try the sample pair.'));
    return;
  }
  const pair = compareObservations(observationModel, ...observationState.pair);
  output.append(observationElement('h2', `${pair.left.name} and ${pair.right.name}`));
  output.append(observationElement('p', pair.status === 'unknown'
    ? 'At least one game has no reviewed observations. A comparison is incomplete, not a zero match.'
    : 'Both games have partial observations. Shared facts are not a similarity or quality score.', 'notice'));
  const shared = observationElement('section'); shared.append(observationElement('h3', 'Recorded in both games'));
  const list = observationElement('ul', undefined, 'fact-list');
  for (const fact of pair.shared) {
    const item = observationElement('li'); item.append(observationElement('strong', fact.label),
      observationSource(fact.left, pair.left.name), observationSource(fact.right, pair.right.name)); list.append(item);
  }
  if (!pair.shared.length) list.append(observationElement('li', 'No shared observations recorded. This does not prove the games have nothing in common.'));
  shared.append(list); output.append(shared);
  const columns = observationElement('div', undefined, 'fact-columns');
  for (const [game, facts] of [[pair.left, pair.leftRecorded], [pair.right, pair.rightRecorded]]) {
    const section = observationElement('section');
    section.append(observationElement('h3', `Recorded only for ${game.name} in this snapshot`),
      observationElement('p', 'Unreviewed for the other game, not a verified difference.', 'muted'), observationFactList(facts, game.name));
    columns.append(section);
  }
  output.append(columns);
}
function drawObservationResults() {
  const games = searchObservations(observationModel, observationState.query, observationState.tag);
  observationById('search-status').textContent = `${games.length} of ${observationModel.games.length} games shown. A fact filter shows recorded evidence, not proof that other games lack it.`;
  const results = observationById('observation-games'); results.replaceChildren();
  if (!games.length) results.append(observationElement('p', 'No recorded facts match this search. Try another word or clear the fact filter.'));
  for (const game of games) {
    const card = observationElement('article', undefined, 'game-card'); card.dataset.gameId = game.id;
    card.append(observationElement('h3', game.name), observationElement('p', game.coverage === 'unknown'
      ? 'No reviewed gameplay observations. Unrecorded is unknown, not absent.'
      : `${game.facts.length} selected observations · partial, not a complete feature list.`, 'muted'));
    const actions = observationElement('div', undefined, 'actions');
    for (const [index, side] of [[0, 'left'], [1, 'right']]) {
      const button = observationElement('button', `Compare on ${side}`); button.type = 'button';
      button.setAttribute('aria-label', `Compare ${game.name} on ${side}`);
      button.addEventListener('click', () => {
        observationById(side).value = game.id;
        const other = observationById(index === 0 ? 'right' : 'left');
        if (other.value === game.id) other.value = '';
        chooseObservationPair(); observationById(side).focus();
        observationById('action-status').textContent = `${game.name} selected on ${side}.`;
      }); actions.append(button);
    }
    card.append(actions);
    if (game.facts.length) {
      const details = observationElement('details'); details.append(observationElement('summary', `Inspect sources for ${game.name}`),
        observationFactList(game.facts, game.name)); card.append(details);
    }
    results.append(card);
  }
}
function saveObservationState() {
  observationById('link-error').hidden = true;
  observationById('share-box').hidden = true;
  observationById('share-url').value = '';
  try { history.replaceState(null, '', encodeObservationState(observationModel, observationState)); }
  catch { observationById('action-status').textContent = 'Automatic URL update is unavailable. Use Show comparison link to save this state.'; }
}
function chooseObservationPair() {
  const left = observationById('left').value, right = observationById('right').value;
  observationState.pair = left && right && left !== right ? [left, right] : [];
  saveObservationState(); drawObservationComparison();
  observationById('action-status').textContent = left && left === right ? 'Choose two different games.' : 'Comparison updated.';
}
function restoreObservationState() {
  observationById('link-error').hidden = true;
  try {
    observationState = location.hash ? decodeObservationState(observationModel, location.hash) : observationBaseState();
  } catch (error) {
    observationState = observationBaseState();
    observationById('link-error-message').textContent = `${error.message}. No games were substituted. Choose a pair or reset explicitly.`;
    observationById('link-error').hidden = false;
  }
  observationById('left').value = observationState.pair[0] ?? '';
  observationById('right').value = observationState.pair[1] ?? '';
  observationById('query').value = observationState.query;
  observationById('tag').value = observationState.tag;
  observationById('share-box').hidden = true;
  drawObservationComparison(); drawObservationResults();
  if (!observationById('link-error').hidden) observationById('link-error').focus();
}
for (const side of ['left', 'right']) {
  for (const game of observationModel.games) {
    const option = observationElement('option', game.name + (game.coverage === 'unknown' ? ' — observations unknown' : ''));
    option.value = game.id; observationById(side).append(option);
  }
  observationById(side).addEventListener('change', chooseObservationPair);
}
for (const tag of observationModel.tags) {
  const option = observationElement('option', tag.label); option.value = tag.id; observationById('tag').append(option);
}
observationById('coverage').textContent = `${observationModel.observedGames} of ${observationModel.games.length} games have selected observations; ${observationModel.factCount} dated facts. The remaining ${observationModel.games.length - observationModel.observedGames} games are unreviewed.`;
observationById('query').addEventListener('input', () => {
  observationState.query = observationById('query').value; saveObservationState(); drawObservationResults();
});
observationById('tag').addEventListener('change', () => {
  observationState.tag = observationById('tag').value; saveObservationState(); drawObservationResults();
});
observationById('sample').addEventListener('click', () => {
  observationById('left').value = 'wikidata:q16972008'; observationById('right').value = 'wikidata:q332697';
  chooseObservationPair(); observationById('comparison-title').focus();
});
observationById('reset').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname + location.search); restoreObservationState(); observationById('left').focus();
});
observationById('show-link').addEventListener('click', () => {
  const url = new URL(location.href); url.hash = encodeObservationState(observationModel, observationState);
  observationById('share-url').value = url.href; observationById('share-box').hidden = false;
  observationById('share-url').focus(); observationById('share-url').select();
  observationById('action-status').textContent = 'Comparison link ready to copy. It includes the ordered pair, filters and evidence version.';
});
// The fragment owns the versioned comparison state, not section navigation.
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  const target = observationById('comparison-title');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
});
window.addEventListener('hashchange', restoreObservationState);
restoreObservationState();
