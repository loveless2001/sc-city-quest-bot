// SC City Quest: screenshot-only track controller.
// Priority: avoid game-ending fences, then collect letters and coins.
// Calibrated for the default blue runner at 870 x 668. No game-state access.

class ScreenScanner {
  constructor() {
    this.lane=0; this.lastMove=-Infinity; this.lastJump=-Infinity;
    this.targetLane=null; this.targetUntil=0; this.camera=NaN;
  }
analyse(frame,now=Date.now()){
    const {width:w,height:h,data:d}=frame;
    const rgb=(x,y)=>{let i=((y|0)*w+(x|0))*4;return[d[i]||0,d[i+1]||0,d[i+2]||0];};
    let L=0,R=w-1;while(L<w/2&&Math.max(...rgb(L,h*.18))<22)L++;while(R>w/2&&Math.max(...rgb(R,h*.18))<22)R--;
    const gw=R-L+1,hy=h*.35,lw=y=>Math.max(10,(y-hy)*.60);let cx=L+gw*(.5-(this.cameraLane??this.lane)*.067);
    const centres=[];
    for(let y=h*.56;y<h*.69;y+=h*.025){const half=lw(y)*.5;let pair=[];for(const side of[-1,1]){let best=null,dist=Infinity;for(let x=cx+side*half-lw(y)*.2;x<cx+side*half+lw(y)*.2;x++){const[r,g,b]=rgb(x,y);if(r>215&&g>215&&b>215&&Math.max(r,g,b)-Math.min(r,g,b)<24&&Math.abs(x-(cx+side*half))<dist){best=x;dist=Math.abs(x-(cx+side*half));}}pair.push(best);}if(pair[0]!==null&&pair[1]!==null)centres.push((pair[0]+pair[1])/2);}
    if(centres.length>=3){centres.sort((a,b)=>a-b);cx=centres[centres.length>>1];}this.camera=cx;
    const step=2,x0=Math.max(L,Math.floor(cx-gw*.48)),y0=Math.floor(h*.397),cols=Math.ceil(gw*.96/step),rows=Math.ceil((h*.68-y0)/step);
    const mask=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
    for(let gy=0;gy<rows;gy++){let y=y0+gy*step;for(let gx=0;gx<cols;gx++){let x=x0+gx*step;if(x>=R||Math.abs(x-cx)>lw(y)*1.58)continue;const[r,g,b]=rgb(x,y);if(g>174&&r<130&&b<155&&g-r>65&&g-b>42)mask[gy*cols+gx]=1;else if(r>214&&g>214&&b>214&&Math.max(r,g,b)-Math.min(r,g,b)<32)mask[gy*cols+gx]=2;}}
    const objects=[];
    for(let p=0;p<mask.length;p++){if(!mask[p]||seen[p])continue;const type=mask[p],queue=[p];seen[p]=1;let count=0,minX=cols,maxX=0,minY=rows,maxY=0;for(let qi=0;qi<queue.length;qi++){let a=queue[qi],x=a%cols,y=Math.floor(a/cols);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){let xx=x+dx,yy=y+dy,n=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!seen[n]&&mask[n]===type){seen[n]=1;queue.push(n);}}}
      let bw=(maxX-minX+1)*step,bh=(maxY-minY+1)*step,x=x0+(minX+maxX)*step/2,y=y0+(minY+maxY)*step/2,fill=count*step*step/(bw*bh),norm=(x-cx)/(lw(y)*1.20),lane=Math.round(norm);
      if(count<7||bh<7||bw<4||lane<-1||lane>1||Math.abs(norm-lane)>.37||bw/bh<.25||bw/bh>2.0||fill<(type===1?.32:.42))continue;
      if(type===1&&bw<7&&bh<11)continue;
      objects.push({kind:type===1?'green':'coin',lane,x,y,bw,bh,fill,near:y/h});
    }
    const jumping=now-this.lastJump<800;
    const lanes=[-1,0,1].map(lane=>{let risk=0,peak=0,count=0,nearRisk=0;
      for(let y=h*.425;y<h*.502;y+=h*.009){if(jumping&&lane===this.lane)continue;let n=0,bad=0,green=0;for(let x=cx+lane*lw(y)-lw(y)*.32;x<cx+lane*lw(y)+lw(y)*.32;x+=2){const[r,g,b]=rgb(x,y);n++;if(r<112&&g<128&&b<157&&b-r<66)bad++;if(g>175&&g-r>65&&g-b>42)green++;}let density=bad/Math.max(1,n);if(green/Math.max(1,n)>.18)density*=.2;peak=Math.max(peak,density);risk+=density;count++;if(y>h*.46)nearRisk=Math.max(nearRisk,density);}
      return{lane,risk:risk/Math.max(1,count),peak,nearRisk};});
    return {objects, lanes, camera:cx};
  }
}

class ScoringPilot extends ScreenScanner {
  constructor() {
    super(); this.aim=null; this.aimUntil=0; this.lastAimY=0;
    this.lastSeenPlayer=0;
  }
player(frame){const{width:w,height:h,data:d}=frame;const x0=Math.floor(w/2-h*.28),y0=Math.floor(h*.39),cols=Math.floor(h*.56/2),rows=Math.floor(h*.37/2),m=new Uint8Array(cols*rows),s=new Uint8Array(cols*rows);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=((y0+y*2)*w+x0+x*2)*4,r=d[i],g=d[i+1],b=d[i+2];if(r<95&&g>18&&g<145&&b>80&&b>g*1.22&&b-r>43)m[y*cols+x]=1;}let candidates=[];for(let p=0;p<m.length;p++){if(!m[p]||s[p])continue;s[p]=1;const q=[p];let n=0,sx=0,sy=0,mnx=cols,mxx=0,mny=rows,mxy=0;for(let j=0;j<q.length;j++){let a=q[j],x=a%cols,y=a/cols|0;n++;sx+=x;sy+=y;mnx=Math.min(mnx,x);mxx=Math.max(mxx,x);mny=Math.min(mny,y);mxy=Math.max(mxy,y);for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){let xx=x+dx,yy=y+dy,k=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!s[k]&&m[k]){s[k]=1;q.push(k);}}}let bw=(mxx-mnx+1)*2,bh=(mxy-mny+1)*2,x=x0+sx/n*2,y=y0+sy/n*2;if(n>150&&bh>h*.035&&bw<h*.20&&bh>bw*.55&&Math.abs(x-w/2)<h*.235)candidates.push({x,y,n,bw,bh});}return candidates.sort((a,b)=>b.n-a.n)[0]||null;}
analyse(frame,now=Date.now()){
 const player=this.player(frame),mid=frame.width/2,spacing=frame.height*.184;
 const timing={lastMove:this.lastMove,lastJump:this.lastJump,targetLane:this.targetLane,targetUntil:this.targetUntil};
 let observed=player?Math.max(-1,Math.min(1,Math.round((player.x-mid)/spacing))):this.lane;
 if(player)this.lastSeenPlayer=now;this.lane=observed;
 let dec=super.analyse(frame,now);Object.assign(this,timing);this.lane=observed;
 const lanes=dec.lanes,current=lanes[observed+1],keys=[];
 const viable=dec.objects.filter(o=>o.near>.409&&o.near<.715&&Math.abs((o.x-dec.camera)/((o.y-frame.height*.35)*.60*1.2)-o.lane)<.24);
 const letters=viable.filter(o=>o.kind==='green'&&o.fill>.54&&o.bw/o.bh>.60&&o.bw/o.bh<1.45&&o.bh>10).sort((a,b)=>b.y-a.y);
 const coins=viable.filter(o=>o.near<.63).sort((a,b)=>b.y-a.y);
 let target=letters[0]||coins[0]||null;
 if(target){if(this.aimUntil>now&&this.aim!==null&&target.lane!==this.aim&&target.y<this.lastAimY-frame.height*.045){target=null;}else{this.aim=target.lane;this.lastAimY=target.y;this.aimUntil=now+(target.near>.5?350:120);}}
 let desired=target?target.lane:(this.aimUntil>now?this.aim:observed);
 let followingLetters=letters.length>0;
 if(!followingLetters&&current.nearRisk>.5&&current.risk>.08){let best=[...lanes].sort((a,b)=>(a.risk*2+a.nearRisk*.5+Math.abs(a.lane-observed)*.035)-(b.risk*2+b.nearRisk*.5+Math.abs(b.lane-observed)*.035))[0];if(best.risk<current.risk*.65||best.nearRisk<current.nearRisk*.5)desired=best.lane;}
 if(desired!==observed&&now-this.lastMove>180){let step=Math.sign(desired-observed);keys.push(step<0?'ArrowLeft':'ArrowRight');this.lane=observed+step;this.lastMove=now;}
 if(!followingLetters&&keys.length===0&&current.nearRisk>.65&&now-this.lastJump>1050){keys.push('ArrowUp');this.lastJump=now;}
 return{...dec,keys,lane:this.lane,observedLane:observed,player,target,followingLetters};
}
}

class StableScoringPilot extends ScoringPilot {
analyse(frame,now=Date.now()){const last=this.lastMove;const dec=super.analyse(frame,now);if(now-last<430&&dec.keys.some(k=>k!=='ArrowUp')){dec.keys=dec.keys.filter(k=>k==='ArrowUp');this.lastMove=last;this.lane=dec.observedLane;dec.lane=this.lane;}return dec;}
}

export class VisionPilot extends StableScoringPilot {
  constructor() {
    super(); this.reactionMs=400; this.frameMs=200; this.previousFrame=0;
    this.pendingMove=null; this.calibration=[]; this.stageText='';
    this.fenceMemory=[];
  }
  resumeAfterPuzzle() {
    this.previousFrame=0; this.pendingMove=null; this.fenceMemory=[];
    this.aim=null; this.aimUntil=0;
  }
// White lane paint can join a fence into one oversized component. A second
// pass using dark bars separates that fence from the road marking.
gates(frame,cx) {
  return [...this.gateComponents(frame,cx,false), ...this.gateComponents(frame,cx,true)];
}
gateComponents(frame,cx,darkOnly){const{width:w,height:h,data:d}=frame,hy=h*.35,x0=Math.floor(w/2-h*.36),y0=Math.floor(h*.39),cols=Math.ceil(h*.72/2),rows=Math.ceil(h*.33/2),m=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);for(let y=0;y<rows;y++){const py=y0+y*2,lw=(py-hy)*.60;for(let x=0;x<cols;x++){const px=x0+x*2;if(px<0||px>=w||Math.abs(px-cx)>lw*1.43)continue;const i=(py*w+px)*4,r=d[i],g=d[i+1],b=d[i+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);if(hi-lo<26&&(darkOnly?hi<185:(hi<150||lo>204)))m[y*cols+x]=1;}}
const found=[];for(let p=0;p<m.length;p++){if(!m[p]||seen[p])continue;seen[p]=1;const q=[p];let n=0,ax=cols,bx=0,ay=rows,by=0;for(let j=0;j<q.length;j++){const a=q[j],x=a%cols,y=a/cols|0;n++;ax=Math.min(ax,x);bx=Math.max(bx,x);ay=Math.min(ay,y);by=Math.max(by,y);for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const xx=x+dx,yy=y+dy,k=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!seen[k]&&m[k]){seen[k]=1;q.push(k);}}}const bw=(bx-ax+1)*2,bh=(by-ay+1)*2,x=x0+(ax+bx),y=y0+by*2,fill=n*4/(bw*bh),lw=Math.max(10,(y-hy)*.60),norm=(x-cx)/lw,lane=Math.round(norm);if(n>10&&bw>lw*.58&&bw<lw*1.8&&bh/bw>.48&&bh/bw<1.65&&fill>.10&&fill<.88&&lane>=-1&&lane<=1&&Math.abs(norm-lane)<.40)found.push({kind:'gate',lane,x,y,bw,bh,fill,near:y/h});
// Neighbouring fences can share pixels and form a single wide component.
// Split that component across covered lanes; the vertical-bar verification
// in analyse still checks each proposed piece before treating it as a fence.
if(n>10&&bw>lw*1.6&&bw<lw*3.5&&bh/bw>.22&&bh/bw<.95&&fill>.12&&fill<.75){
  for(const coveredLane of [-1,0,1]){
    const centre=cx+coveredLane*lw;
    const overlap=Math.min(x+bw/2,centre+lw*.58)-Math.max(x-bw/2,centre-lw*.58);
    if(overlap>lw*.72)found.push({kind:'gate',lane:coveredLane,x:centre,y,bw:lw*1.16,bh,fill,near:y/h,split:true});
  }
}}return found;}
analyse(frame,now=Date.now()){
 const priorMove=this.lastMove,priorJump=this.lastJump;let dec=super.analyse(frame,now),h=frame.height,dt=this.previousFrame?now-this.previousFrame:200;this.previousFrame=now;if(dt<1000)this.frameMs=this.frameMs*.8+dt*.2;
 const current=dec.observedLane;let settled=false;
 if(this.pendingMove){const frac=dec.player?(dec.player.x-frame.width/2)/(h*.184):NaN;if(Number.isFinite(frac)&&Math.abs(frac-this.pendingMove.to)<.30){const latency=now-this.pendingMove.at;if(latency>50&&latency<1100){this.reactionMs=.8*this.reactionMs+.2*latency;this.calibration.push({stage:this.stageText,latencyMs:latency,estimatedMs:Math.round(this.reactionMs),frameMs:Math.round(this.frameMs)});}this.pendingMove=null;settled=true;}else if(now-this.pendingMove.at>950)this.pendingMove=null;}
 const gray=(x,y)=>{const i=((y|0)*frame.width+(x|0))*4,r=frame.data[i],g=frame.data[i+1],b=frame.data[i+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);return hi-lo<30&&(hi<155||lo>204);};
 const fences=this.gates(frame,dec.camera).filter(o=>{let good=0,maxBars=0;for(let y=o.y-o.bh*.88;y<o.y-o.bh*.18;y+=Math.max(2,o.bh*.08)){let runs=0,length=0;for(let x=o.x-o.bw*.48;x<=o.x+o.bw*.48;x++){if(gray(x,y))length++;else{if(length>=1&&length<o.bw*.17)runs++;length=0;}}maxBars=Math.max(maxBars,runs);if(runs>=4)good++;}return maxBars>=5&&good>=2;});
 const stage=/Bứt phá/.test(this.stageText)?4:/Tăng tốc 3|Về đích/.test(this.stageText)?3:/Tăng tốc 2/.test(this.stageText)?2:/Tăng tốc 1/.test(this.stageText)?1:0;
 const timingMargin=Math.max(0,this.reactionMs+this.frameMs-500)/10000;
 const warningY=h*(.49-stage*.012-timingMargin);
 this.fenceMemory=this.fenceMemory.filter(f=>now-f.seen<700);
 for(const f of fences.filter(f=>f.y>warningY)){this.fenceMemory=this.fenceMemory.filter(old=>old.lane!==f.lane);this.fenceMemory.push({...f,seen:now});}
 const blocked=[-1,0,1].map(l=>this.fenceMemory.some(f=>f.lane===l));let reason=dec.followingLetters?'collect letter':dec.target?'collect item':'hold';let desired=dec.keys.find(k=>k==='ArrowLeft')?current-1:dec.keys.find(k=>k==='ArrowRight')?current+1:current;
 if(blocked[current+1]){let safe=[-1,0,1].filter(l=>!blocked[l+1]);safe.sort((a,b)=>Math.abs(a-current)-Math.abs(b-current)||dec.lanes[a+1].risk-dec.lanes[b+1].risk);if(safe.length){desired=safe[0];reason='avoid game-ending fence';}}
 if(desired<-1||desired>1||blocked[desired+1]){desired=current;if(blocked[current+1])reason='no safe lane detected';}
 let keys=[];const gap=Math.max(240,Math.min(470,this.reactionMs*.80));
 if(!this.pendingMove&&desired!==current&&now-priorMove>gap){let to=current+Math.sign(desired-current);if(!blocked[to+1]||blocked[current+1]){keys.push(to<current?'ArrowLeft':'ArrowRight');this.lastMove=now;this.lane=to;this.pendingMove={to,at:now};}}
 if(!keys.length){this.lastMove=priorMove;this.lane=current;if(!this.pendingMove&&!blocked.some(Boolean)&&dec.keys.includes('ArrowUp'))keys.push('ArrowUp');else this.lastJump=priorJump;}
 return{...dec,keys,lane:this.lane,reason,fences,blocked,reactionMs:Math.round(this.reactionMs),frameMs:Math.round(this.frameMs),warningY:Math.round(warningY),stage:this.stageText};
}
}
