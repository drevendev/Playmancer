import assert from 'node:assert/strict';
import test from 'node:test';
import { findBridgeRoute } from '../src/bridge.js';
const cmpPath=(a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]!==b[i])return a[i]<b[i]?-1:1;return a.length-b.length};
const better=(a,b)=>(a.totalCost-b.totalCost)||(a.hops-b.hops)||cmpPath(a.nodes,b.nodes);
function oracle(graph,start,end,maxHops){
  const adj=new Map(graph.nodes.map(n=>[n,[]]));
  for(const {from,to,similarity} of graph.edges){adj.get(from).push({to,cost:1-similarity});adj.get(to).push({to:from,cost:1-similarity});}
  let best=null;
  const visit=(node,path,cost)=>{
    if(node===end){const item={nodes:[...path],totalCost:cost,hops:path.length-1};if(!best||better(item,best)<0)best=item;return;}
    if(path.length-1>=maxHops)return;
    for(const edge of adj.get(node)){if(path.includes(edge.to))continue;visit(edge.to,[...path,edge.to],cost+edge.cost);}
  };
  visit(start,[start],0);return best;
}
function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/0x100000000;};}
function shuffle(a,rng){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
test('2000 seeded bounded graphs agree with exhaustive independent simple-path oracle',()=>{
  const rng=seeded(20261018),sims=[0,.125,.25,.5,.625,.75,.875,1];
  for(let iteration=0;iteration<2000;iteration++){
    const n=2+Math.floor(rng()*6),nodes=Array.from({length:n},(_,i)=>'demo:'+String.fromCharCode(97+i));
    const edges=[],density=.2+rng()*.65;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(rng()<density)edges.push({from:nodes[i],to:nodes[j],similarity:sims[Math.floor(rng()*sims.length)]});
    const start=nodes[Math.floor(rng()*n)],end=nodes[Math.floor(rng()*n)],maxHops=Math.floor(rng()*(n+1)),graph={nodes,edges};
    const expected=oracle(graph,start,end,maxHops),result=findBridgeRoute(graph,start,end,{maxHops});
    assert.equal(result.status,expected?'route':'no-route','case '+iteration);
    if(expected){assert.deepEqual(result.nodes,expected.nodes,'case '+iteration);assert.equal(result.totalCost,expected.totalCost);assert.equal(result.hops,expected.hops);}
    const permuted={nodes:shuffle(nodes,rng),edges:shuffle(edges,rng).map(e=>rng()<.5?{...e,from:e.to,to:e.from}:e)};
    assert.deepEqual(findBridgeRoute(permuted,start,end,{maxHops}),result,'permuted case '+iteration);
  }
});
