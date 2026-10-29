import test from 'node:test';
import assert from 'node:assert/strict';
import {BotControl} from '../src/bot-control.mjs';
import {EndgameKeys,EndgameSession,SettledLane,TAKEOVER_Z,FOLLOW_Z,pilotObstacles} from '../src/endgame-session.mjs';
import {EndgameV3} from '../src/endgame-v3.mjs';
import {timeAtDistance,STAGE_START,LANE_START,PATTERN_START,LANE_X,courseOfBundle} from '../src/endgame-v3-course.mjs';
import {wordRowDistances} from '../src/course-clock.mjs';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=mkdtempSync(join(tmpdir(),'endgame-test-'));

// A page whose evaluate() runs the given function against a fake window log.
function fakePage(){
  const log={stage:[],pause:[],hidden:[]};globalThis.window={__endgameLog:log};
  return {log,evaluate:async fn=>fn()};
}
function session(allowed=()=>true){
  const keys=[];
  const s=new EndgameSession({output,pressKey:async(k,token)=>{keys.push({k,token});},allowed});
  return {s,keys};
}

test('endgame keys stop as soon as the bot is turned off',async()=>{
  const sent=[],gate=new BotControl();gate.availability(true,'Ready');gate.setEnabled(true);const token=gate.generation;
  const keys=new EndgameKeys({send:async p=>sent.push(p.key),begin:()=>{},confirm:()=>{},allowed:()=>gate.valid(token)});
  const t=Date.now();
  keys.replace([{key:'L',atMs:t+20,z:3000},{key:'R',atMs:t+120,z:3005}],keys.seq);
  await sleep(60);assert.deepEqual(sent,['L']);
  gate.setEnabled(false);await sleep(120);
  assert.deepEqual(sent,['L']);assert.equal(keys.queue.length,0);
  assert.equal(keys.replace([{key:'R',atMs:Date.now(),z:3010}],keys.seq),false);
});

test('the clock comes from the last stage change; the endgame follows from FOLLOW_Z and steers from TAKEOVER_Z',async()=>{
  const page=fakePage(),{s}=session(),at=1_000_000;
  page.log.stage.push({t:'Về đích',at:at-30000},{t:'Bứt phá',at});
  await s.sync(page);
  assert.equal(STAGE_START['Bứt phá'],4140);assert.ok(FOLLOW_Z<TAKEOVER_Z&&TAKEOVER_Z<LANE_START);
  assert.equal(s.phase,at-timeAtDistance(4140)*1000);assert.equal(s.stage,'Bứt phá');
  const before=s.phase+timeAtDistance(FOLLOW_Z-10)*1000,follow=s.phase+timeAtDistance(FOLLOW_Z+1)*1000,steer=s.phase+timeAtDistance(TAKEOVER_Z+1)*1000;
  assert.equal(s.ready('Bứt phá',before),false);assert.equal(s.ready('Bứt phá',follow),true);
  assert.equal(s.ready('Về đích',follow),false);
  assert.equal(s.start(follow,null),true);assert.equal(s.tracking,true);assert.equal(s.mode,null);
  assert.ok(Math.abs(s.zAt(follow)-(FOLLOW_Z+1))<1e-6);
  assert.equal(s.steering(follow),false);assert.equal(s.steering(steer),true);
  // The last random obstacles are ahead until just past the first lane row.
  assert.equal(s.junction(steer),true);assert.equal(s.junction(s.phase+timeAtDistance(PATTERN_START+6)*1000),false);
});

test("the early-game controller's tracks become endgame obstacles in mirrored lanes",()=>{
  const zAt=ms=>ms/10;   // a clock for the test: 10 ms per metre
  const d={trackedFences:[{id:7,lane:-1,impact:43000,hits:3,seen:1},{id:8,lane:1,impact:43100,hits:1,seen:1},{id:9,lane:0,impact:43200,hits:4,forecast:true}],
    softObstacles:[{id:3,lane:1,impact:43050,kind:'cones',seen:2},{id:4,lane:0,impact:43150,kind:'rail',seen:2}]};
  assert.deepEqual(pilotObstacles(d,zAt),[{id:'f7',z:4300,lane:2,kind:'fence',seenMs:1,hits:3},{id:'s3',z:4305,lane:0,kind:'cone',seenMs:2},{id:'s4',z:4315,lane:1,kind:'barrier',seenMs:2}]);
});

test('random obstacles before the first lane row are planned around; their distance comes from ground contact when measured',()=>{
  const c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,1);
  const zNow=LANE_START-50,now=c.arrival(zNow),zf=LANE_START-20;
  const ext=()=>c.obstacles(zNow).filter(o=>o.external).map(o=>[+(o.z-o.halfZ).toFixed(2),+(o.z+o.halfZ).toFixed(2),o.x,o.cost]);
  c.setExternal([{id:'f1',z:zf,lane:1,kind:'fence',seenMs:now,hits:3},{id:'s1',z:LANE_START-10,lane:0,kind:'cone',seenMs:now},{id:'f2',z:LANE_START+30,lane:2,kind:'fence',seenMs:now,hits:9}],now);
  // A young track without contact: fatal over z-3..z+4 and costly over z-8..z+8
  // (plus the fence's half depth); a cone over z-4..z+6. The fence 30 m past
  // the first row is not a random obstacle: dropped.
  assert.deepEqual(ext(),[[zf-3.5,zf+4.5,0,Infinity],[zf-8.5,zf+8.5,0,3000],[LANE_START-14.6,LANE_START-3.4,LANE_X[0],150]]);
  // Starting in the fence's lane, the planner leaves it before the fence.
  c.lastPerception={zFrame:zNow,px:0,visible:[]};
  const p=c.plan(now);assert.equal(p.record.ext.length,2);assert.equal(p.record.dropped,0);
  assert.ok(p.presses.length&&p.presses[0].z<zf-12);
  // Contact measured at the track's distance: +-0.8 m around it.
  c.extContacts.set('f1',[zf+1.1,zf+0.9,zf+12]);
  assert.deepEqual(ext()[0],[zf+1-1.3,zf+1+1.3,0,Infinity]);
  // Contact 6 m farther than predicted (as in recorded runs): fatal over both.
  c.extContacts.set('f1',[zf+6,zf+6.2]);
  assert.deepEqual(ext()[0],[zf-1.5,zf+7.1+0.5,0,Infinity]);assert.equal(ext().length,2);
  c.setExternal(null,now);assert.equal(c.obstacles(zNow).filter(o=>o.external).length,0);
});

test('a fence track level with the first lane row is its slider once the row is resolved',()=>{
  const c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,1);
  const now=c.arrival(LANE_START-50),row=c.rows.find(r=>r.z===LANE_START);
  // Unresolved: a fence track at its distance stays, as the likely explanation only.
  c.setExternal([{id:'f1',z:LANE_START-1,lane:0,kind:'fence',seenMs:now,hits:8}],now);
  assert.equal(c.external.list[0].best,false);
  row.hyps=[row.hyps[0]];row.frames=5;
  // Resolved: one track where the slider is, one in the lane farthest from it (a random fence).
  const x=row.fenceXs(row.hyps[0],c.gameTime(now))[0],pick=f=>LANE_X.reduce((b,v,i)=>f(Math.abs(v-x),Math.abs(LANE_X[b]-x))?i:b,0);
  c.setExternal([{id:'f1',z:LANE_START-1,lane:pick((a,b)=>a<b),kind:'fence',seenMs:now,hits:8},{id:'f2',z:LANE_START-1,lane:pick((a,b)=>a>b),kind:'fence',seenMs:now,hits:8}],now);
  assert.equal(c.external.rowTracks,1);assert.equal(c.external.list.length,1);assert.notEqual(c.external.list[0].best,false);
});

test('the planner clears a fence 30 m ahead at every speed from 25 to 50 m/s',async()=>{
  // Below ~42 m/s the old beam merging dropped lane changes in progress.
  const {plan,LANES}=await import('../src/endgame-v3-planner.mjs');
  for(const v of [25,32,35,38,40,42,45,50])for(let k=0;k<8;k++){
    const z=5000+k*0.37,p=plan({z,target:1,tween:null,coins:[],speedAt:()=>v,margin:2,horizon:60,decisionEvery:2,width:120,
      obstacles:[{z:z+30,x:LANES[1],halfX:1.864,halfZ:0.5,cost:Infinity,confident:true,best:true}]});
    assert.ok(p.safe&&p.presses.length,`no route at ${v} m/s`);
  }
});

test('a slider predicted 0.1 m closer does not set off a crossing across its path (live game i-028)',async()=>{
  // i-028 at 8173.1 m, 50 m/s, lane 0: a dense row 6 m ahead with a sliding fence
  // predicted at x -0.6 (lane 0 clears it by 0.29 m, 0.01 m short of the 0.3 m
  // hard margin) and a cone or barrier in lane 2; a navy coin in lane 1.
  const {planWithFallbacks,FALLBACKS}=await import('../src/endgame-v3-planner.mjs');
  const {speedAt}=await import('../src/endgame-v3-course.mjs');
  assert.deepEqual({...FALLBACKS},{order:'thin-first',forward:true});
  for(const x of [-0.5,-0.6,-0.65]){
    const fence={z:8179.1,x,halfX:1.614+0.3,halfZ:1.1,cost:Infinity,confident:true,best:true,sliding:true,softClear:0.6,softCost:400};
    const p=planWithFallbacks({z:8173.1,target:0,tween:null,obstacles:[fence,{z:8179.1,x:2.8,halfX:1.3,halfZ:1.2,cost:500,confident:true}],
      coins:[{lane:1,z:8176.3,value:80},{lane:1,z:8184.5,value:10}],speedAt,margin:2,horizon:60,decisionEvery:2,width:120});
    // It stays in lane 0 past the row (the old order pressed L, L at once and crossed).
    assert.ok(!p.presses.some(k=>k.z<8181),`x ${x}: ${p.presses.map(k=>k.key+'@'+k.z.toFixed(1))}`);
    assert.equal(p.margin,2);
  }
});

test('a lane change in progress is carried on before it is reversed',async()=>{
  const {plan,LANES}=await import('../src/endgame-v3-planner.mjs');
  // Mid-change from lane 0 towards lane 1 at 50 m/s; a fence in lane 1 10 m on.
  const opts={z:6000,target:1,tween:{from:-1.5,to:0,t:0.05,d:0.15},coins:[],speedAt:()=>50,margin:0,horizon:30,decisionEvery:2,width:120,
    obstacles:[{z:6010,x:LANES[1],halfX:1.664,halfZ:0.5,cost:Infinity,confident:true,best:true}]};
  const forward=plan({...opts,allowInterrupt:'forward'});
  assert.ok(forward.safe);assert.equal(forward.presses[0].key,'L');
  assert.ok(!forward.presses.some(k=>k.key==='R'&&k.z<6010));
});

test('letter rows are 45.5 m apart at the start of a word race',()=>{
  const rows=wordRowDistances('Tăng tốc 2',8);
  assert.equal(rows[0],1280+50+45.5);assert.ok(Math.abs(rows[7]-rows[6]-45.5*(1-.6))<1e-9);
});

test('a puzzle after the last stage change, before takeover, voids the clock',async()=>{
  const page=fakePage(),{s}=session(),at=2_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);assert.notEqual(s.phase,null);
  page.log.pause.push({type:'pause',at:at+2000});await s.sync(page);
  assert.equal(s.phase,null);assert.equal(s.ready('Bứt phá',at+10000),false);
});

test('a hidden tab after takeover stops the endgame for this run',async()=>{
  const page=fakePage(),{s}=session(),at=3_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(TAKEOVER_Z+10)*1000;s.start(t,1);
  page.log.hidden.push({at:t+500});await s.sync(page);
  assert.equal(s.tracking,false);assert.equal(s.invalid,'tab hidden');
  // A new run starts over.
  page.log.stage.push({t:'Nhập cuộc',at:t+60000});await s.sync(page);
  assert.equal(s.invalid,null);assert.equal(s.ctl,null);
});

test('after a puzzle the clock shifts by the page-timed pause',async()=>{
  const page=fakePage(),{s}=session(),at=4_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(LANE_START+200)*1000;s.start(t,1);const phase0=s.ctl.phase;
  s.pause(t+100);page.log.pause.push({type:'pause',at:t+50},{type:'resume',at:t+8050});
  await s.sync(page);s.resume();
  assert.equal(s.tracking,true);assert.ok(s.ctl.phase-phase0>7900&&s.ctl.phase-phase0<=8050);
});

test('after a box puzzle the bot resumes from its own continue click and steers at once',async()=>{
  const page=fakePage(),{s}=session(),at=4_500_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const zb=LANE_START+15,t=s.phase+timeAtDistance(zb-25)*1000;s.start(t,0);s.drive(t,0,1,{continuous:true});
  s.ctl.boxes.set(zb,{votes:[24,0,0],n:24,lane:0});s.ctl.lastPerception={zFrame:zb-25,px:-2.75,visible:[]};
  const collect=s.ctl.arrival(zb-1.7),phase0=s.ctl.phase;
  s.pause(collect+40);page.log.pause.push({type:'pause',at:collect+10});await s.sync(page);
  // The continue click; the page's resume event has not been read yet.
  s.lastResumeClick=collect+8000;s.resume();
  assert.equal(s.paused,false);assert.ok(Math.abs(s.ctl.phase-phase0-8000)<1);
  assert.ok(s.ctl.boxes.get(zb).collected);assert.equal(s.ctl.wideMarginUntil,zb+60);assert.ok(s.ctl.verify);
  assert.ok(s.steerFromModel('Bứt phá').fromModel);
  // Planned at the (test) time just after the click: the wide margin applies.
  assert.equal(s.ctl.plan(s.lastResumeClick+20).record.margin,3.5);
  // A new puzzle screen after the click is seen as one (not as the old one closing).
  assert.equal(s.puzzleSince(s.lastResumeClick),false);
  page.log.pause.push({type:'pause',at:s.lastResumeClick+700});await s.sync(page);
  assert.equal(s.puzzleSince(s.lastResumeClick),true);
});

test('handing back rebuilds the lane timeline from the lane seen on screen',async()=>{
  const page=fakePage(),gate=new BotControl();gate.availability(true,'Ready');
  const {s,keys}=session(token=>gate.valid(token)),at=5_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(TAKEOVER_Z+10)*1000;s.start(t,1);
  gate.setEnabled(true);s.drive(t,1,gate.generation,{continuous:true});
  s.ctl.keyHistory.push({key:'L',t:t+10,d:200});s.ctl.state={target:2,tween:null};
  gate.setEnabled(false);s.shadow(t+500);assert.equal(s.mode,'shadow');
  gate.setEnabled(true);s.drive(t+3000,0,gate.generation);
  assert.deepEqual(s.ctl.state,{target:0,tween:null});assert.equal(s.ctl.keyHistory.length,0);assert.equal(s.ctl.startLane,0);
  assert.deepEqual(s.handoffs.map(h=>h.to),['bot','player','bot']);
  assert.equal(s.keys.allowed(),true);gate.setEnabled(false);assert.equal(s.keys.allowed(),false);
  assert.equal(keys.length,0);
});

test('shadow perception takes the runner position from the screen only',()=>{
  const c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,1);
  c.keyHistory.push({key:'L',t:-100,d:200});
  // A blank frame: no lane lines, so the last seen x (none yet: the lane) is used.
  const frame={data:new Uint8Array(870*668*4),width:870,height:668};
  c.perceive(frame,{captureMs:timeAtDistance(TAKEOVER_Z+10)*1000,shadow:true});
  assert.equal(c.pxSource,'seen');assert.equal(c.lastPerception.px,0);assert.equal(c.runnerObs.length,0);
});

test('hand-back waits for the runner to stay in one lane for 0.2 s',()=>{
  const lanes=new SettledLane(),frame={data:new Uint8Array(870*668*4),width:870,height:668};
  const at=x=>({x,err:1});
  assert.equal(lanes.observe(at(2.7),0,frame),null);
  assert.equal(lanes.observe(at(2.75),100,frame),null);
  assert.equal(lanes.observe(at(2.8),210,frame),2);
  // A move in progress restarts the wait.
  const moving=new SettledLane();
  moving.observe(at(0),0,frame);moving.observe(at(0.05),120,frame);
  assert.equal(moving.observe(at(1.2),180,frame),null);
  assert.equal(moving.observe(at(2.75),230,frame),null);
  assert.equal(moving.observe(at(2.75),330,frame),null);
  assert.equal(moving.observe(at(2.75),440,frame),2);
  // Frames without a reading are skipped, unless the gap gets long.
  const gap=new SettledLane();
  gap.observe(at(0),0,frame);assert.equal(gap.observe(null,100,frame),null);
  assert.equal(gap.observe(at(0),140,frame),null);assert.equal(gap.observe(at(0),210,frame),1);
  const lost=new SettledLane();
  lost.observe(at(0),0,frame);lost.observe(null,60,frame);
  assert.equal(lost.observe(at(0),210,frame),null);
  assert.equal(lost.observe(at(0),300,frame),null);
  assert.equal(lost.observe(at(0),420,frame),1);
});

test('a lane change missed at hand-back is corrected from the lane lines',()=>{
  const c=new EndgameV3({lagPrior:25});c.phase=0;c.takeOver(0,1);
  const t=timeAtDistance(LANE_START+100)*1000;c.rebaseLane(t,1);
  c.correctLane(t+80,1.4);
  assert.equal(c.state.target,2);assert.ok(c.state.tween&&c.state.tween.from===1.4&&c.state.tween.to===2.75);
  assert.equal(c.laneCorrected,true);assert.equal(c.keyHistory.length,0);
  c.correctLane(t+300,-2.7);assert.deepEqual(c.state,{target:0,tween:null});
});

test('a key in flight when the run ends does not crash the session',async()=>{
  const page=fakePage();let release;
  const s=new EndgameSession({output,pressKey:()=>new Promise(r=>release=r),allowed:()=>true}),at=6_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(TAKEOVER_Z+10)*1000;s.start(t,1);s.drive(t,1,0,{continuous:true});
  const keys=s.keys;keys.replace([{key:'L',atMs:Date.now(),z:TAKEOVER_Z+11}],keys.seq);
  await sleep(30);assert.ok(release,'key was sent');
  await s.save('result');s.newGame();release();await sleep(20);
  assert.equal(s.ctl,null);assert.equal(keys.error,undefined);
});

test('each live bundle maps to its course, and the guard expects a known one',()=>{
  for(const bundle of ['index-BFqScKec.js','index-CE9I5eWz.js','index-B8HeQgVv.js','index-BG06rE0x.js','index-DS2du1bN.js','index-omdIpeof.js'])assert.equal(courseOfBundle(bundle),'BFqScKec',bundle);
  assert.equal(courseOfBundle('index-DnBWvl2N.js'),'DnBWvl2N');assert.equal(courseOfBundle('index-unknown.js'),undefined);
  const {args}=JSON.parse(readFileSync(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
  const expected=args.find(a=>a.startsWith('--expected-bundle='))?.split('=')[1];
  assert.ok(courseOfBundle(expected),expected);
});
