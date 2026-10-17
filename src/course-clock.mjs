// Derived from the publicly served game's constants. Only visible stage changes
// calibrate this clock. No live game objects, private state or API are read.
// Stage starts, the speed law and the letter-row interval come from the course
// model (endgame-v3-course.mjs; 2026-10-17 course: stages lengthened, speed caps
// that bind, letter rows 45.5 m apart instead of 35 m).
import {STAGE_START,LETTER_INTERVAL,timeAtDistance,distanceAtTime} from './endgame-v3-course.mjs';
export {timeAtDistance,distanceAtTime};
const stages=['Nhập cuộc','Tăng tốc 1','Tăng tốc 2','Tăng tốc 3','Về đích','Bứt phá'];
export function wordRowDistances(stage,length){
  const index=stages.indexOf(stage);if(index<1||index>3||length<2)return [];
  let z=STAGE_START[stage]+50;
  return Array.from({length},(_,i)=>{z+=LETTER_INTERVAL*(1-.6*i/(length-1));return z;});
}
export class CourseClock{
  constructor(){this.stage=null;this.samples=[];this.phase=null;}
  pause(){this.samples=[];this.phase=null;}
  observe(stage,now){
    if(stage===this.stage)return;this.stage=stage;const index=stages.indexOf(stage);
    if(index<=0)return;
    const sample=now-timeAtDistance(STAGE_START[stage])*1000;
    if(this.phase!==null&&Math.abs(sample-this.phase)>300)this.samples=[];
    this.samples.push(sample);const a=[...this.samples].sort((x,y)=>x-y);
    this.phase=(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;
  }
  distance(now){return this.phase===null?null:distanceAtTime((now-this.phase)/1000);}
  arrival(z){return this.phase===null?null:this.phase+timeAtDistance(z)*1000;}
}
