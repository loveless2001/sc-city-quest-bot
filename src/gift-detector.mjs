import {giftProbability} from './gift-features.mjs';
// Candidate boxes from rendered blue components and nearby white marks.
export function giftCandidates(frame,camera,{small=false}={}){
 const {width:w,height:h,data:d}=frame,step=2,x0=Math.max(0,Math.floor(camera-h*.35)),y0=Math.floor(h*.405);
 const cols=Math.ceil(h*.70/step),rows=Math.ceil((h*.72-y0)/step),mask=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
 for(let yy=0;yy<rows;yy++)for(let xx=0;xx<cols;xx++){
  const x=x0+xx*step,y=y0+yy*step;if(x>=w||Math.abs(x-camera)>(y-h*.35)*1.05)continue;
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
  if(r<95&&g>25&&g<160&&b>70&&b>g*1.15&&b-r>40)mask[yy*cols+xx]=1;
 }
 const result=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;seen[p]=1;const queue=[p];let minX=cols,maxX=0,minY=rows,maxY=0,n=0;
  for(let j=0;j<queue.length;j++){
   const a=queue[j],x=a%cols,y=a/cols|0;n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){
    const xx=x+dx,yy=y+dy,k=yy*cols+xx;
    if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!seen[k]&&mask[k]){seen[k]=1;queue.push(k);}
   }
  }
  const bw=(maxX-minX+1)*step,bh=(maxY-minY+1)*step,x=x0+(minX+maxX)*step/2,top=y0+minY*step,y=top+bh/2;
  const normalized=(x-camera)/Math.max(10,(y-h*.35)*.72),lane=Math.round(normalized);
  if(n<(small?8:20)||bw<(small?6:10)||bh<(small?6:10)||bw/bh<.55||bw/bh>1.6||lane<-1||lane>1||Math.abs(normalized-lane)>.3)continue;
  const points=[];
  for(let py=Math.max(0,Math.floor(top-bh*.9));py<top-bh*.06;py++)
   for(let px=Math.max(0,Math.floor(x-bw*.38));px<Math.min(w,x+bw*.38);px++){
    const i=(py*w+px)*4,r=d[i],g=d[i+1],b=d[i+2];
    if(Math.min(r,g,b)>205&&Math.max(r,g,b)-Math.min(r,g,b)<35)points.push({x:px,y:py});
   }
  let white=null;
  if(points.length){
   const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),up=Math.min(...points.map(p=>p.y)),down=Math.max(...points.map(p=>p.y));
   white={n:points.length,x:(left+right)/2,y:(up+down)/2,bw:right-left+1,bh:down-up+1,fill:points.length/((right-left+1)*(down-up+1))};
  }
  result.push({kind:'gift',lane,x,y,top,bw,bh,near:y/h,fill:n*4/(bw*bh),white});
 }
 return result;
}

export function blueGifts(frame,camera,model,candidates=giftCandidates(frame,camera)){
 return candidates
  .filter(o=>o.bw/o.bh>=.70&&o.fill>=.50&&o.bw>=18&&o.bh>=16&&o.white?.n>=5)
  .map(o=>({...o,confidence:giftProbability(frame,o,model)}))
  .filter(o=>o.confidence>=(model.threshold??.70));
}

// Require a second approaching observation. Never emit unseen remembered boxes.
export class GiftTracker {
 constructor(){this.tracks=[];this.nextId=1;}
 update(objects,time){
  this.tracks=this.tracks.filter(t=>time-t.seen<=250);
  const used=new Set(),confirmed=[];
  for(const o of objects){
   let track=this.tracks.filter(t=>!used.has(t.id)&&t.lane===o.lane&&time>t.seen&&time-t.seen<=150
     &&o.y>=t.y-10&&o.y-t.y<Math.max(50,o.bh*1.5))
    .sort((a,b)=>Math.abs(o.y-a.y)-Math.abs(o.y-b.y))[0];
   if(!track){track={id:this.nextId++,hits:0};this.tracks.push(track);}
   used.add(track.id);Object.assign(track,{lane:o.lane,y:o.y,seen:time,hits:track.hits+1});
   if(track.hits>=2)confirmed.push({...o,giftTrack:track.id,sightings:track.hits});
  }
  return confirmed;
 }
}
