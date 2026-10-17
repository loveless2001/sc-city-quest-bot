import test from 'node:test';
import assert from 'node:assert/strict';
import {planWithFallbacks,LANES} from '../src/endgame-v3-planner.mjs';
import {speedAt,FENCE_HALF_X,FENCE_HALF_Z,useCourse,LANE_START,COURSES} from '../src/endgame-v3-course.mjs';
import {EndgameV3,confirmBox} from '../src/endgame-v3.mjs';

const box=(lane,z)=>({lane,z,value:100,radius:1.0,box:true});
// Lane the planned route is in when it reaches z (follows the planned presses).
function laneAt(p,z,start){let lane=start;for(const k of p.presses)if(k.z<=z)lane=k.key==='L'?Math.min(2,lane+1):Math.max(0,lane-1);return lane;}

// Distances are given from the first lane row z0 (3300 m on the old course,
// where the live cases were recorded; 4340 m on the current one, where the
// runner is slower there: 42-44 m/s instead of 50). Each case runs on both.
for(const course of Object.keys(COURSES)){
  const name=s=>`${s} (${course} course)`;
  const z0=()=>{useCourse(course);return LANE_START;};
  const opts=z=>({z,target:2,tween:null,speedAt,margin:2,horizon:60,decisionEvery:2,width:120});

  test(name('the planner routes through a confirmed box when the way is clear'),()=>{
    const z=z0(),p=planWithFallbacks({...opts(z),obstacles:[],coins:[box(0,z+45)]});
    assert.equal(p.fallback,0);assert.equal(laneAt(p,z+45,2),0);
  });

  test(name('a box never buys a tight pass beside a sliding fence'),()=>{
    // A sliding fence level with the box, right of lane 0: in lane 0 the body
    // clears its hard edge by c. c=0.2 costs 400*(1-0.2/0.6)=267 > 100; c=0.55 costs 33.
    const z=z0(),slider=c=>{const halfX=FENCE_HALF_X+0.3;return {z:z+45,x:LANES[0]+0.25+c+halfX,halfX,halfZ:FENCE_HALF_Z,cost:Infinity,confident:true,best:true,sliding:true,softClear:0.6,softCost:400};};
    const tight=planWithFallbacks({...opts(z),obstacles:[slider(0.2)],coins:[box(0,z+45)]});
    assert.equal(tight.fallback,0);assert.notEqual(laneAt(tight,z+45,2),0);
    const roomy=planWithFallbacks({...opts(z),obstacles:[slider(0.55)],coins:[box(0,z+45)]});
    assert.equal(roomy.fallback,0);assert.equal(laneAt(roomy,z+45,2),0);
  });

  test(name('a box is not taken when the next row blocks its lane (live game i-018)'),()=>{
    // i-018: box in lane 0 at 3315 (z0+15), the next row's fence in lane 0 at
    // 3330. The puzzle pause cleared the dodge planned 1.6 m past the box,
    // steering resumed 0.48 s after the continue click, and the runner hit the fence.
    const z=z0(),held={...box(0,z+15),holdAfter:30};
    const fence=lane=>({z:z+30,x:LANES[lane],halfX:FENCE_HALF_X+0.12,halfZ:FENCE_HALF_Z,cost:Infinity,confident:true,best:true});
    const o=opts(z-10);
    const blocked=planWithFallbacks({...o,obstacles:[fence(0)],coins:[held]});
    assert.equal(blocked.fallback,0);assert.notEqual(laneAt(blocked,z+15,2),0);
    const clear=planWithFallbacks({...o,obstacles:[fence(2)],coins:[held]});
    assert.equal(clear.fallback,0);assert.equal(laneAt(clear,z+15,2),0);
    // No key in the 30 m after the box on the collecting route.
    assert.ok(!clear.presses.some(p=>p.z>z+15-3&&p.z<z+15+30));
  });

  test(name('collect mode plans for boxes; avoid mode keeps them as obstacles'),()=>{
    const z=z0(),collect=new EndgameV3({}),avoid=new EndgameV3({boxes:'avoid'});
    for(const c of [collect,avoid])c.boxes.set(z+45,{votes:[0,0,24],n:24,lane:2});
    assert.ok(!collect.obstacles(z+20).some(o=>o.box));
    assert.deepEqual(collect.boxTargets(z+20).map(b=>[b.lane,b.z]),[[2,z+45]]);
    assert.ok(collect.boxNear(z+20));
    assert.ok(avoid.obstacles(z+20).some(o=>o.box));
    assert.deepEqual(avoid.boxTargets(z+20),[]);assert.ok(!avoid.boxNear(z+20));
  });

  test(name('the box that paused the game is not planned for again'),()=>{
    const z=z0(),c=new EndgameV3({});c.phase=0;c.takeOver(0,2);c.boxes.set(z+45,{votes:[0,0,24],n:24,lane:2});
    const pauseAt=c.arrival(z+45-1.7)+15;c.resumeExact(pauseAt,pauseAt+9000);
    assert.equal(c.lastPause.boxZ,z+45);assert.ok(c.boxes.get(z+45).collected);
    assert.deepEqual(c.boxTargets(z+40),[]);
  });

  test(name('after a box pause the margin stays wide until the clock is re-measured'),()=>{
    const z=z0(),c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,2);c.boxes.set(z+45,{votes:[0,0,24],n:24,lane:2});
    c.laneResiduals=Array(8).fill(1);
    const pauseAt=c.arrival(z+45-1.7)+15;c.resumeExact(pauseAt,pauseAt+9000);
    assert.equal(c.wideMarginUntil,z+45+60);assert.deepEqual(c.laneResiduals,[]);
    // Fewer than 8 new lane-row residuals: not measured yet.
    c.laneResiduals=Array(5).fill(1.25);c.correctClock(z+60);assert.equal(c.wideMarginUntil,z+105);
    // 8 residuals agreeing with the clock (lag 25 ms at the speed there): measured.
    c.laneResiduals=Array(8).fill(speedAt(z+65)*0.025);c.correctClock(z+65);assert.equal(c.wideMarginUntil,null);
  });
}

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
