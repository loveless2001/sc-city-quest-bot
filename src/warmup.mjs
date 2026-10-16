// Warm-up before play. The first analyses in a fresh Node process run
// unoptimized code (up to ~100 ms a frame against ~15 ms later), which made the
// bot sluggish for its first ~10 s of a run. This runs the early-game
// controller, the endgame controller and the JPEG decoder on sample frames from
// a recorded run (warmup/), then discards that state. It reads no game state.
import {readFile} from 'node:fs/promises';
import {createConfiguredPilot} from './controller-config.mjs';
import {prepareManualHandoff} from './manual-handoff.mjs';
import {EndgameV3} from './endgame-v3.mjs';
import {timeAtDistance} from './endgame-v3-course.mjs';

export async function warmUp({argv,sharp,rounds=4,budgetMs=5000}){
  const t0=Date.now(),dir=new URL('./warmup/',import.meta.url);
  const list=JSON.parse(await readFile(new URL('frames.json',dir),'utf8'));
  const decode=async file=>{const d=await sharp(await readFile(new URL(file,dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return {data:d.data,width:d.info.width,height:d.info.height};};
  const early=[],late=[];
  for(const s of list.early)early.push({...s,frame:await decode(s.file)});
  for(const s of list.endgame)late.push({...s,frame:await decode(s.file)});
  let frames=0,round=0;
  for(;round<rounds&&Date.now()-t0<budgetMs;round++){
    // A throwaway early-game controller over a consecutive frame sequence.
    let now=Date.now();
    const pilot=prepareManualHandoff(await createConfiguredPilot(argv),0,early[0].stage,now);
    for(const s of early){pilot.stageText=s.stage;pilot.sensorLagMs=20;pilot.analyse(s.frame,now);now+=52;frames++;}
    // A throwaway endgame controller, its clock set so each frame sits at its
    // recorded distance (lane rows, sparse rows, dense rows, sliding rows).
    const ctl=new EndgameV3({lagPrior:25});
    for(const s of late){const t=Date.now();ctl.phase=t-timeAtDistance(s.z)*1000;if(!ctl.active)ctl.takeOver(t,1);
      ctl.perceive(s.frame,{captureMs:t});ctl.plan(t+5);frames++;}
  }
  return {ms:Date.now()-t0,frames,rounds:round};
}
