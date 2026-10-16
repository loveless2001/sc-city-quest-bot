import test from 'node:test';
import assert from 'node:assert/strict';
import {planWithFallbacks,LANES} from '../src/endgame-v3-planner.mjs';
import {speedAt,FENCE_HALF_X,FENCE_HALF_Z} from '../src/endgame-v3-course.mjs';
import {EndgameV3,confirmBox} from '../src/endgame-v3.mjs';

const box=(lane,z)=>({lane,z,value:100,radius:1.0,box:true});
// Lane the planned route is in when it reaches z (follows the planned presses).
function laneAt(p,z,start){let lane=start;for(const k of p.presses)if(k.z<=z)lane=k.key==='L'?Math.min(2,lane+1):Math.max(0,lane-1);return lane;}
const opts={z:3300,target:2,tween:null,speedAt,margin:2,horizon:60,decisionEvery:2,width:120};

test('the planner routes through a confirmed box when the way is clear',()=>{
  const p=planWithFallbacks({...opts,obstacles:[],coins:[box(0,3345)]});
  assert.equal(p.fallback,0);assert.equal(laneAt(p,3345,2),0);
});

test('a box never buys a tight pass beside a sliding fence',()=>{
  // A sliding fence level with the box, right of lane 0: in lane 0 the body
  // clears its hard edge by c. c=0.2 costs 400*(1-0.2/0.6)=267 > 100; c=0.55 costs 33.
  const slider=c=>{const halfX=FENCE_HALF_X+0.3;return {z:3345,x:LANES[0]+0.25+c+halfX,halfX,halfZ:FENCE_HALF_Z,cost:Infinity,confident:true,best:true,sliding:true,softClear:0.6,softCost:400};};
  const tight=planWithFallbacks({...opts,obstacles:[slider(0.2)],coins:[box(0,3345)]});
  assert.equal(tight.fallback,0);assert.notEqual(laneAt(tight,3345,2),0);
  const roomy=planWithFallbacks({...opts,obstacles:[slider(0.55)],coins:[box(0,3345)]});
  assert.equal(roomy.fallback,0);assert.equal(laneAt(roomy,3345,2),0);
});

test('a box is not taken when the next row blocks its lane (live game i-018)',()=>{
  // i-018: box in lane 0 at 3315, the next row's fence in lane 0 at 3330. The
  // puzzle pause cleared the dodge planned 1.6 m past the box, steering resumed
  // 0.48 s after the continue click, and the runner hit the fence.
  const held={...box(0,3315),holdAfter:30};
  const fence=lane=>({z:3330,x:LANES[lane],halfX:FENCE_HALF_X+0.12,halfZ:FENCE_HALF_Z,cost:Infinity,confident:true,best:true});
  const o={...opts,z:3290};
  const blocked=planWithFallbacks({...o,obstacles:[fence(0)],coins:[held]});
  assert.equal(blocked.fallback,0);assert.notEqual(laneAt(blocked,3315,2),0);
  const clear=planWithFallbacks({...o,obstacles:[fence(2)],coins:[held]});
  assert.equal(clear.fallback,0);assert.equal(laneAt(clear,3315,2),0);
  // No key in the 30 m after the box on the collecting route.
  assert.ok(!clear.presses.some(p=>p.z>3315-3&&p.z<3315+30));
});

test('a box is confirmed by sustained votes, not by a burst',()=>{
  const feed=seq=>{const b={votes:[0,0,0],n:0,lane:null};return seq.map(v=>confirmBox(b,[0,0,v]));};
  // Batch runs: a vote on every frame from ~59 m; confirmed on the 12th.
  assert.equal(feed(Array(24).fill(1)).indexOf(2),11);
  // Live game i-012: missed at 55-59 m and for 2 frames behind a fence; confirmed
  // on the 15th frame (29.9 m).
  const live=[0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,0];
  assert.equal(feed(live).indexOf(2),14);
  // False hits seen in recorded runs: a 10-frame burst at range, votes only
  // close to the runner, scattered votes.
  assert.ok(!feed([...Array(10).fill(1),...Array(14).fill(0)]).includes(2));
  assert.ok(!feed([...Array(19).fill(0),1,1,1,1,1]).includes(2));
  assert.ok(!feed([1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0]).includes(2));
});

test('collect mode plans for boxes; avoid mode keeps them as obstacles',()=>{
  const collect=new EndgameV3({}),avoid=new EndgameV3({boxes:'avoid'});
  for(const c of [collect,avoid])c.boxes.set(3345,{votes:[0,0,24],n:24,lane:2});
  assert.ok(!collect.obstacles(3320).some(o=>o.box));
  assert.deepEqual(collect.boxTargets(3320).map(b=>[b.lane,b.z]),[[2,3345]]);
  assert.ok(collect.boxNear(3320));
  assert.ok(avoid.obstacles(3320).some(o=>o.box));
  assert.deepEqual(avoid.boxTargets(3320),[]);assert.ok(!avoid.boxNear(3320));
});

test('the box that paused the game is not planned for again',()=>{
  const c=new EndgameV3({});c.phase=0;c.takeOver(0,2);c.boxes.set(3345,{votes:[0,0,24],n:24,lane:2});
  const pauseAt=c.arrival(3345-1.7)+15;c.resumeExact(pauseAt,pauseAt+9000);
  assert.equal(c.lastPause.boxZ,3345);assert.ok(c.boxes.get(3345).collected);
  assert.deepEqual(c.boxTargets(3340),[]);
});

test('after a box pause the margin stays wide until the clock is re-measured',()=>{
  const c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,2);c.boxes.set(3345,{votes:[0,0,24],n:24,lane:2});
  c.laneResiduals=Array(8).fill(1);
  const pauseAt=c.arrival(3345-1.7)+15;c.resumeExact(pauseAt,pauseAt+9000);
  assert.equal(c.wideMarginUntil,3345+60);assert.deepEqual(c.laneResiduals,[]);
  // Fewer than 8 new lane-row residuals: not measured yet.
  c.laneResiduals=Array(5).fill(1.25);c.correctClock(3360);assert.equal(c.wideMarginUntil,3405);
  // 8 residuals agreeing with the clock (lag 25 ms at 50 m/s = 1.25 m): measured, no fix needed.
  c.laneResiduals=Array(8).fill(1.25);c.correctClock(3365);assert.equal(c.wideMarginUntil,null);
});
