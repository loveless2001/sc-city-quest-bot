// Screenshot-only motion tracks. Pickup values are planning preferences.
export class PickupEvents {
 constructor({letterValue=25,giftMemoryMs=350,greenValue=15,whiteValue=5,orbitValue=10,bonusValue=100}={}){this.tracks=[];this.nextId=1;this.rate=.000006;this.letterValue=letterValue;this.giftMemoryMs=giftMemoryMs;this.greenValue=greenValue;this.whiteValue=whiteValue;this.orbitValue=orbitValue;this.bonusValue=bonusValue;}
 update(objects,height,time,now=time){
  const horizon=height*.35,hit=1/(height*.68-horizon),used=new Set();
  this.tracks=this.tracks.filter(t=>time-t.seen<(t.kind==='gift'?Math.max(450,this.giftMemoryMs):450)&&(!t.impact||now<t.impact+100));
  const rates=[];
  for(const o of [...objects].sort((a,b)=>b.y-a.y)){
   const inverse=1/(o.y-horizon);
   const kind=o.kind==='gift'?'gift':o.kind==='bonus'?'bonus':o.kind==='orbit'?'orbit':o.letter>=.65?'letter':o.coin>=.65?'green':'white';
   let track=this.tracks.filter(t=>t.lane===o.lane&&t.kind===kind&&!used.has(t.id)&&o.y>=t.y-12)
    .map(t=>({t,error:Math.abs(inverse-(t.inverse-(t.rate||this.rate)*(time-t.seen)))}))
    .filter(v=>v.error<.004).sort((a,b)=>a.error-b.error)[0]?.t;
   if(!track){track={id:this.nextId++,kind,lane:o.lane,history:[],hits:0};this.tracks.push(track);}
   used.add(track.id);track.history.push({at:time,inverse,y:o.y,far:Boolean(o.far)});
   track.history=track.history.filter(v=>time-v.at<=600).slice(-16);
   const slopes=[];
   for(let i=0;i<track.history.length;i++)for(let j=i+1;j<track.history.length;j++){
    const a=track.history[i],b=track.history[j],dt=b.at-a.at,rate=(a.inverse-b.inverse)/dt;
    if(!a.far&&!b.far&&dt>=80&&b.y>a.y+2&&rate>.000002&&rate<.00004)slopes.push(rate);
   }
   if(slopes.length){slopes.sort((a,b)=>a-b);track.rate=slopes[slopes.length>>1];rates.push(track.rate);}
   track.hits++;track.object=o;track.y=o.y;track.seen=time;track.inverse=inverse;
   track.impact=time+(inverse-hit)/(track.rate||this.rate);
  }
  if(rates.length){rates.sort((a,b)=>a-b);this.rate=.9*this.rate+.1*rates[rates.length>>1];}
  const candidates=this.tracks.filter(t=>t.hits>=2&&(time-t.seen<150||t.hits>=3&&t.rate&&time-t.seen<(t.kind==='gift'?this.giftMemoryMs:350)))
   .map(t=>({id:t.id,kind:t.kind,lane:t.lane,eta:t.impact-now,value:t.kind==='bonus'||t.kind==='gift'?this.bonusValue:t.kind==='letter'?this.letterValue:t.kind==='green'?this.greenValue:t.kind==='orbit'?this.orbitValue:this.whiteValue,
    seen:t.seen,y:t.y,rate:t.rate||this.rate,memory:!used.has(t.id),object:t.object}));
  const events=[];
  for(const t of candidates.sort((a,b)=>b.value-a.value)){
   if(t.eta<0||t.eta>2100||events.some(e=>e.lane===t.lane&&Math.abs(e.eta-t.eta)<90))continue;
   events.push(t);
  }
  return events.sort((a,b)=>a.eta-b.eta);
 }
}

export function pickupCredit(events,lane,start,end,entry=start){
 // Half-open intervals award a pickup once, at a time the lane is occupied.
 return events.filter(e=>e.lane===lane&&e.eta>start&&e.eta<=end&&e.eta>=entry)
  .reduce((sum,e)=>sum+e.value*Math.exp(-e.eta/1800),0);
}
