import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {warmUp} from '../src/warmup.mjs';

// sharp comes from SC_BOT_DEPENDENCIES if set, else this repo's node_modules.
function loadSharp(){
  const require=createRequire(process.env.SC_BOT_DEPENDENCIES?resolve(process.env.SC_BOT_DEPENDENCIES,'package.json'):import.meta.url);
  try{return require('sharp');}catch{return null;}
}
const sharp=loadSharp();

test('warm-up runs both controllers on the bundled frames within its budget',{skip:!sharp&&'sharp not installed'},async()=>{
  const settings=JSON.parse(await readFile(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
  const r=await warmUp({argv:settings.args,sharp,rounds:2,budgetMs:8000});
  assert.equal(r.rounds,2);assert.equal(r.frames,2*(18+4));assert.ok(r.ms<8000);
});
