// Independent, synthetic-only Bridge integration candidate for issue #9.
// A standalone experiment: this is NOT an exposed UI mode or a production catalog path.
import { findBridgeRoute } from './bridge.js';

const GROUPS = [{ key: 'mechanics', weight: .7 }, { key: 'themes', weight: .3 }];
const VERSION = 'bridge-features-preview-1';
function requireId(value, name) {
  if (typeof value !== 'string' || !/^[a-z0-9]+:[a-z0-9][a-z0-9._-]*$/.test(value))
    throw new TypeError(`${name} must be a canonical game ID`);
  return value;
}
function assertFeatureList(value, name) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !x.trim()))
    throw new TypeError(`${name} must be an array of feature strings or null`);
  if (new Set(value).size !== value.length) throw new TypeError(`duplicate ${name}`);
  return [...value];
}
function featureEvidence(a,b) {
  let sum=0, coverage=0;
  const groups=[];
  for(const {key,weight} of GROUPS) {
    if(a[key]===null || b[key]===null) continue;
    const left=new Set(a[key]), right=new Set(b[key]);
    const shared=[...left].filter(x=>right.has(x)).sort();
    const gained=[...right].filter(x=>!left.has(x)).sort();
    const lost=[...left].filter(x=>!right.has(x)).sort();
    const union=new Set([...left,...right]).size;
    sum += weight * (union ? shared.length/union : 0);
    coverage += weight;
    groups.push({ group:key, shared, gained, lost });
  }
  return { affinity:coverage>=.7?sum/coverage:null, coverage,
    groups };
}
function classify(game, {platform, coopOnly}, exclusions) {
  if (exclusions.has(game.id)) return 'excluded';
  if (platform !== 'any') {
    if (game.platforms !== null && !game.platforms.includes(platform)) return 'fail';
  }
  if (coopOnly && game.coop === false) return 'fail';
  if ((platform !== 'any' && game.platforms===null) || (coopOnly && game.coop===null)) return 'unknown';
  return 'pass';
}
export function buildBridgePreview({catalog, snapshotId, startId, endId,
    platform='any',coopOnly=false,excluded=[],maxHops=4,minSimilarity=.1}={}) {
  requireId(startId,'startId');requireId(endId,'endId');
  if(startId===endId) throw new RangeError('Bridge needs two distinct explicit favorites');
  if(typeof snapshotId!=='string' || !snapshotId.trim()) throw new TypeError('snapshotId is required');
  if(!Array.isArray(catalog) || !catalog.length || catalog.length>250) throw new RangeError('Expected 1–250 synthetic records');
  if(!Array.isArray(excluded) || excluded.some(id => typeof id!=='string') || new Set(excluded).size!==excluded.length) throw new TypeError('Invalid exclusions');
  if(typeof platform!=='string' || !platform.trim() || typeof coopOnly!=='boolean') throw new TypeError('Invalid hard constraints');
  if(!Number.isInteger(maxHops)||maxHops<1||maxHops>8) throw new RangeError('maxHops must be 1–8');
  if(typeof minSimilarity!=='number' || !Number.isFinite(minSimilarity)||minSimilarity<0||minSimilarity>1) throw new RangeError('minSimilarity must be in [0,1]');
  const ids=new Map();
  for(const raw of catalog) {
    if(!raw || typeof raw!=='object') throw new TypeError('game must be an object');
    const id=requireId(raw.id,'game id');
    if(ids.has(id)) throw new TypeError(`duplicate game ID: ${id}`);
    const normalized={id, mechanics:assertFeatureList(raw.mechanics,'mechanics'),
      themes:assertFeatureList(raw.themes,'themes'),platforms:assertFeatureList(raw.platforms,'platforms'),
      coop:raw.coop??null};
    if(![true,false,null].includes(normalized.coop)) throw new TypeError('Invalid coop metadata');
    ids.set(id,normalized);
  }
  if(!ids.has(startId)||!ids.has(endId)) throw new RangeError('Unrecognized endpoint');
  for(const id of excluded) if(!ids.has(id)) throw new TypeError('Unknown excluded game ID');
  const exclusions=new Set(excluded);
  const constraints={platform,coopOnly};
  const states=new Map([...ids.values()].map(g=>[g.id,classify(g,constraints,exclusions)]));
  const common={catalog_snapshot_id:snapshotId,route_method_version:VERSION,
    start_id:startId,end_id:endId,max_hops:maxHops,min_similarity:minSimilarity,
    constraints, excluded_candidate_ids:[...exclusions].sort(),
    eligibility:{pass:0,fail:0,unknown:0,excluded:0}};
  for(const state of states.values()) common.eligibility[state]++;
  for(const id of [startId,endId]) {
    if(states.get(id)!=='pass') return {...common,status:'unavailable-endpoint',reason:states.get(id),affected_id:id};
  }
  const eligible=[...ids.values()].filter(g=>states.get(g.id)==='pass').sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const edges=[];
  for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
    const e=featureEvidence(eligible[i],eligible[j]);
    if(e.affinity!==null && e.affinity>=minSimilarity)
      edges.push({from:eligible[i].id,to:eligible[j].id,similarity:e.affinity});
  }
  const route=findBridgeRoute({nodes:eligible.map(g=>g.id),edges},startId,endId,{maxHops});
  if(route.status!=='route') return {...common,status:'no-route',reason:route.reason,eligible_count:eligible.length,edge_count:edges.length};
  const steps=[];
  for(let i=1;i<route.nodes.length;i++){
    const from=route.nodes[i-1],to=route.nodes[i];
    const evidence=featureEvidence(ids.get(from),ids.get(to));
    steps.push({from,to,affinity:evidence.affinity,evidence_coverage:evidence.coverage,
      groups:evidence.groups});
  }
  return {...common,status:'route',nodes:route.nodes,hops:route.hops,
    total_cost:route.totalCost,steps,eligible_count:eligible.length,edge_count:edges.length};
}
