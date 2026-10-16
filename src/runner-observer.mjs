// Shirt-colored connected components from rendered pixels only.
export function runnerCandidates(frame){
 const {width:w,height:h,data:d}=frame,x0=Math.floor(w/2-h*.28),y0=Math.floor(h*.39);
 const cols=Math.floor(h*.56/2),rows=Math.floor(h*.37/2),mask=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const i=((y0+y*2)*w+x0+x*2)*4,r=d[i],g=d[i+1],b=d[i+2];
  if(r<95&&g>18&&g<145&&b>80&&b>g*1.22&&b-r>43)mask[y*cols+x]=1;
 }
 const candidates=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;
  seen[p]=1;const queue=[p];let n=0,sx=0,sy=0,minX=cols,maxX=0,minY=rows,maxY=0;
  for(let j=0;j<queue.length;j++){
   const a=queue[j],x=a%cols,y=a/cols|0;n++;sx+=x;sy+=y;
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const [dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){
    const xx=x+dx,yy=y+dy,k=yy*cols+xx;
    if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!seen[k]&&mask[k]){seen[k]=1;queue.push(k);}
   }
  }
  const bw=(maxX-minX+1)*2,bh=(maxY-minY+1)*2,x=x0+sx/n*2,y=y0+sy/n*2;
  if(n>150&&bh>h*.035&&bw<h*.2&&bh>bw*.55&&Math.abs(x-w/2)<h*.235){
   const quality=n/(1+Math.abs(y-h*.608)*.04+Math.abs(bw-h*.075)*.08+Math.abs(bh-h*.114)*.04);
   candidates.push({x,y,n,bw,bh,quality,top:y0+minY*2});
  }
 }
 return candidates.sort((a,b)=>b.quality-a.quality);
}

export function runnerHeadSupport(frame,p){
 const {width:w,height:h,data:d}=frame;let best={hair:0,skin:0,support:0};
 // The avatar leans during lane changes; its head can be beside the shirt's
 // centroid. Require hair and neck support in the same small search window.
 for(const offset of[-.4,0,.4]){
  const cx=p.x+p.bw*offset;let hair=0,skin=0,n=0;
  for(let y=Math.max(0,Math.floor(p.top-p.bh*.38));y<Math.min(h,p.top+p.bh*.06);y++)
   for(let x=Math.max(0,Math.floor(cx-p.bw*.26));x<Math.min(w,cx+p.bw*.26);x++){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];n++;
    if(r<95&&g<95&&b<95&&Math.max(r,g,b)-Math.min(r,g,b)<45)hair++;
    if(r>90&&g>55&&b>20&&r>g*1.08&&g>b*1.08&&r-b>25)skin++;
   }
  const candidate={hair:hair/Math.max(1,n),skin:skin/Math.max(1,n)};
  candidate.support=Math.min(candidate.hair/.10,candidate.skin/.012);
  if(candidate.support>best.support)best={...candidate,offset};
 }
 return best;
}

export class RunnerObserver {
 constructor(){this.previous=null;}
 observe(frame,{at=Date.now(),lane=0,lastMove=-Infinity}={},candidates=runnerCandidates(frame)){
  const targetX=frame.width/2+lane*frame.height*.157;
  const previous=this.previous,dt=previous?at-previous.at:Infinity;
  // Follow visible motion; a command is only a weak prediction until the body
  // actually moves. This also tolerates a dropped key or an interrupted move.
  let expectedX=targetX;
  if(previous&&dt>=0&&dt<250){
   expectedX=previous.x;
   if(at-lastMove<180)expectedX+=Math.sign(targetX-previous.x)*Math.min(Math.abs(targetX-previous.x),dt*.60);
  }
  const supported=candidates.map(p=>({...p,head:runnerHeadSupport(frame,p)}));
  const headCandidates=supported.filter(p=>p.head.hair>.10&&p.head.skin>.012);
  // Blue advertisements have a shirt-like shape but lack a head above it.
  // Use motion only as a tie breaker, or as a fallback for an occluded head.
  const ranked=(headCandidates.length?headCandidates:supported).map(p=>({...p,
   observationQuality:p.quality*(headCandidates.length?Math.min(3,p.head.support):1)/(1+Math.abs(p.x-expectedX)*.012),expectedX,headConfirmed:headCandidates.length>0}));
  ranked.sort((a,b)=>b.observationQuality-a.observationQuality);
  const selected=ranked[0]||null;
  if(selected)this.previous={x:selected.x,y:selected.y,at};
  return selected;
 }
}
