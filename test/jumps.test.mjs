import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createConfiguredPilot} from '../src/controller-config.mjs';
import {earlyJumpThreat} from '../src/early-jump-policy.mjs';

test('the shipped settings jump only for cones the route cannot avoid',async()=>{
  const settings=JSON.parse(await readFile(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
  const pilot=await createConfiguredPilot(settings.args);
  assert.equal(pilot.hazardOnlyEarlyJumps,true);assert.equal(pilot.jumpConesOnly,true);
  assert.ok(!pilot.feedbackJump&&!pilot.lateFeedbackJump);
});

test('a cone ahead in the committed lane is a jump threat; avoided cones and barriers are not',()=>{
  const cones=o=>o.filter(x=>x.kind==='cones');
  const cone={id:'c1',kind:'cones',lane:0,eta:200},rail={id:'r1',kind:'rail',lane:0,eta:200};
  // Staying in lane 0 with a cone 200 ms ahead: jump.
  assert.equal(earlyJumpThreat(cones([cone]),{current:0,end:0,commands:[]})?.id,'c1');
  // The route leaves lane 0 well before the cone arrives: no jump.
  assert.equal(earlyJumpThreat(cones([cone]),{current:0,end:1,commands:[{key:'ArrowRight',atMs:40}]}),null);
  // Barriers cannot be jumped in the game: with cones only, no jump.
  assert.equal(earlyJumpThreat(cones([rail]),{current:0,end:0,commands:[]}),null);
  // Too far ahead (over 280 ms) or already passed: not yet / no jump.
  assert.equal(earlyJumpThreat(cones([{...cone,eta:400}]),{current:0,end:0,commands:[]}),null);
  assert.equal(earlyJumpThreat(cones([{...cone,eta:-100}]),{current:0,end:0,commands:[]}),null);
});
