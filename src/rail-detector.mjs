import {refineFencePosts} from './post-detector.mjs';
import {fenceInterior} from './fence-interior.mjs';
// Low-hurdle hypotheses from bright bars, paired posts, and sparse interiors.
export function railCandidates(frame,camera,{minNear=.42,maxNear=.80}={}){
 const {data:d,width:w,height:h}=frame,hy=h*225/668,found=[];
 const white=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||x>=w||y<0||y>=h)return false;
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];return Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<35;};
 for(const lane of [-1,0,1]){
  const candidates=[];
  for(let base=Math.round(h*minNear);base<h*maxNear;base+=3){
   const distance=base-hy,bw=distance*.55,bh=distance*.32,x=camera+lane*distance*.60;
   const rows=[];
   for(const fraction of [.90,.60,.30]){
    let best={coverage:0,longest:0,y:0};
    for(let dy=-2;dy<=2;dy++){
     const y=base-bh*fraction+dy;let n=0,covered=0,longest=0,run=0;
     for(let px=Math.round(x-bw*.43);px<=x+bw*.43;px++){
      n++;if(white(px,y)){covered++;run++;longest=Math.max(longest,run);}else run=0;
     }
     const coverage=covered/n;if(coverage>best.coverage)best={coverage,longest:longest/n,y};
    }
    rows.push(best);
   }
   const supported=rows.filter(r=>r.coverage>=.45&&r.longest>=.20);
   if(supported.length>=2&&rows.reduce((s,r)=>s+r.coverage,0)>=1.4){
    const quality=rows.reduce((s,r)=>s+r.coverage+r.longest*.3,0);
    candidates.push({kind:'rail',lane,x,y:base,top:base-bh,bw,bh,near:base/h,quality,rows});
   }
  }
  const groups=[];
  for(const o of candidates){let g=groups.at(-1);if(!g||o.y-g.at(-1).y>12){g=[];groups.push(g);}g.push(o);}
  for(const g of groups)found.push(g.sort((a,b)=>b.quality-a.quality)[0]);
 }
 return found;
}

export function lowRails(frame,camera,{posts=false,partial=false}={}){
 const found=[];
 for(const o of railCandidates(frame,camera).filter(o=>partial||o.rows.every(r=>r.coverage>=.4&&r.longest>=.25)).sort((a,b)=>b.quality-a.quality)){
  const refined=posts?refineFencePosts(frame,o,{strict:true}):o;
  if(posts&&(!refined.postFit||refined.bh/refined.bw>.75||refined.bh/refined.bw<.35))continue;
  if(partial&&(refined.bw<35||fenceInterior(frame,refined).rows>=3))continue;
  if(found.some(g=>g.lane===refined.lane&&Math.abs(g.y-refined.y)<Math.max(g.bh,refined.bh)*.65))continue;
  found.push({...refined,confidence:Math.min(1,o.quality/3.5)});
 }
 return found.sort((a,b)=>b.y-a.y);
}
