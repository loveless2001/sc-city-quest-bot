// A nearby fence can hide the lower half of another fence in the same lane.
// Recover depth only from paired upper posts, repeated interior bars, and a
// fully measured foreground fence. This is geometric screenshot evidence.
export function recoverRearFence(f,foreground,height,camera,interiorRows){
 const hy=height*.35;
 if(!f.postFit||f.bw<28||f.bh/f.bw<.28||f.bh/f.bw>=.64||interiorRows<4)return null;
 for(const g of foreground){
  if(g.lane!==f.lane||!g.postFit||g.rearFit||g.y<=f.y||g.bw<45)continue;
  const scale=g.bw/(g.y-hy);
  if(scale<.5||scale>.85||f.bw/g.bw<.4||f.bw/g.bw>.93)continue;
  const base=hy+f.bw/scale,top=f.y-f.bh,bh=base-top;
  if(base-f.y<8||g.y-base<18||base<g.y-g.bh||bh/f.bw<.64||bh/f.bw>1.1)continue;
  if(Math.abs(f.x-(camera+f.lane*(base-hy)*.60))>Math.max(8,f.bw*.18))continue;
  return {...f,y:base,bh,near:base/height,postFit:false,occludedFit:true,rearFit:true,visibleBase:f.y,foregroundBase:g.y};
 }
 return null;
}
