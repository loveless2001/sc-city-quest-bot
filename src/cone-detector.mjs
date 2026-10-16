// Offline prototype: group the blue cone silhouettes visible on the road.
export function blueCones(frame,camera,player){
 const {width:w,height:h,data:d}=frame,step=2,y0=Math.floor(h*.395),y1=Math.floor(h*.77),cols=Math.ceil(w/step),rows=Math.ceil((y1-y0)/step),mask=new Uint8Array(cols*rows),seen=new Uint8Array(mask.length);
 for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
  const x=gx*step,y=y0+gy*step;
  if(Math.abs(x-camera)>(y-h*.35)*.84)continue;
  const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
  if(b>70&&r<100&&g<120&&b-r>35&&b-g>25)mask[gy*cols+gx]=1;
 }
 const blobs=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;seen[p]=1;const q=[p];let ax=cols,bx=0,ay=rows,by=0;
  for(let j=0;j<q.length;j++){
   const k=q[j],x=k%cols,y=Math.floor(k/cols);ax=Math.min(ax,x);bx=Math.max(bx,x);ay=Math.min(ay,y);by=Math.max(by,y);
   for(let dy=-3;dy<=3;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy,i=yy*cols+xx;
    if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&mask[i]&&!seen[i]){seen[i]=1;q.push(i);}
   }
  }
  const bw=(bx-ax+1)*step,bh=(by-ay+1)*step,x=(ax+bx)*step/2,y=y0+by*step;
  if(q.length<3||bw<2||bw>35||bh<4||bh>60||bh/bw<.8||bh/bw>5)continue;
  if(player&&Math.abs(x-player.x)<player.bw*.85&&Math.abs(y-bh/2-player.y)<player.bh*.9)continue;
  const norm=(x-camera)/Math.max(10,(y-h*.35)*.6),lane=Math.round(norm);
  if(lane<-1||lane>1||Math.abs(norm-lane)>.42)continue;
  blobs.push({x,y,bw,bh,lane});
 }
 const groups=[];
 for(const b of blobs.sort((a,b)=>a.y-b.y)){
  let g=groups.find(g=>g.lane===b.lane&&Math.abs(g.y-b.y)<Math.max(5,b.bh*.25));
  if(!g){g={lane:b.lane,y:b.y,parts:[]};groups.push(g);}g.parts.push(b);g.y=g.parts.reduce((s,p)=>s+p.y,0)/g.parts.length;
 }
 return groups.filter(g=>g.parts.length>=2&&Math.max(...g.parts.map(p=>p.x))-Math.min(...g.parts.map(p=>p.x))>Math.max(...g.parts.map(p=>p.bw))*1.1)
  .map(g=>({...g,kind:'cones',x:g.parts.reduce((s,p)=>s+p.x,0)/g.parts.length,y:Math.max(...g.parts.map(p=>p.y))+2,bw:Math.max(...g.parts.map(p=>p.x+p.bw/2))-Math.min(...g.parts.map(p=>p.x-p.bw/2)),bh:Math.max(...g.parts.map(p=>p.bh)),near:g.y/h}));
}
