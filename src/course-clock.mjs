// Derived from the publicly served game's constants. Only visible stage changes
// calibrate this clock. No live game objects, private state or API are read.
const stages=['Nhập cuộc','Tăng tốc 1','Tăng tốc 2','Tăng tốc 3','Về đích','Bứt phá'];
const boundaries=[0,500,1100,1700,2300,2600];
const rampSeconds=Math.log(50/32)/.045;
export function timeAtDistance(z){
  if(z<=2600)return (Math.sqrt(400+.24*Math.max(0,z))-20)/.12;
  if(z<=3000)return 100+Math.log(1+.045*(z-2600)/32)/.045;
  return 100+rampSeconds+(z-3000)/50;
}
export function distanceAtTime(t){
  if(t<=100)return 20*t+.06*t*t;
  if(t<=100+rampSeconds)return 2600+32/.045*Math.expm1(.045*(t-100));
  return 3000+50*(t-100-rampSeconds);
}
export function wordRowDistances(stage,length){
  const index=stages.indexOf(stage);if(index<1||index>3||length<2)return [];
  let z=boundaries[index]+50;
  return Array.from({length},(_,i)=>{z+=35*(1-.6*i/(length-1));return z;});
}
export class CourseClock{
  constructor(){this.stage=null;this.samples=[];this.phase=null;}
  pause(){this.samples=[];this.phase=null;}
  observe(stage,now){
    if(stage===this.stage)return;this.stage=stage;const index=stages.indexOf(stage);
    if(index<=0)return;
    const sample=now-timeAtDistance(boundaries[index])*1000;
    if(this.phase!==null&&Math.abs(sample-this.phase)>300)this.samples=[];
    this.samples.push(sample);const a=[...this.samples].sort((x,y)=>x-y);
    this.phase=(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;
  }
  distance(now){return this.phase===null?null:distanceAtTime((now-this.phase)/1000);}
  arrival(z){return this.phase===null?null:this.phase+timeAtDistance(z)*1000;}
}
