// Low hurdles are a secondary cost. They never exclude a hard-fence escape.
export class SoftRailTracker {
 constructor(impactPixels=450){this.tracks=[];this.nextId=1;this.impactRatio=impactPixels/668;}
 update(objects,height,time,now=time){
  const horizon=height*225/668,hit=1/(height*this.impactRatio-horizon),used=new Set();
  this.tracks=this.tracks.filter(t=>time-t.seen<650&&(!t.impact||now<t.impact+100));
  for(const o of [...objects].sort((a,b)=>b.y-a.y)){
   const inverse=1/(o.y-horizon);
   let track=this.tracks.filter(t=>t.lane===o.lane&&!used.has(t.id)&&o.y>=t.y-10)
    .map(t=>({t,error:Math.abs(inverse-(t.inverse-(t.rate||.000012)*(time-t.seen)))}))
    .filter(v=>v.error<.0035).sort((a,b)=>a.error-b.error)[0]?.t;
   if(!track){track={id:`rail-${this.nextId++}`,kind:'rail',lane:o.lane,history:[],hits:0};this.tracks.push(track);}
   used.add(track.id);track.history.push({at:time,inverse,y:o.y});track.history=track.history.filter(v=>time-v.at<=600).slice(-14);
   const slopes=[];
   for(let i=0;i<track.history.length;i++)for(let j=i+1;j<track.history.length;j++){
    const a=track.history[i],b=track.history[j],dt=b.at-a.at,rate=(a.inverse-b.inverse)/dt;
    if(dt>=70&&b.y>a.y+3&&rate>.000002&&rate<.00008)slopes.push(rate);
   }
   if(slopes.length){slopes.sort((a,b)=>a-b);track.rate=slopes[slopes.length>>1];}
   track.hits++;track.y=o.y;track.seen=time;track.inverse=inverse;
   if(track.rate)track.impact=time+(inverse-hit)/track.rate;
  }
  return this.tracks.filter(t=>t.hits>=3&&t.rate&&t.impact>now-100&&t.impact<now+2000)
   .map(({history,...t})=>({...t,eta:t.impact-now,memory:!used.has(t.id)}));
 }
}
