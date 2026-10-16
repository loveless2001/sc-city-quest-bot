const median=values=>{const a=[...values].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};

// Presentation timestamps can be recent even when a rendered scene is old.
// Infer extra image age only when multiple paired fences agree on the delay.
// This changes observation timing in the bot, never the game clock or state.
export class FenceFrameAge {
  constructor(allowSameLane=false){this.last=null;this.allowSameLane=allowSameLane;this.diagnostics={extraAgeMs:0};}
  estimate(fences,tracks,height,now,horizon=height*225/668){
    const samples=[],used=new Set();
    for(const f of fences.filter(f=>f.postFit&&f.y>=270&&f.y<=460)){
      const inverse=1/(f.y-horizon);
      const candidates=tracks.filter(t=>t.lane===f.lane&&!used.has(t.id)&&t.hits>=4&&t.pairedHits>=3
        &&t.y>=270&&t.y<480&&f.y>=t.y-5&&now-t.seen>=35&&now-t.seen<=450&&t.rate>.000002&&t.rate<.00008)
        .map(t=>({id:t.id,lane:t.lane,y:f.y,lag:now-t.seen-(t.inverse-inverse)/t.rate}))
        .filter(t=>t.lag>=-60&&t.lag<=450).sort((a,b)=>Math.abs(a.lag)-Math.abs(b.lag));
      if(candidates[0]){samples.push(candidates[0]);used.add(candidates[0].id);}
    }
    let extra=0;
    const distinctDepths=this.allowSameLane&&Math.max(...samples.map(s=>s.y))-Math.min(...samples.map(s=>s.y))>=40;
    if(samples.length>=2&&(new Set(samples.map(s=>s.lane)).size>=2||distinctDepths)){
      const center=median(samples.map(s=>s.lag));
      if(center>=100&&samples.every(s=>Math.abs(s.lag-center)<=45)){
        extra=center;this.last={at:now,lag:center};
      }else if(samples.some(s=>Math.abs(s.lag)<=60))this.last=null;
    }else if(samples.length===1&&this.last&&now-this.last.at<=160){
      const lag=samples[0].lag;
      if(lag>=100&&Math.abs(lag-this.last.lag)<=60)extra=lag;
      else if(Math.abs(lag)<=60)this.last=null;
    }
    this.diagnostics={extraAgeMs:extra,samples};return extra;
  }
}
