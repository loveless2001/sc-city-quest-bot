import {coneCandidates} from './soft-cones.mjs';

// Classify visible cone groups even when the runner overlaps their lane.
// Wide groups exclude narrow, edge-on bonus tokens that share the blue hue.
export function occludedCones(frame,camera,model){
 return coneCandidates(frame,camera,null,{...model,threshold:.55}).filter(o=>o.bh/o.bw<=.9&&o.y<frame.height*.60);
}

// Keep a short visual memory after the runner hides the cones. Nearby rails
// supply a motion estimate when a cone group has too few unobscured frames.
export class OccludedConeTracker {
 constructor(){this.tracks=[];this.nextId=1;this.rate=.000010;this.rateEstimates=[];}
 update(objects,height,time,now=time){
  const horizon=height*225/668,hit=1/(height*450/668-horizon),used=new Set();
  this.tracks=this.tracks.filter(t=>time-t.seen<(t.early?1200:650)&&(!t.impact||now<t.impact+100));
  for(const o of [...objects].sort((a,b)=>b.y-a.y)){
   const inverse=1/(o.y-horizon);
   let track=this.tracks.filter(t=>t.kind===o.kind&&t.lane===o.lane&&!used.has(t.id)&&o.y>=t.y-10)
    .map(t=>({t,error:Math.abs(inverse-(t.inverse-(t.rate||.000012)*(time-t.seen)))}))
    .filter(v=>v.error<.0035).sort((a,b)=>a.error-b.error)[0]?.t;
   if(!track){track={id:`cone-motion-${this.nextId++}`,kind:o.kind,lane:o.lane,history:[],hits:0};this.tracks.push(track);}
   used.add(track.id);track.history.push({at:time,inverse,y:o.y});track.history=track.history.filter(v=>time-v.at<=600).slice(-14);
   const slopes=[];
   for(let i=0;i<track.history.length;i++)for(let j=i+1;j<track.history.length;j++){
    const a=track.history[i],b=track.history[j],dt=b.at-a.at,rate=(a.inverse-b.inverse)/dt;
    if(dt>=70&&b.y>a.y+3&&rate>.000002&&rate<.00008)slopes.push(rate);
   }
   if(slopes.length){slopes.sort((a,b)=>a-b);track.rate=slopes[slopes.length>>1];this.rateEstimates.push({at:time,rate:track.rate});}
   track.early=track.early||Boolean(o.earlyCone);
   track.hits++;track.y=o.y;track.seen=time;track.inverse=inverse;track.confidence=o.confidence;
   if(track.rate)track.impact=time+(inverse-hit)/track.rate;
  }
  this.rateEstimates=this.rateEstimates.filter(r=>time-r.at<1000).slice(-50);
  if(this.rateEstimates.length>=3){const rates=this.rateEstimates.map(r=>r.rate).sort((a,b)=>a-b);this.rate=rates[rates.length>>1];}
  for(const t of this.tracks)if(!t.rate&&this.rateEstimates.length>=3)t.impact=t.seen+(t.inverse-hit)/this.rate;
  return this.tracks.filter(t=>t.kind==='cones'&&(t.hits>=2||!t.early&&t.confidence>=.8)
    &&(t.rate||this.rateEstimates.length>=3)&&t.impact>now-100&&t.impact<now+2000)
   .map(({history,...t})=>({...t,eta:t.impact-now,memory:!used.has(t.id)}));
 }
}
