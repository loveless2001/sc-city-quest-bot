// Search each projected lane independently, so fences at different depths
// cannot merge into a single connected component across all three lanes.
export function laneFenceWindows(frame,camera,options={}) {
  const {width:w,height:h,data:d}=frame,hy=h*.35,found=[];
  const gray=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||x>=w||y<0||y>=h)return false;const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];return Math.max(r,g,b)-Math.min(r,g,b)<28&&(Math.max(r,g,b)<160||Math.min(r,g,b)>202);};
  for(const lane of [-1,0,1]){
    const candidates=[];
    for(let base=Math.round(h*(options.minNear??.415));base<h*(options.maxNear??.715);base+=3){
      const distance=base-hy,bw=distance*.72,bh=distance*.66,x=camera+lane*distance*.60;
      let rows=0,quality=0,lower=0;
      const columns=new Uint8Array(Math.ceil(bw*.86)+3),left=Math.round(x-bw*.43);
      for(const fraction of [.18,.30,.42,.54,.66]){
        const y=base-bh*fraction;let runs=0,run=0,covered=0;
        for(let px=Math.round(x-bw*.43);px<=x+bw*.43;px++){
          if(gray(px,y)){run++;covered++;columns[px-left]++;}
          else{if(run>=1&&run<bw*.14)runs++;run=0;}
        }
        if(run>=1&&run<bw*.14)runs++;
        if(runs>=5&&runs<=12&&covered/bw>.16&&covered/bw<.75){rows++;quality+=Math.min(8,runs);if(fraction<=.30)lower++;}
      }
      let verticalBars=0,innerBars=0,length=0;
      for(let ci=0;ci<columns.length;ci++){const votes=columns[ci];if(votes>=4)length++;else{if(length>=1&&length<bw*.14){verticalBars++;if(Math.abs(left+ci-length/2-x)<bw*.23)innerBars++;}length=0;}}
      if(rows>=3&&lower>=1&&verticalBars>=4&&innerBars>=2)candidates.push({kind:'gate',lane,x,y:base,bw,bh,fill:.4,near:base/h,quality:quality+rows*4+verticalBars*2,window:true});
    }
    const groups=[];
    for(const c of candidates){let group=groups.at(-1);if(!group||c.y-group.at(-1).y>9){group=[];groups.push(group);}group.push(c);}
    for(const group of groups){
      options.inspectGroup?.(group);
      // Prefer the best-supported location, then the lower edge of that peak.
      const top=Math.max(...group.map(c=>c.quality));
      const best=group.filter(c=>c.quality>=top-3).sort((a,b)=>b.y-a.y)[0];
      if(best.quality>=45)found.push(best);
      if(options.multiDepth&&best.quality>=45){
        // Close fences in one lane can create one continuous window response.
        // Offer a few separated hypotheses for strict paired-post validation.
        for(const c of group)if(c!==best&&c.quality>=45)found.push({...c,secondaryDepth:true});
      }
    }
  }
  return found;
}
