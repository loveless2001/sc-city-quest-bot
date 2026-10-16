// Pixel-only features shared by offline training and live inference.
export function letterFeatures(frame,o) {
  const {width:w,height:h,data:d}=frame;
  const side=Math.max(o.bw,o.bh)*1.7;
  const x0=Math.max(0,Math.round(o.x-side/2)),y0=Math.max(0,Math.round(o.y-side/2));
  const x1=Math.min(w,Math.round(o.x+side/2)),y1=Math.min(h,Math.round(o.y+side/2));
  const f=[];
  for(let gy=0;gy<8;gy++)for(let gx=0;gx<8;gx++){
    let r=0,g=0,b=0,n=0;
    for(let y=Math.floor(y0+gy*(y1-y0)/8);y<Math.max(Math.floor(y0+(gy+1)*(y1-y0)/8),Math.floor(y0+gy*(y1-y0)/8)+1);y++)
      for(let x=Math.floor(x0+gx*(x1-x0)/8);x<Math.max(Math.floor(x0+(gx+1)*(x1-x0)/8),Math.floor(x0+gx*(x1-x0)/8)+1);x++){
        const i=(Math.min(h-1,y)*w+Math.min(w-1,x))*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;
      }
    f.push(r/n/255,g/n/255,b/n/255);
  }
  f.push(o.bw/o.bh/2,o.fill);
  return f;
}

export function letterProbability(frame,o,model) {
  const f=letterFeatures(frame,o);
  let sum=model.bias;
  for(let j=0;j<model.weights.length;j++)sum+=f[j]*model.weights[j];
  return 1/(1+Math.exp(-sum));
}
