import {CalibratedPilot} from './calibrated-pilot.mjs';
import {laneFenceWindows} from './window-detector.mjs';
import {refineFencePosts} from './post-detector.mjs';
import {fenceInterior} from './fence-interior.mjs';
import {knownLowRail} from './rail-fence-identity.mjs';
import {recoverRearFence} from './rear-fence.mjs';

export class PostPilot extends CalibratedPilot {
  constructor(letters,coins){
    super(letters,coins);this.instantOccupancy=true;this.commitAheadMs=120;
    this.windowDetector={gates:(frame,camera)=>{
      const candidates=laneFenceWindows(frame,camera,{minNear:.403,maxNear:.89,multiDepth:this.separateCloseFences})
        .map(f=>{
          const refined=refineFencePosts(frame,f,{strict:this.strictPostGeometry});
          if(this.occludedPosts&&(!refined.postFit||fenceInterior(frame,refined).rows<3)
            &&f.quality>=65&&fenceInterior(frame,f).rows>=3)return {...f,postFit:false,occludedFit:true};
          return refined;
        }).sort((a,b)=>Number(Boolean(a.secondaryDepth))-Number(Boolean(b.secondaryDepth))||Number(b.postFit)-Number(a.postFit)||(a.occludedFit&&b.occludedFit?a.y-b.y:(b.quality||0)-(a.quality||0)));
      const found=[];this.rejectedKnownRails=[];
      for(let f of candidates){
        if(f.secondaryDepth){
          const rows=fenceInterior(frame,f).rows;
          f=recoverRearFence(f,found,frame.height,camera,rows)||f;
          if(!f.rearFit&&(!f.postFit||f.bh/f.bw<.64||rows<3||f.bw/(f.y-frame.height*.35)<.5))continue;
        }
        if(this.strictPostGeometry&&!f.occludedFit&&(!f.postFit||f.bh/f.bw<.64))continue;
        if(f.postFit&&fenceInterior(frame,f).rows<3)continue;
        const rail=this.keepRailIdentity&&knownLowRail(f,this.railTracker?.tracks||[],this.tracks||[],frame.height,this.observationClock);
        if(rail){this.rejectedKnownRails.push({lane:f.lane,y:f.y,railId:rail.id,hits:rail.hits});continue;}
        if(found.some(g=>g.lane===f.lane&&Math.abs(g.y-f.y)<Math.max(10,(Math.min(f.y,g.y)-frame.height*.35)*((f.occludedFit&&!f.rearFit)||(g.occludedFit&&!g.rearFit)?.40:.12))))continue;
        if(f.occludedFit||(f.postFit&&f.bh/f.bw>.50&&f.bh/f.bw<1.5)||(!f.postFit&&f.y<frame.height*.53))found.push(f);
      }
      return found;
    }};
  }
}
