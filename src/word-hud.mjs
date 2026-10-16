// Offline recognition of visible progress cells; no game-state reads.
export function wordHud(frame){
 const {data:d,width:w}=frame,x0=185,y0=125,cols=500,rows=75,mask=new Uint8Array(cols*rows),seen=new Uint8Array(mask.length);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const i=((y+y0)*w+x+x0)*4,r=d[i],g=d[i+1],b=d[i+2];
  if(g>170&&g-r>50&&g-b>45&&r<150&&b<160)mask[y*cols+x]=1;
  else if(b>130&&r<80&&g<100&&b-r>75&&b-g>60)mask[y*cols+x]=2;
 }
 const cells=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;
  seen[p]=1;const q=[p];let minX=cols,maxX=0,minY=rows,maxY=0,green=0;
  for(let j=0;j<q.length;j++){
   const k=q[j],x=k%cols,y=Math.floor(k/cols);green+=Number(mask[k]===1);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy,idx=yy*cols+xx;
    if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&mask[idx]&&!seen[idx]){seen[idx]=1;q.push(idx);}
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1;
  if(bw>=13&&bw<=28&&bh>=13&&bh<=28&&q.length/(bw*bh)>.5)
   cells.push({x:x0+minX,y:y0+minY,bw,bh,green:green/q.length>.6});
 }
 const grouped=[];
 for(const cell of cells){
  let row=grouped.find(r=>Math.abs(r[0].y-cell.y)<4);
  if(!row){row=[];grouped.push(row);}row.push(cell);
 }
 const found=grouped.filter(row=>row.length>=3).flat().sort((a,b)=>a.y-b.y||a.x-b.x);
 return {cells:found,collected:found.filter(c=>c.green).length,total:found.length};
}

export class WordHudTracker {
 constructor(){this.stage=null;this.layout=[];this.started=0;}
 update(frame,stage,time){
  if(stage!==this.stage){this.stage=stage;this.layout=[];this.started=time;}
  if(time-this.started<2500){
   const detected=wordHud(frame);
   if(detected.total>this.layout.length)this.layout=detected.cells.map(c=>({...c}));
  }
  const {data:d,width:w}=frame;
  const cells=this.layout.map(c=>{
   let green=0,blue=0,n=0;
   for(let y=c.y+1;y<c.y+c.bh-1;y++)for(let x=c.x+1;x<c.x+c.bw-1;x++){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];n++;
    green+=Number(g>170&&g-r>50&&g-b>45&&r<150&&b<160);
    blue+=Number(b>130&&r<80&&g<100&&b-r>75&&b-g>60);
   }
   return {...c,visible:(green+blue)/n>.4,green:green/Math.max(1,green+blue)>.65};
  });
  const visible=cells.length>=3&&cells.filter(c=>c.visible).length/cells.length>.75;
  return {visible,total:cells.length,collected:cells.filter(c=>c.visible&&c.green).length,cells};
 }
}
