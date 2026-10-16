import {RunnerObserver} from './runner-observer.mjs';
import {WordClock} from './word-clock.mjs';

export class ManualHandoff {
  constructor(){this.observer=new RunnerObserver();this.previous=null;}
  observe(frame,at=Date.now()){
    const p=this.observer.observe(frame,{at});
    if(!p?.headConfirmed){this.previous=null;return null;}
    const lane=Math.max(-1,Math.min(1,Math.round((p.x-frame.width/2)/(frame.height*.157))));
    const previous=this.previous;this.previous={lane,x:p.x,at};
    if(!previous||previous.lane!==lane||at-previous.at<20||at-previous.at>200||Math.abs(p.x-previous.x)>12)return null;
    if(Math.abs(p.x-(frame.width/2+lane*frame.height*.157))>frame.height*.065)return null;
    return lane;
  }
}
export function prepareManualHandoff(pilot,lane,stage,at){
  pilot.commandLane=lane;pilot.lane=lane;pilot.lastMove=at;
  pilot.lastJump=at;pilot.lastAutoJump=at;pilot.stageText=stage;
  // Joining halfway through a stage is not a stage-boundary observation.
  // Wait for a real future boundary before using the public distance clock.
  if(pilot.publicWordClock){pilot.wordClock=new WordClock();pilot.wordClock.clock.stage=stage;pilot.wordClock.stage=stage;}
  return pilot;
}
