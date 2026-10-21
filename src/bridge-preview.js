// Bounded feature-based Bridge experiment for the synthetic browser and JSON CLI.
// A route is evidence of metadata connections, not measured player usefulness.
import { findBridgeRoute } from './bridge.js';

const GROUPS = [{ key: 'mechanics', weight: .7 }, { key: 'themes', weight: .3 }];
export const BRIDGE_ROUTE_METHOD_VERSION = 'bridge-features-preview-3';
const VERSION = BRIDGE_ROUTE_METHOD_VERSION;
function decimalRatio(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  let numerator = BigInt(whole + fraction), denominator = 1n;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  return { numerator, denominator };
}
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
function featureEvidence(a,b, includeGroups = true, leftCache = null, rightCache = null) {
  let coverage=0;
  let numerator=0n, denominator=1n, coverageUnits=0;
  const groups=[];
  for(const {key,weight} of GROUPS) {
    if(a[key]===null || b[key]===null) continue;
    const left=leftCache?.[key] ?? new Set(a[key]);
    const right=rightCache?.[key] ?? new Set(b[key]);
    // Pair screening is O(n²): construct explanation arrays only for chosen route steps.
    let sharedCount = 0;
    for (const feature of left) if (right.has(feature)) sharedCount++;
    const union = left.size + right.size - sharedCount;
    if (includeGroups) {
      const shared=[...left].filter(x=>right.has(x)).sort();
      const gained=[...right].filter(x=>!left.has(x)).sort();
      const lost=[...left].filter(x=>!right.has(x)).sort();
      groups.push({ group:key, shared, gained, lost });
    }
    coverage += weight;
    const units = key === 'mechanics' ? 7 : 3;
    coverageUnits += units;
    if (union) {
      numerator = numerator * BigInt(union) + BigInt(units * sharedCount) * denominator;
      denominator *= BigInt(union);
    }
  }
  // Jaccard is a rational number of feature counts. Convert it to Number once
  // for display, but keep the exact fraction for thresholds and route ordering.
  const exactSimilarity = coverageUnits >= 7
    ? { numerator, denominator: denominator * BigInt(coverageUnits) } : null;
  return { affinity: exactSimilarity === null ? null
    : Number(exactSimilarity.numerator) / Number(exactSimilarity.denominator),
    coverage, groups, exactSimilarity };
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
  // Build immutable feature lookup sets once, not inside every eligible pair.
  const featuresById = new Map(eligible.map(game => [game.id, {
    mechanics: game.mechanics === null ? null : new Set(game.mechanics),
    themes: game.themes === null ? null : new Set(game.themes)
  }]));
  const edges=[];
  // Disjoint counts over unordered eligible pairs: unknown evidence is not zero fit.
  const pairEvidence={insufficient:0,zero_support:0,below_threshold:0,connected:0};
  const thresholdRatio = decimalRatio(minSimilarity);
  for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
    const e=featureEvidence(eligible[i],eligible[j], false,
      featuresById.get(eligible[i].id), featuresById.get(eligible[j].id));
    if(e.affinity===null) pairEvidence.insufficient++;
    else if(e.affinity<=0) pairEvidence.zero_support++;
    else if(e.exactSimilarity.numerator * thresholdRatio.denominator <
            thresholdRatio.numerator * e.exactSimilarity.denominator)
      pairEvidence.below_threshold++;
    else {
      pairEvidence.connected++;
      edges.push({from:eligible[i].id,to:eligible[j].id,
        similarity:e.affinity,exactSimilarity:e.exactSimilarity});
    }
  }
  common.pair_evidence=pairEvidence;
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
