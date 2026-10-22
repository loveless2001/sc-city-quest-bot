// Always-on crash capture. The last few seconds of analysed frames (the
// screencast JPEGs as received, and each frame's timing.jsonl line) stay in
// memory; when a run ends early they go to a crash-<time>/ folder in the
// session folder, with a copy of the run's endgame log, so that a rare crash
// can be replayed without recording every game (--capture). A full-course game
// writes nothing.
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {MOVING_RANGES} from './endgame-v3-course.mjs';

// The frames captured in the last windowMs before the newest one, at most
// capacity of them, oldest first. Frames are kept by reference, not copied.
export class FrameRing{
  constructor({windowMs=4000,capacity=Math.ceil(windowMs/20)}={}){
    this.windowMs=windowMs;this.slots=new Array(Math.max(1,capacity));this.start=0;this.size=0;
  }
  push(item){
    if(this.size===this.slots.length)this.drop();
    this.slots[(this.start+this.size)%this.slots.length]=item;this.size++;
    while(item.at-this.slots[this.start].at>this.windowMs)this.drop();
  }
  drop(){this.slots[this.start]=undefined;this.start=(this.start+1)%this.slots.length;this.size--;}
  items(){const out=[];for(let i=0;i<this.size;i++)out.push(this.slots[(this.start+i)%this.slots.length]);return out;}
  clear(){this.slots.fill(undefined);this.start=0;this.size=0;}
}

// A run ended early when the furthest distance the bot's clock reached in it is
// short of the end of the last sliding range (8,540 m on the current course):
// full-course games run on to about 9,000 m, where the course closes. A run
// with no distance (it ended before the first stage change gave the clock, or
// the endgame controller is off) counts as early.
export const earlyBefore=()=>MOVING_RANGES.at(-1)[1];
export const endedEarly=furthest=>!(furthest>=earlyBefore());
// Only a run whose end the bot watched is written: its newest frame is at most
// FRESH_MS older than the end (a game you finish with the bot off before the
// endgame has no frames of its end).
export const FRESH_MS=2000;
// The game shows its result 1 s after a fatal hit (as death-point.mjs assumes).
const HIT_MS=1000;
const round=z=>z==null?null:+z.toFixed(1);

export class CrashFrames{
  constructor({output,windowMs=4000,capacity}={}){this.output=output;this.ring=new FrameRing({windowMs,capacity});this.reset();}
  reset(){this.ring.clear();this.furthest=null;this.game=undefined;}
  // One analysed frame: f its number (as --capture names it), shot its JPEG,
  // line its timing line, at its capture time, z the clock's distance there
  // (null when unknown), game the run it belongs to (a new value starts over).
  push({f,shot,line,at,z=null,game}){
    if(game!==this.game){this.reset();this.game=game;}
    this.ring.push({f,shot,line,at,z});
    if(Number.isFinite(z)&&(this.furthest==null||z>this.furthest))this.furthest=z;
  }
  // The run has ended: writes its last frames if it ended early and returns the
  // folder, else null. The buffer is emptied either way.
  async end({reason,now=Date.now(),endgameFile=null}={}){
    const frames=this.ring.items(),furthest=this.furthest;this.reset();
    if(!frames.length||now-frames.at(-1).at>FRESH_MS||!endedEarly(furthest))return null;
    const dir=resolve(this.output,`crash-${now}`);await mkdir(dir,{recursive:true});
    await Promise.all(frames.map(e=>writeFile(resolve(dir,`frame-${String(e.f).padStart(6,'0')}.jpg`),e.shot)));
    await writeFile(resolve(dir,'timing.jsonl'),frames.map(e=>JSON.stringify(e.line)).join('\n')+'\n');
    if(endgameFile)await copyFile(endgameFile,resolve(dir,basename(endgameFile))).catch(()=>{});
    const last=frames.at(-1),hit=frames.findLast(e=>e.at<=last.at-HIT_MS)??frames[0];
    await writeFile(resolve(dir,'crash.json'),JSON.stringify({reason,endedAt:new Date(now).toISOString(),furthestZ:round(furthest),earlyBefore:earlyBefore(),
      frames:frames.length,first:frames[0].f,last:last.f,lastZ:round(last.z),hit:{f:hit.f,z:round(hit.z)}},null,2));
    return dir;
  }
}
