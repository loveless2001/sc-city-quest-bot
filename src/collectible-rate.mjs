// Fit inverse-depth motion across a time window, independent of capture rate.
export class CollectibleRate {
  constructor(){this.samples=[];this.rate=.000006;this.updated=0;}
  observe(target,time,height){
    if(!target||target.memory)return this.rate;
    const last=this.samples.at(-1),key=`${target.kind}:${target.lane}`;
    if(!last||last.key!==key||time-last.time>500||target.y<last.y-12)this.samples=[];
    this.samples.push({key,time,y:target.y,inverse:1/(target.y-height*.35)});
    this.samples=this.samples.filter(s=>time-s.time<=600).slice(-24);
    const slopes=[];
    for(let i=0;i<this.samples.length;i++)for(let j=i+1;j<this.samples.length;j++){
      const a=this.samples[i],b=this.samples[j],dt=b.time-a.time;
      const slope=(a.inverse-b.inverse)/dt;
      if(dt>=80&&slope>.000002&&slope<.00004)slopes.push(slope);
    }
    if(slopes.length){
      slopes.sort((a,b)=>a-b);
      const alpha=1-Math.exp(-Math.max(0,Math.min(100,time-this.updated))/200);
      this.rate=(1-alpha)*this.rate+alpha*slopes[slopes.length>>1];this.updated=time;
    }
    return this.rate;
  }
}
