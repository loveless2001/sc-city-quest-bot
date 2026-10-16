import {letterProbability} from './letter-features.mjs';
// Extend recognition into the narrow strip above the normal pickup detector.
// Only strongly classified rendered green letters/coins become observations.
export function farGreenPickups(frame,camera,letterModel,coinModel){
 const {width:w,height:h,data:d}=frame,top=Math.floor(h*.365),bottom=Math.ceil(h*.445),left=Math.floor(camera-85),cols=170,rows=bottom-top;
 const mask=new Uint8Array(cols*rows),seen=new Uint8Array(mask.length),found=[];
 for(let yy=0;yy<rows;yy++)for(let xx=0;xx<cols;xx++){
  const x=left+xx,y=top+yy;if(x<0||x>=w||Math.abs(x-camera)>(y-h*.35)*.96)continue;
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(g>174&&r<130&&b<155&&g-r>65&&g-b>42)mask[yy*cols+xx]=1;
 }
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;seen[p]=1;const q=[p];let minX=cols,maxX=0,minY=rows,maxY=0;
  for(let i=0;i<q.length;i++){
   const k=q[i],x=k%cols,y=Math.floor(k/cols);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
    const xx=x+dx,yy=y+dy,j=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!seen[j]&&mask[j]){seen[j]=1;q.push(j);}
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,x=left+(minX+maxX)/2,y=top+(minY+maxY)/2,fill=q.length/(bw*bh);
  if(bw<5||bh<7||bw>26||bh>26||fill<.4||bw/bh<.35||bw/bh>1.5||y<=h*.38||y>h*.407)continue;
  const norm=(x-camera)/((y-h*.35)*.72),lane=Math.round(norm);if(Math.abs(lane)>1||Math.abs(norm-lane)>.25)continue;
  const o={kind:'green',lane,x,y,bw,bh,fill,near:y/h,far:true};
  o.letter=letterProbability(frame,o,letterModel);o.coin=letterProbability(frame,o,coinModel);
  // Thresholds reviewed on tiny real coin/letter crops from held recordings.
  if(o.letter>=.90||o.coin>=.85)found.push(o);
 }
 return found;
}
