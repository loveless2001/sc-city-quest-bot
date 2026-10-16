// Refine a barcode-window hypothesis against the fence's solid dark posts.
// The template window itself is not a reliable ground-contact measurement.
export function refineFencePosts(frame,f,options={}){
  const {width:w,height:h,data:d}=frame;
  const top=Math.max(0,Math.floor(f.y-f.bh*1.20)),bottom=Math.min(h-1,Math.ceil(f.y+f.bh*.45));
  const dark=(x,y)=>{const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];return r<112&&g<112&&b<115&&Math.max(r,g,b)-Math.min(r,g,b)<35;};
  const side=sign=>{
    const xs=[f.x+sign*f.bw*.22,f.x+sign*f.bw*.64].sort((a,b)=>a-b),found=[];
    for(let x=Math.max(0,Math.floor(xs[0]));x<=Math.min(w-1,Math.ceil(xs[1]));x++){
      let start=-1,last=-1,gaps=0;
      const finish=()=>{
        if(start<0)return;
        const length=last-start+1;
        if(length>=Math.max(6,f.bh*.35))found.push({x,start,end:last,length});
      };
      for(let y=top;y<=bottom;y++){
        if(dark(x,y)){if(start<0)start=y;last=y;gaps=0;}
        else if(start>=0&&++gaps>1){finish();start=-1;}
      }
      finish();
    }
    return found.sort((a,b)=>b.length-a.length).slice(0,12);
  };
  const left=side(-1),right=side(1);let best=null;
  for(const a of left)for(const b of right){
    const width=b.x-a.x,delta=Math.abs(a.end-b.end),startDelta=Math.abs(a.start-b.start);
    if(width<f.bw*.60||width>f.bw*1.3||delta>Math.max(5,f.bh*.14)||startDelta>(options.strict?Math.max(4,f.bh*.14):f.bh*.35))continue;
    const score=a.length+b.length-delta*2-startDelta;
    if(!best||score>best.score)best={a,b,score};
  }
  if(!best)return {...f,postFit:false};
  const y=(best.a.end+best.b.end)/2+2,x=(best.a.x+best.b.x)/2;
  return {...f,windowY:f.y,x,y,bw:best.b.x-best.a.x+4,bh:y-Math.min(best.a.start,best.b.start),near:y/h,postFit:true,postStartDelta:Math.abs(best.a.start-best.b.start)};
}
