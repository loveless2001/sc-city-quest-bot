const median=values=>{const a=[...values].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};

// A small temporal model learned from earlier screenshot recordings. Live
// paired-post measurements must confirm its alignment before it supplies any
// forward warning. Real visible obstacles are always retained.
export class BarrierForecast {
  constructor(model,{weakMatch=false}={}){this.model=model;this.weakMatch=weakMatch;this.reset();}
  reset(){this.origin=null;this.offset=0;this.samples=new Map();this.active=false;this.disabled=false;this.lastMatch=-Infinity;this.diagnostics={active:false};}
  update(tracks,now,late){
    if(!late){this.reset();return tracks;}
    if(this.origin===null)this.origin=now;
    if(this.disabled)return tracks;
    const rows=this.model.rows;
    for(const t of tracks){
      if(t.hits<6||t.pairedHits<3||t.y<320||t.y>450||now-t.seen>160)continue;
      const relative=t.impact-this.origin;
      const index=rows.reduce((best,row,i)=>Math.abs(relative-this.offset-row.time)<Math.abs(relative-this.offset-rows[best].time)?i:best,0);
      const row=rows[index],residual=relative-this.offset-row.time;
      if(Math.abs(residual)>150)continue;
      if(!row.lanes.includes(t.lane)){
        if(this.active&&t.hits>=8&&t.pairedHits>=5&&Math.abs(residual)<75){
          this.disabled=true;this.active=false;this.diagnostics={active:false,disabled:true,reason:'Live paired fence contradicts learned lane pattern',trackId:t.id,row:index};return tracks;
        }
        continue;
      }
      this.samples.set(t.id,{at:now,offset:relative-row.time,row:index});this.lastMatch=now;
    }
    for(const [id,s] of this.samples)if(now-s.at>2500)this.samples.delete(id);
    const samples=[...this.samples.values()],distinctRows=new Set(samples.map(s=>s.row)).size;
    if(samples.length>=3&&distinctRows>=2){
      const center=median(samples.map(s=>s.offset)),mad=median(samples.map(s=>Math.abs(s.offset-center)));
      if(mad<=30&&samples.every(s=>Math.abs(s.offset-center)<=140)){this.offset=center;this.active=true;}
    }
    if(now-this.lastMatch>1000)this.active=false;
    this.diagnostics={active:this.active,offset:this.offset,samples:samples.length,rows:distinctRows};
    if(!this.active)return tracks;
    const occupied=new Set();
    const adjusted=tracks.map(t=>{
      let index=rows.reduce((best,row,i)=>Math.abs(t.impact-this.origin-this.offset-row.time)<Math.abs(t.impact-this.origin-this.offset-rows[best].time)?i:best,0);
      let weakMatched=false;
      // A partly hidden fence can have a badly estimated base/time. When the
      // repeated pattern is confirmed live, associate a distant weak fit with
      // the nearest compatible lane row, while retaining the visible track.
      // Mature paired measurements continue to control alignment and fallback.
      if(this.weakMatch&&rows[index].extrapolated&&!rows[index].lanes.includes(t.lane)&&t.pairedHits<=2&&t.y<400){
        const candidates=rows.map((row,i)=>({i,error:Math.abs(t.impact-this.origin-this.offset-row.time)}))
          .filter(v=>rows[v.i].lanes.includes(t.lane)).sort((a,b)=>a.error-b.error);
        if(candidates[0]?.error<=330&&candidates[1]?.error-candidates[0].error>=30){index=candidates[0].i;weakMatched=true;}
      }
      const row=rows[index],impact=this.origin+this.offset+row.time;
      if(row.lanes.includes(t.lane)&&(Math.abs(t.impact-impact)<=150||weakMatched)){
        occupied.add(index+':'+t.lane);
        return {...t,impact,eta:impact-now,forecastAdjusted:true,visualImpact:t.impact,forecastRow:index,forecastExtrapolated:row.extrapolated||false,forecastWeakMatch:weakMatched};
      }
      return t;
    });
    for(let index=0;index<rows.length;index++){
      const row=rows[index],impact=this.origin+this.offset+row.time,eta=impact-now;
      if(eta< -100||eta>2100)continue;
      for(const lane of row.lanes)if(!occupied.has(index+':'+lane))adjusted.push({
        id:`forecast-${index}-${lane}`,lane,impact,eta,forecast:true,forecastRow:index,forecastExtrapolated:row.extrapolated||false,
        // These are predictions, never fabricated pixel detections.
        hits:0,pairedHits:0,y:null,seen:null
      });
    }
    return adjusted;
  }
}
