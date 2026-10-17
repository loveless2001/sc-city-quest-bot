import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {medals} from '../src/medals.mjs';
import {measureRunnerX} from '../src/runner-x.mjs';
import {createConfiguredPilot} from '../src/controller-config.mjs';
import {prepareManualHandoff} from '../src/manual-handoff.mjs';

const sharp=createRequire(import.meta.url)('sharp');
// Frames from live games i-026 and i-027 (2026-10-17, current course).
async function frame(name){
  const {data,info}=await sharp(fileURLToPath(new URL(`./fixtures/${name}.jpg`,import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {data,width:info.width,height:info.height};
}
const px=f=>measureRunnerX(f).x;

test('all three location medals are found in the middle lane, the blue one also at range behind hurdles',async()=>{
  for(const [name,tier,lo,hi] of [['medal-gold','gold',15,26],['medal-blue-far','blue',33,45],['medal-green','green',15,26]]){
    const f=await frame(name),found=medals(f,{playerX:px(f)});
    assert.equal(found.length,1,name);assert.equal(found[0].medal,tier);assert.equal(found[0].lane,0);
    assert.ok(found[0].d>lo&&found[0].d<hi,`${name} at ${found[0].d}`);
    // Reported at the row of a coin at that distance (for the pickup tracker).
    assert.ok(found[0].y>found[0].bh/2,'row');
  }
  const none=await frame('no-medal');assert.deepEqual(medals(none,{playerX:px(none)}),[]);
});

test('the early-game controller sees navy coins and medals as pickups with the shipped settings',async()=>{
  const settings=JSON.parse(await readFile(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
  assert.ok(settings.args.includes('--location-medals')&&settings.args.includes('--navy-coins'));
  const pilot=prepareManualHandoff(await createConfiguredPilot(settings.args),1,'Về đích',1000);
  assert.ok(pilot.locationMedals&&pilot.navyCoins);
  const d=pilot.analyse(await frame('navy-coin'),1050);
  // A navy coin 13 m ahead in the right-hand lane (its lane +1), as an 80-point orbit coin.
  assert.deepEqual(d.navyObservations.map(o=>[o.kind,o.lane]),[['orbit',1]]);
  assert.deepEqual(d.medalObservations.map(o=>[o.medal,o.lane]),[['green',0]]);
});
