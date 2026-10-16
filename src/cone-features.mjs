export function coneFeatures(frame,o){
 const {width:w,height:h,data:d}=frame,features=[];
 const x0=o.x-o.bw*.75,y0=o.y-o.bh*1.3,cw=o.bw*1.5,ch=o.bh*1.5;
 for(let gy=0;gy<10;gy++)for(let gx=0;gx<10;gx++){
  let r=0,g=0,b=0,n=0;
  for(let y=Math.max(0,Math.floor(y0+gy*ch/10));y<Math.min(h,Math.ceil(y0+(gy+1)*ch/10));y++)
   for(let x=Math.max(0,Math.floor(x0+gx*cw/10));x<Math.min(w,Math.ceil(x0+(gx+1)*cw/10));x++){
    const i=(y*w+x)*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;
   }
  features.push(r/Math.max(1,n)/255,g/Math.max(1,n)/255,b/Math.max(1,n)/255);
 }
 features.push(Math.min(2,o.bh/o.bw),Math.min(2,o.parts.length/3));return features;
}
export function coneProbability(frame,o,model){
 const f=coneFeatures(frame,o);let score=model.bias;
 for(let i=0;i<f.length;i++)score+=f[i]*model.weights[i];
 return 1/(1+Math.exp(-score));
}
