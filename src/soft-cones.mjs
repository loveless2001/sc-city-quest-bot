import {blueCones} from './cone-detector.mjs';
import {coneProbability} from './cone-features.mjs';

export function coneCandidates(frame,camera,player,model){
 const {data:d,width:w,height:h}=frame;
 return blueCones(frame,camera,player).filter(o=>o.bw>=18&&o.bh>=10).map(o=>{
  let white=0,n=0;
  for(let y=Math.max(0,Math.round(o.y-o.bh*1.15));y<Math.min(h,o.y+o.bh*.1);y++)
   for(let x=Math.max(0,Math.round(o.x-o.bw*.65));x<Math.min(w,o.x+o.bw*.65);x++){
    const i=(y*w+x)*4,lo=Math.min(d[i],d[i+1],d[i+2]),hi=Math.max(d[i],d[i+1],d[i+2]);
    white+=Number(lo>165&&hi-lo<50);n++;
   }
  return {...o,whiteSupport:white/Math.max(1,n),confidence:coneProbability(frame,o,model)};
 }).filter(o=>o.whiteSupport>.035&&o.confidence>=model.threshold);
}

export class SoftConeTracker {
 constructor(){this.tracks=[];this.nextId=1;}
 update(objects,height,time,now=time){
  const horizon=height*225/668,hit=1/(height*.75-horizon),used=new Set();
  this.tracks=this.tracks.filter(t=>time-t.seen<350&&(!t.impact||time<t.impact+150));
  for(const o of [...objects].sort((a,b)=>b.y-a.y)){
   const inverse=1/(o.y-horizon);
   let track=this.tracks.filter(t=>t.lane===o.lane&&!used.has(t.id)&&o.y>=t.y-8)
    .map(t=>({t,error:Math.abs(inverse-(t.inverse-(t.rate||.000015)*(time-t.seen)))}))
    .filter(v=>v.error<.004).sort((a,b)=>a.error-b.error)[0]?.t;
   if(!track){track={id:this.nextId++,lane:o.lane,history:[],hits:0};this.tracks.push(track);}
   used.add(track.id);track.history.push({at:time,inverse,y:o.y});track.history=track.history.filter(v=>time-v.at<450).slice(-10);
   track.hits++;track.y=o.y;track.seen=time;track.inverse=inverse;track.confidence=o.confidence;
   const slopes=[];
   for(let i=0;i<track.history.length;i++)for(let j=i+1;j<track.history.length;j++){
    const a=track.history[i],b=track.history[j],dt=b.at-a.at,rate=(a.inverse-b.inverse)/dt;
    if(dt>=50&&b.y-a.y>=3&&rate>.000002&&rate<.00008)slopes.push(rate);
   }
   if(slopes.length){slopes.sort((a,b)=>a-b);track.rate=slopes[slopes.length>>1];track.impact=time+(inverse-hit)/track.rate;}
  }
  return this.tracks.filter(t=>t.hits>=3&&t.rate&&time-t.seen<200&&t.impact>now-150)
   .map(({history,...t})=>({...t,eta:t.impact-now}));
 }
}
