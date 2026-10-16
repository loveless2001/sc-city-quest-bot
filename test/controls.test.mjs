import test from 'node:test';
import assert from 'node:assert/strict';
import {BotControl} from '../src/bot-control.mjs';
import {InterruptibleScheduler} from '../src/interruptible-scheduler.mjs';
import {prepareManualHandoff} from '../src/manual-handoff.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('off by default; stale work stays invalid after a quick off/on',()=>{
  const gate=new BotControl();assert.equal(gate.enabled,false);
  assert.equal(gate.setEnabled(true).enabled,false);
  gate.availability(true,'Ready');gate.setEnabled(true);const token=gate.generation;
  gate.setEnabled(false);gate.setEnabled(true);
  assert.equal(gate.valid(token),false);assert.equal(gate.valid(gate.generation),true);
  gate.availability(false,'Game changed');assert.equal(gate.enabled,false);
});
test('takeover cancels the delayed second key of an atomic crossing',async()=>{
  const keys=[],gate=new BotControl();gate.availability(true,'Ready');gate.setEnabled(true);
  const queue=new InterruptibleScheduler({press:async key=>keys.push(key),onSent:()=>{},getLane:()=>-1,allowed:()=>gate.enabled});
  queue.replace([{at:Date.now(),from:-1,events:[],commands:[{key:'ArrowRight',offset:0},{key:'ArrowRight',offset:150}]}]);
  await sleep(25);assert.deepEqual(keys,['ArrowRight']);gate.setEnabled(false);await queue.abort();
  await sleep(175);assert.deepEqual(keys,['ArrowRight']);assert.equal(queue.active,null);assert.equal(queue.queue.length,0);
});
test('takeover cancels future groups even with a key acknowledgement in flight',async()=>{
  const keys=[];let finish;const gate=new BotControl();gate.availability(true,'Ready');gate.setEnabled(true);
  const queue=new InterruptibleScheduler({press:async key=>{keys.push(key);await new Promise(r=>finish=r);},onSent:()=>{},getLane:()=>0,allowed:()=>gate.enabled,refreshDuringSingleInput:true});
  queue.replace([{at:Date.now(),events:[],commands:[{key:'ArrowLeft',offset:0}]}]);
  await sleep(20);queue.replace([{at:Date.now()+30,events:[],commands:[{key:'ArrowUp',offset:0}]}]);
  gate.setEnabled(false);const stopped=queue.abort();finish();await stopped;await sleep(60);
  assert.deepEqual(keys,['ArrowLeft']);assert.equal(queue.replace([{at:Date.now(),events:[],commands:[{key:'ArrowUp',offset:0}]}]),false);
});
test('joining a stage in progress does not fabricate a boundary calibration',()=>{
  const pilot={publicWordClock:true};prepareManualHandoff(pilot,1,'Tăng tốc 2',50000);
  assert.equal(pilot.commandLane,1);assert.equal(pilot.wordClock.clock.phase,null);
  pilot.wordClock.clock.observe('Tăng tốc 2',50100);assert.equal(pilot.wordClock.clock.phase,null);
  pilot.wordClock.clock.observe('Tăng tốc 3',70000);assert.equal(typeof pilot.wordClock.clock.phase,'number');
});
