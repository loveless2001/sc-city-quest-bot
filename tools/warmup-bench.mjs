// Cold-start cost of the interactive bot's early-game loop, offline. In a fresh
// process, decodes and analyses the first frames of a recorded interactive run
// with a new early-game controller, either cold or after src/warmup.mjs.
// runDir is a game recorded with --capture (frame-*.jpg from its first frame).
// Usage (from the repo root): node tools/warmup-bench.mjs <cold|warm> <runDir> [frames=240]
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const [mode='cold',runDir,nA='240']=process.argv.slice(2);
if(!runDir)throw new Error('Usage: node tools/warmup-bench.mjs <cold|warm> <runDir> [frames]');
const require=createRequire(process.env.SC_BOT_DEPENDENCIES?process.env.SC_BOT_DEPENDENCIES+'/package.json':import.meta.url);const sharp=require('sharp');
const I='../src/';
const settings=JSON.parse(await readFile(new URL(I+'interactive-settings.json',import.meta.url),'utf8'));
const {createConfiguredPilot}=await import(I+'controller-config.mjs');
const {prepareManualHandoff}=await import(I+'manual-handoff.mjs');
let warm=null;
if(mode==='warm'){const {warmUp}=await import(I+'warmup.mjs');warm=await warmUp({argv:settings.args,sharp});}
let now=Date.now();
const pilot=prepareManualHandoff(await createConfiguredPilot(settings.args),0,'Nhập cuộc',now);
const rows=[];
for(let i=1;i<=+nA;i++){
  const buf=await readFile(`${runDir}/frame-${String(i).padStart(6,'0')}.jpg`);
  const t0=performance.now();const d=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true});const t1=performance.now();
  pilot.stageText='Nhập cuộc';pilot.sensorLagMs=20;pilot.analyse({data:d.data,width:d.info.width,height:d.info.height},now);
  rows.push({decode:t1-t0,analyse:performance.now()-t1});now+=52;
}
const st=(a,k)=>{const v=a.map(r=>r[k]).sort((x,y)=>x-y);return `p50 ${v[v.length>>1].toFixed(1)} p90 ${v[Math.floor(v.length*.9)].toFixed(1)} max ${v.at(-1).toFixed(1)}`;};
const first=rows.slice(0,190),later=rows.slice(190);
console.log(`${mode}${warm?` (warm-up ${warm.ms} ms, ${warm.frames} frames)`:''} | first ~10 s (190 frames): analyse ${st(first,'analyse')}; decode ${st(first,'decode')} | later: analyse ${st(later,'analyse')} | frames >60 ms in first 10 s: ${first.filter(r=>r.analyse+r.decode>60).length}`);
