import {DefensivePilot} from './compact-pilot.mjs';
import {RunnerObserver} from './runner-observer.mjs';
import {FenceFrameAge} from './fence-frame-age.mjs';

// Position measurements always refresh an existing nearby obstacle. A bad
// velocity estimate must never suppress a freshly visible fence.
export class TrackedPilot extends DefensivePilot {
  constructor(){super();this.afterMs=110;}
  player(frame){
    if(this.stableRunner&&!this.runnerObserver)this.runnerObserver=new RunnerObserver();
    const p=(this.stableRunner?this.runnerObserver.observe(frame,{at:this.observationClock,lane:this.commandLane,lastMove:this.lastMove}):runnerShape(frame))||super.player(frame);
    if(this.useContinuousCamera&&p)this.cameraLane=Math.max(-1,Math.min(1,(p.x-frame.width/2)/(frame.height*.157)));
    return p;
  }
  updateTracks(fences,h,now){
    this.rejectedPassedPartials=[];
    const horizon=h*(this.trackHorizon??.35),hit=1/(h*.75-horizon);
    if(this.recoverFenceFrameAge&&/B\u1ee9t ph\u00e1/.test(this.stageText)){
      this.fenceFrameAge??=new FenceFrameAge(this.sameLaneFrameAge);
      now-=this.fenceFrameAge.estimate(fences,this.tracks,h,now,horizon);
    }else this.fenceFrameAge=null;
    this.tracks=this.tracks.filter(t=>now<t.impact+280&&now-t.seen<850);
    // Several well-observed fences share the same road motion. A new track's
    // short history can be distorted by one tiny or partly hidden base fit.
    const matureRates=this.matureSpeedPrior&&/B\u1ee9t ph\u00e1/.test(this.stageText)?this.tracks
      .filter(t=>t.hits>=8&&t.pairedHits>=4&&now-t.seen<200&&t.history.length>=6)
      .map(t=>t.rate).filter(r=>r>.000002&&r<.00008).sort((a,b)=>a-b):[];
    const maturePrior=matureRates.length>=2&&matureRates.at(-1)/matureRates[0]<1.3?
      matureRates[matureRates.length>>1]:null;
    const observations=[];
    for(const f of [...fences].sort((a,b)=>b.y-a.y)){
      if(observations.some(o=>o.lane===f.lane&&Math.abs(o.y-f.y)<Math.max(10,(f.y-horizon)*.18)))continue;
      observations.push(f);
    }
    const matched=new Set(),assigned=new Map();
    const matchError=(f,t)=>{
      const reliable=this.boundFenceMotion&&t.hits>=4&&t.pairedHits>=2;
      if(t.lane!==f.lane||f.y<t.y-(reliable?5:18))return Infinity;
      const inverse=1/(f.y-horizon),error=Math.abs(inverse-(t.inverse-t.rate*(now-t.seen)));
      const limit=reliable?Math.min(.006,t.rate*Math.max(120,(now-t.seen)*.5)):.006;
      return error<limit?error:Infinity;
    };
    if(this.globalFenceMatching){
      // Associate the entire frame before updating any track. Processing the
      // nearest box first lets a spurious enlarged window steal a sound track.
      const pairs=[];
      for(const f of observations)for(const t of this.tracks){
        const error=matchError(f,t);
        if(Number.isFinite(error))pairs.push({f,t,error});
      }
      pairs.sort((a,b)=>a.error-b.error||Number(b.f.postFit)-Number(a.f.postFit));
      const used=new Set();
      for(const p of pairs)if(!assigned.has(p.f)&&!used.has(p.t.id)){assigned.set(p.f,p.t);used.add(p.t.id);}
    }
    for(const f of observations){
      const inverse=1/(f.y-horizon);
      const matches=this.tracks.filter(t=>!matched.has(t.id))
        .map(t=>({t,error:matchError(f,t)}))
        .filter(v=>Number.isFinite(v.error)).sort((a,b)=>a.error-b.error);
      let track=this.globalFenceMatching?assigned.get(f):matches[0]?.t;
      // An unpaired fragment beyond the collision line often belongs to a
      // road sign or a fence that has already passed. Without any paired-post
      // history it cannot establish or renew a deadline. Existing motion
      // memory survives; previously paired fences still update normally.
      if((!track||!track.pairedHits)&&this.rejectNewPassedPartials&&/B\u1ee9t ph\u00e1/.test(this.stageText)&&!f.postFit&&f.y>=h*.80){
        this.rejectedPassedPartials.push({lane:f.lane,y:f.y});continue;
      }
      if(!track){track={id:this.nextId++,lane:f.lane,rate:this.speed,history:[],hits:0};this.tracks.push(track);}
      matched.add(track.id);
      const oldY=track.y,oldImpact=track.impact;
      // A partly hidden window can end above the true base. Once both posts
      // established motion, do not let that weaker box postpone the deadline.
      // Keep the last paired geometry/history and let normal memory propagate.
      if(this.protectPairedDeadline&&/B\u1ee9t ph\u00e1/.test(this.stageText)
        &&!f.postFit&&track.hits>=3&&track.pairedHits>=2&&Number.isFinite(oldImpact)
        &&now+(inverse-hit)/track.rate>oldImpact+20){
        track.rejectedPartial=(track.rejectedPartial||0)+1;
        continue;
      }
      track.history.push({at:now,inverse});
      track.history=track.history.filter(v=>now-v.at<850).slice(-12);
      track.hits++;
      track.pairedHits=(track.pairedHits||0)+Number(Boolean(f.postFit));
      const slopes=[];
      for(let i=0;i<track.history.length;i++)for(let j=i+1;j<track.history.length;j++){
        const a=track.history[i],b=track.history[j],dt=b.at-a.at;
        const slope=(a.inverse-b.inverse)/dt;
        if(dt>120&&slope>(this.fitDirectTime?.000002:.000008)&&slope<(this.fitDirectTime?.00008:.000032))slopes.push(slope);
      }
      if(slopes.length){
        slopes.sort((a,b)=>a-b);
        let fitted=slopes[slopes.length>>1];
        if(this.sharedFenceSpeed){
          track.measuredRate=fitted;
          track.speedFallback=fitted<this.speed*.65||fitted>this.speed*1.6;
          if(track.speedFallback)fitted=this.speed;
          if(this.matureSpeedPrior)track.maturePriorFallback=Boolean(maturePrior&&track.hits<8&&
            (fitted<maturePrior*.85||fitted>maturePrior*1.15));
          if(track.maturePriorFallback)fitted=maturePrior;
        }
        track.rate=this.fitDirectTime?fitted:.65*track.rate+.35*fitted;
        if(!this.sharedFenceSpeed||track.pairedHits>=2&&track.hits>=4)
          this.speed=this.fitDirectTime?.9*this.speed+.1*track.rate:.97*this.speed+.03*track.rate;
      }
      track.inverse=inverse;track.y=f.y;track.seen=now;
      track.impact=now+(inverse-hit)/track.rate;
      if(!this.fitDirectTime&&f.y>=h*.708&&oldY>=h*.708&&Number.isFinite(oldImpact))track.impact=Math.min(oldImpact,track.impact);
    }
    return this.tracks.filter(t=>(t.hits>=2||t.y>h*.60&&(!this.confirmOccludedFences||t.pairedHits>0))&&(now-t.seen<
      (this.occlusionMemory&&t.hits>=4?500:t.y<h*.53?150:350)||t.y>h*.53))
      .map(t=>({...t,eta:t.impact-now}));
  }
}

function runnerShape(frame){const{width:w,height:h,data:d}=frame,x0=Math.floor(w/2-h*.28),y0=Math.floor(h*.39),cols=Math.floor(h*.56/2),rows=Math.floor(h*.37/2),m=new Uint8Array(cols*rows),s=new Uint8Array(cols*rows);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=((y0+y*2)*w+x0+x*2)*4,r=d[i],g=d[i+1],b=d[i+2];if(r<95&&g>18&&g<145&&b>80&&b>g*1.22&&b-r>43)m[y*cols+x]=1;}let candidates=[];for(let p=0;p<m.length;p++){if(!m[p]||s[p])continue;s[p]=1;const q=[p];let n=0,sx=0,sy=0,mnx=cols,mxx=0,mny=rows,mxy=0;for(let j=0;j<q.length;j++){let a=q[j],x=a%cols,y=a/cols|0;n++;sx+=x;sy+=y;mnx=Math.min(mnx,x);mxx=Math.max(mxx,x);mny=Math.min(mny,y);mxy=Math.max(mxy,y);for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){let xx=x+dx,yy=y+dy,k=yy*cols+xx;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&!s[k]&&m[k]){s[k]=1;q.push(k);}}}let bw=(mxx-mnx+1)*2,bh=(mxy-mny+1)*2,x=x0+sx/n*2,y=y0+sy/n*2;if(n>150&&bh>h*.035&&bw<h*.2&&bh>bw*.55&&Math.abs(x-w/2)<h*.235){const quality=n/(1+Math.abs(y-h*.608)*.04+Math.abs(bw-h*.075)*.08+Math.abs(bh-h*.114)*.04);candidates.push({x,y,n,bw,bh,quality});}}return candidates.sort((a,b)=>b.quality-a.quality)[0]||null;}
