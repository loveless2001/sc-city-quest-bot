// Optional pixel-only detector for white-rimmed landmark pickups on the road.
export function goldBonuses(frame,camera,player){
 const {width:w,height:h,data:d}=frame,y0=Math.floor(h*.37),y1=Math.floor(h*.68),mask=new Uint8Array(w*(y1-y0)),seen=new Uint8Array(mask.length);
 for(let y=y0;y<y1;y++)for(let x=Math.max(0,Math.floor(camera-(y-h*.35)*1.05));x<Math.min(w,camera+(y-h*.35)*1.05);x++){
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
  if(r>90&&g>60&&g<225&&b<150&&r-g>8&&r-b>25)mask[(y-y0)*w+x]=1;
 }
 const objects=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;seen[p]=1;const q=[p];let minX=w,maxX=0,minY=y1,maxY=0;
  for(let j=0;j<q.length;j++){
   const k=q[j],x=k%w,y=Math.floor(k/w)+y0;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const xx=x+dx,yy=y+dy,idx=(yy-y0)*w+xx;
    if(xx>=0&&xx<w&&yy>=y0&&yy<y1&&!seen[idx]&&mask[idx]){seen[idx]=1;q.push(idx);}
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,x=(maxX+minX)/2,y=(maxY+minY)/2;
  if(q.length<15||bw<9||bh<9||bw/bh<.55||bw/bh>1.8||bw>h*.13)continue;
  const norm=(x-camera)/Math.max(10,(y-h*.35)*.72),lane=Math.round(norm);
  if(lane<-1||lane>1||Math.abs(norm-lane)>.28)continue;
  if(player&&Math.abs(x-player.x)<player.bw*.9&&Math.abs(y-player.y)<player.bh*1.15)continue;
  // Broad white-rim support tolerates the asymmetric building inside the ring.
  let rim=0,total=0;
  for(let yy=Math.max(0,Math.round(y-bh*.85));yy<Math.min(h,y+bh*.85);yy++)
   for(let xx=Math.max(0,Math.round(x-bw*.85));xx<Math.min(w,x+bw*.85);xx++){
    const i=(yy*w+xx)*4;rim+=Number(Math.min(d[i],d[i+1],d[i+2])>185);total++;
   }
  objects.push({kind:'bonus',lane,x,y,bw,bh,fill:q.length/(bw*bh),near:y/h,rim:rim/Math.max(1,total)});
 }
 return objects.filter(o=>o.rim>=.18);
}
