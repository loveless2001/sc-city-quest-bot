import test from 'node:test';
import assert from 'node:assert/strict';
import {BotControl} from '../src/bot-control.mjs';
import {EndgameKeys,EndgameSession,SettledLane,TAKEOVER_Z} from '../src/endgame-session.mjs';
import {EndgameV3} from '../src/endgame-v3.mjs';
import {timeAtDistance} from '../src/endgame-v3-course.mjs';
import {mkdtempSync} from 'node:fs';
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

test('the clock comes from the last stage change and starts the endgame at 2806 m',async()=>{
  const page=fakePage(),{s}=session(),at=1_000_000;
  page.log.stage.push({t:'Về đích',at:at-30000},{t:'Bứt phá',at});
  await s.sync(page);
  assert.equal(s.phase,at-timeAtDistance(2600)*1000);assert.equal(s.stage,'Bứt phá');
  const before=s.phase+timeAtDistance(2700)*1000,after=s.phase+timeAtDistance(TAKEOVER_Z+1)*1000;
  assert.equal(s.ready('Bứt phá',before),false);assert.equal(s.ready('Bứt phá',after),true);
  assert.equal(s.ready('Về đích',after),false);
  assert.equal(s.start(after,null),true);assert.equal(s.tracking,true);assert.equal(s.mode,null);
  assert.ok(Math.abs(s.zAt(after)-(TAKEOVER_Z+1))<1e-6);
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
  const t=s.phase+timeAtDistance(2900)*1000;s.start(t,1);
  page.log.hidden.push({at:t+500});await s.sync(page);
  assert.equal(s.tracking,false);assert.equal(s.invalid,'tab hidden');
  // A new run starts over.
  page.log.stage.push({t:'Nhập cuộc',at:t+60000});await s.sync(page);
  assert.equal(s.invalid,null);assert.equal(s.ctl,null);
});

test('after a puzzle the clock shifts by the page-timed pause',async()=>{
  const page=fakePage(),{s}=session(),at=4_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(3500)*1000;s.start(t,1);const phase0=s.ctl.phase;
  s.pause(t+100);page.log.pause.push({type:'pause',at:t+50},{type:'resume',at:t+8050});
  await s.sync(page);s.resume();
  assert.equal(s.tracking,true);assert.ok(s.ctl.phase-phase0>7900&&s.ctl.phase-phase0<=8050);
});

test('after a box puzzle the bot resumes from its own continue click and steers at once',async()=>{
  const page=fakePage(),{s}=session(),at=4_500_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(3290)*1000;s.start(t,0);s.drive(t,0,1,{continuous:true});
  s.ctl.boxes.set(3315,{votes:[24,0,0],n:24,lane:0});s.ctl.lastPerception={zFrame:3290,px:-2.75,visible:[]};
  const collect=s.ctl.arrival(3315-1.7),phase0=s.ctl.phase;
  s.pause(collect+40);page.log.pause.push({type:'pause',at:collect+10});await s.sync(page);
  // The continue click; the page's resume event has not been read yet.
  s.lastResumeClick=collect+8000;s.resume();
  assert.equal(s.paused,false);assert.ok(Math.abs(s.ctl.phase-phase0-8000)<1);
  assert.ok(s.ctl.boxes.get(3315).collected);assert.equal(s.ctl.wideMarginUntil,3375);assert.ok(s.ctl.verify);
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
  const t=s.phase+timeAtDistance(2900)*1000;s.start(t,1);
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
  c.perceive(frame,{captureMs:timeAtDistance(2900)*1000,shadow:true});
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
  const t=timeAtDistance(3400)*1000;c.rebaseLane(t,1);
  c.correctLane(t+80,1.4);
  assert.equal(c.state.target,2);assert.ok(c.state.tween&&c.state.tween.from===1.4&&c.state.tween.to===2.75);
  assert.equal(c.laneCorrected,true);assert.equal(c.keyHistory.length,0);
  c.correctLane(t+300,-2.7);assert.deepEqual(c.state,{target:0,tween:null});
});

test('a key in flight when the run ends does not crash the session',async()=>{
  const page=fakePage();let release;
  const s=new EndgameSession({output,pressKey:()=>new Promise(r=>release=r),allowed:()=>true}),at=6_000_000;
  page.log.stage.push({t:'Bứt phá',at});await s.sync(page);
  const t=s.phase+timeAtDistance(2900)*1000;s.start(t,1);s.drive(t,1,0,{continuous:true});
  const keys=s.keys;keys.replace([{key:'L',atMs:Date.now(),z:2901}],keys.seq);
  await sleep(30);assert.ok(release,'key was sent');
  await s.save('result');s.newGame();release();await sleep(20);
  assert.equal(s.ctl,null);assert.equal(keys.error,undefined);
});
