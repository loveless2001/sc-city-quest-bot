import {greenJumpDeferral} from './green-jump-policy.mjs';
import {WordClock} from './word-clock.mjs';
import {farGreenPickups} from './far-green-pickups.mjs';
import {planningClock} from './planning-clock.mjs';
import {clearanceCredit} from './clearance-credit.mjs';
import {TrackedPilot} from './tracked-pilot.mjs';
import {letterProbability} from './letter-features.mjs';
import {CollectibleRate} from './collectible-rate.mjs';
import {goldBonuses} from './bonus-detector.mjs';
import {planCollection} from './collection-planner.mjs';
import {coneCandidates,SoftConeTracker} from './soft-cones.mjs';
import {PickupEvents,pickupCredit} from './pickup-events.mjs';
import {whiteCoinSupport,logoCoin} from './white-coins.mjs';
import {blueGifts,GiftTracker,giftCandidates} from './gift-detector.mjs';
import {orbitCoins} from './orbit-coins.mjs';
import {medals} from './medals.mjs';
import {detectCoins} from './endgame-v3-coins.mjs';
import {measureRunnerX} from './runner-x.mjs';
import {lowRails} from './rail-detector.mjs';
import {SoftRailTracker} from './soft-rails.mjs';
import {occludedCones,OccludedConeTracker} from './occluded-cones.mjs';
import {earlyJumpThreat} from './early-jump-policy.mjs';
import {earlyCones} from './early-cones.mjs';
import {deferJumpForKnownObstacle} from './jump-phase.mjs';
import {earlyRails} from './early-rails.mjs';

const specialPickup=o=>o?.kind==='bonus'||o?.kind==='gift';

export class CalibratedPilot extends TrackedPilot {
  constructor(letterModel,coinModel){super();this.letterModel=letterModel;this.coinModel=coinModel;this.collection=null;this.collectRate=.000006;this.lastAutoJump=-Infinity;this.collectibleRate=new CollectibleRate();}
  resumeAfterPuzzle(){super.resumeAfterPuzzle();this.collection=null;this.collectibleRate=new CollectibleRate();this.softConeTracker=new SoftConeTracker();this.occludedConeTracker=new OccludedConeTracker();this.pickupTracker=new PickupEvents({whiteValue:this.publicRewardValues?10:5,orbitValue:this.publicRewardValues?80:10,bonusValue:this.publicRewardValues?200:100,greenValue:this.greenPickupValue??15,letterValue:this.letterPickupValue??(this.prioritizeLetterStreaks?180:25),giftMemoryMs:this.rememberGifts?1100:350});this.giftTracker=new GiftTracker();this.railTracker=new SoftRailTracker(this.railImpactPixels??450);}
  analyse(frame,now=Date.now()){
    if(this.publicWordClock){this.wordClock??=new WordClock();this.wordClock.observe(frame,this.stageText,now);}
    this.observationClock=now-(this.sensorLagMs||0);
    const current=this.commandLane,previousMove=this.lastMove;
    const d=super.analyse(frame,now);
    const timing=planningClock({now,lastMove:previousMove,busyDuration:this.busyDurationMs??150,processing:d.processingMs??(this.analysisEstimate||95),enabled:this.usePlanningClock});
    const whitePickup=o=>this.logoCoinModel?logoCoin(frame,o,d.camera,this.logoCoinModel):
      o.kind==='coin'&&o.near<.64&&o.fill>.55&&o.bw/o.bh>.6&&o.bw/o.bh<1.5
      &&Math.abs((o.x-d.camera)/((o.y-frame.height*.35)*.72)-o.lane)<.22
      &&(!this.verifiedWhiteCoins||whiteCoinSupport(frame,o).accepted);
    this.commandLane=current;this.lane=current;this.lastMove=previousMove;
    const keys=[],commands=[];
    let end=current,reason='hold lane',plan=null,target=d.target,routeAuthorized=false,collectionPlan=null,staggeredClearance=null;
    const smallOrbits=this.farOrbitCoins&&/B\u1ee9t ph\u00e1/.test(this.stageText);
    const blueCandidates=this.orbitCoinModel?giftCandidates(frame,d.camera,{small:smallOrbits}):undefined;
    const orbitObservations=this.orbitCoinModel&&(!this.earlyOnlyOrbits||!/B\u1ee9t ph\u00e1/.test(this.stageText))?orbitCoins(frame,d.camera,this.orbitCoinModel,blueCandidates,{small:smallOrbits}):[];
    const giftObservations=this.giftModel?blueGifts(frame,d.camera,this.giftModel,blueCandidates):[];
    if(this.giftModel&&!this.giftTracker)this.giftTracker=new GiftTracker();
    const gifts=this.giftModel?this.giftTracker.update(giftObservations,this.observationClock):[];
    // The runner's world x from the lane lines (for the exact camera projection
    // used by the medal and navy-coin detectors); higher rows while the
    // health-warning banner covers the usual ones (first second of a game,
    // until index-CE9I5eWz.js; see runner-x.mjs).
    // Opening white coins (see below) while the own white-coin check has not
    // yet recognized one in two frames, in the first stage only.
    const openingWhite=this.openingWhiteCoins&&(this.ownWhiteFrames??0)<2&&/Nhập cuộc/.test(this.stageText);
    const runnerX=this.locationMedals||this.navyCoins||openingWhite?measureRunnerX(frame,{startRows:true}):null,px=runnerX&&runnerX.err<3?runnerX.x:null;
    // All three location medals (gold, blue, green), not only the gold one.
    const medalObservations=this.locationMedals&&px!=null?medals(frame,{playerX:px}):[];
    const bonuses=[...(this.collectBonuses?goldBonuses(frame,d.camera,d.player):[]),...medalObservations,...gifts].sort((a,b)=>b.y-a.y);
    // Navy (80) coins from the final-stage coin detector: the orbit detector
    // knew 27 of 51 navy coins in live game i-027 (white coins: 95%).
    const detected=(this.navyCoins||openingWhite)&&px!=null?detectCoins(frame,{z:0,playerX:px,maxDistance:50}):[];
    const navyObservations=this.navyCoins?detected.filter(c=>c.kind==='navy')
      .map(c=>({kind:'orbit',lane:1-c.lane,x:c.x,y:c.y,bw:c.w,bh:c.h,near:c.y/frame.height,coin:1,confidence:1,navy:true})):[];
    // White coins from the same detector at the start of a game: the coins all
    // spawn together facing the camera, and for about the first second the own
    // white-coin check (size, shape, logo model) rejects most of them (live
    // game i-024: first white pickup event at frame 20, two lane-0 coins passed).
    const openingWhiteObservations=openingWhite?detected.filter(c=>c.kind==='white')
      .map(c=>({kind:'coin',lane:1-c.lane,x:c.x,y:c.y,bw:c.w,bh:c.h,near:c.y/frame.height,letter:0,coin:0,openingWhite:true})):[];
    const coneObservations=this.coneModel?(this.rememberCones?occludedCones(frame,d.camera,this.coneModel):coneCandidates(frame,d.camera,d.player,this.coneModel)):[];
    if(this.earlyConeModel&&/B\u1ee9t ph\u00e1/.test(this.stageText))coneObservations.push(...earlyCones(frame,d.camera,this.earlyConeModel));
    if(this.coneModel&&!this.softConeTracker)this.softConeTracker=new SoftConeTracker();
    const railObservations=this.avoidRails||this.rememberCones?lowRails(frame,d.camera,{posts:true,partial:true}):[];
    if(this.earlyRails&&/B\u1ee9t ph\u00e1/.test(this.stageText))railObservations.push(...earlyRails(frame,d.camera,railObservations));
    if(this.avoidRails&&!this.railTracker)this.railTracker=new SoftRailTracker(this.railImpactPixels??450);
    const railTracks=this.avoidRails?this.railTracker.update(railObservations,frame.height,this.observationClock,now+(this.analysisEstimate||5)+this.inputMs*.5):[];
    if(this.rememberCones&&!this.occludedConeTracker)this.occludedConeTracker=new OccludedConeTracker();
    const coneTracks=this.coneModel?(this.rememberCones?
      this.occludedConeTracker.update([...coneObservations,...railObservations],frame.height,this.observationClock,now+(this.analysisEstimate||5)+this.inputMs*.5):
      this.softConeTracker.update(coneObservations,frame.height,this.observationClock,now+this.inputMs*.5)):[];
    const softObstacles=[...coneTracks,...railTracks];
    const softTimes=[-1,0,1].map(l=>softObstacles.filter(o=>o.lane===l).map(o=>o.eta));
    let pickupEvents=[];
    if(this.deadlineRewards){
      if(!this.pickupTracker)this.pickupTracker=new PickupEvents({whiteValue:this.publicRewardValues?10:5,orbitValue:this.publicRewardValues?80:10,bonusValue:this.publicRewardValues?200:100,greenValue:this.greenPickupValue??15,letterValue:this.letterPickupValue??(this.prioritizeLetterStreaks?180:25),giftMemoryMs:this.rememberGifts?1100:350});
      const recognized=d.objects.filter(o=>o.bh>=8&&o.bw>=5&&o.near>.407).map(o=>({...o,
        letter:o.kind==='green'?letterProbability(frame,o,this.letterModel):0,
        coin:o.kind==='green'?letterProbability(frame,o,this.coinModel):0})).filter(o=>
          o.letter>=.65||o.coin>=.65||whitePickup(o));
      if(openingWhite&&recognized.some(o=>o.kind==='coin'&&o.letter<.65&&o.coin<.65))this.ownWhiteFrames=(this.ownWhiteFrames??0)+1;
      const farther=this.farPickups?farGreenPickups(frame,d.camera,this.letterModel,this.coinModel):[];
      pickupEvents=this.pickupTracker.update([...bonuses,...recognized,...orbitObservations,...navyObservations,...openingWhiteObservations,...farther],frame.height,now-(this.sensorLagMs||0),now+(this.analysisEstimate||5)+this.inputMs*.5);
      if(this.earlyOnlyOrbits&&/B\u1ee9t ph\u00e1/.test(this.stageText))pickupEvents=pickupEvents.filter(e=>e.kind!=='orbit');
      if(this.publicWordClock)pickupEvents=this.wordClock.correct(pickupEvents,frame.height,this.observationClock,now+(this.analysisEstimate||5)+this.inputMs*.5);
    }
    const times=d.times||[[],[],[]];
    if(!d.trackedFences?.length&&!softObstacles.length&&!this.deadlineRewards){
      const candidates=d.objects.filter(o=>o.bh>=8&&o.bw>=5&&o.near>.407).map(o=>({...o,
        letter:o.kind==='green'?letterProbability(frame,o,this.letterModel):0,
        coin:o.kind==='green'?letterProbability(frame,o,this.coinModel):0}));
      const letters=candidates.filter(o=>o.letter>=.65).sort((a,b)=>b.y-a.y);
      const greenCoins=[...candidates.filter(o=>o.coin>=.65),...orbitObservations].sort((a,b)=>b.y-a.y);
      const white=candidates.filter(whitePickup).sort((a,b)=>b.y-a.y);
      target=(bonuses[0]&&(!letters[0]||bonuses[0].y>=letters[0].y-20)?bonuses[0]:null)||letters[0]||greenCoins[0]||white[0]||null;
      if(this.timedCollection){
        collectionPlan=planCollection([...bonuses,...letters,...greenCoins,...white],{lane:current,now,height:frame.height,
          rate:this.collectRate,sensorLagMs:this.sensorLagMs||0,memory:this.collection});
        target=collectionPlan.target;
      }
      if(this.collectionHistory)this.collectRate=this.collectibleRate.observe(target,now-(this.sensorLagMs||0),frame.height);
      else if(target&&this.collection&&target.lane===this.collection.lane&&target.kind===this.collection.kind){
        const dt=now-this.collection.seen,hy=frame.height*.35;
        const rate=(1/(this.collection.y-hy)-1/(target.y-hy))/dt;
        if(dt>40&&dt<400&&rate>.000002&&rate<.00004)this.collectRate=.85*this.collectRate+.15*rate;
      }
      if(!this.timedCollection&&this.collection&&now<this.collection.until&&(!target||target.y<this.collection.y-20)
        &&!(target?.letter>=.65&&this.collection.letter<.65&&!specialPickup(this.collection))&&!(specialPickup(target)&&!specialPickup(this.collection)))target={...this.collection,memory:true};
      if(target&&!target.memory){
        const remaining=(1/(target.y-frame.height*.35)-1/(frame.height*.68-frame.height*.35))/this.collectRate;
        this.collection={...target,seen:now,until:now+Math.max(120,Math.min(1000,remaining+90))};
      }
      if(target&&target.lane!==current&&now-previousMove>200){
        const key=target.lane<current?'ArrowLeft':'ArrowRight';
        for(let n=0;n<Math.abs(target.lane-current);n++){keys.push(key);commands.push({key,atMs:n*40});}
        end=target.lane;reason=target.kind==='gift'?'collect confirmed visible gift':target.kind==='bonus'?'collect visible landmark':target.letter>=.65?'collect recognized letter':'collect recognized item';
      }
    }else{
      this.collection=null;
      const before=/B\u1ee9t ph\u00e1/.test(this.stageText)?(this.lateCollisionBeforeMs??45):45;
      const danger=(lane,a,b)=>times[lane+1].some(t=>t-before<=b&&t+(this.collisionAfterMs??100)>=a);
      const ownThreat=times[current+1].some(t=>t>-100&&t<1100);
      const ownSoft=softTimes[current+1].some(t=>t>-100&&t<700);
      const softExposure=(lane,a,b)=>softTimes[lane+1].reduce((sum,t)=>sum+Math.max(0,Math.min(b,t+100)-Math.max(a,t-80)),0);
      const safePickupLane=lane=>!times[lane+1].some(t=>t>-(this.collisionAfterMs??100)&&t<650)
        &&!softTimes[lane+1].some(t=>t>-100&&t<650);
      let rewardTarget=null;
      if(this.collectSafeRewards&&!this.deadlineRewards){
        const recognized=d.objects.filter(o=>o.kind==='green'&&o.bw>=5&&o.bh>=8&&o.near>.43&&o.near<.65)
          .map(o=>({...o,letter:letterProbability(frame,o,this.letterModel),coin:letterProbability(frame,o,this.coinModel)}))
          .filter(o=>Math.max(o.letter,o.coin)>=.85&&safePickupLane(o.lane))
          .sort((a,b)=>(b.letter>=.85)-(a.letter>=.85)||b.y-a.y);
        const safeBonus=bonuses.find(o=>o.near>.43&&o.near<.65&&safePickupLane(o.lane));
        const safeWhite=this.logoCoinModel?d.objects.filter(o=>o.near>.43&&safePickupLane(o.lane)&&whitePickup(o)).sort((a,b)=>b.y-a.y):[];
        rewardTarget=safeBonus||recognized[0]||orbitObservations.find(o=>safePickupLane(o.lane))||safeWhite[0]||null;if(rewardTarget)target=rewardTarget;
      }
      routeAuthorized=ownThreat||ownSoft||Boolean(rewardTarget)||pickupEvents.length>0;
      const pickupEntryTimes=this.pickupEntryCredit?
        (/B\u1ee9t ph\u00e1/.test(this.stageText)?[0,60,120]:
          /T\u0103ng t\u1ed1c 3|V\u1ec1 \u0111\u00edch/.test(this.stageText)?[0,90]:null):null;
      const search=(after=this.collisionAfterMs??100,emergency=false,approach=before,localLimit=Infinity)=>{
      const danger=(lane,a,b)=>times[lane+1].some(t=>t-(t<=localLimit?approach:before)<=b&&t+(t<=localLimit?after:(this.collisionAfterMs??100))>=a);
      const step=emergency||this.barrierForecast?.active&&this.forecastFineGrid?10:30,horizon=2100,busy=timing.busy;
      const startTime=Math.ceil(busy/step)*step;
      const grid=Array.from({length:horizon/step+1},()=>new Map());
      grid[startTime/step].set(current,{lane:current,time:startTime,score:0,route:[]});
      const finished=[];
      for(let index=startTime/step;index<grid.length;index++){
        for(const state of grid[index].values()){
          finished.push(state);
          for(const to of [-1,0,1]){
            const distance=Math.abs(to-state.lane),duration=distance===0?step:distance===1?(this.moveDurationMs??150):(this.crossDurationMs??180);
            const t=state.time,arrival=t+duration;
            // Adjacent moves and full crossings have different visible source
            // clearance times. Use recent screenshot-calibrated upper quantiles
            // in the fastest stage, where a late departure ends the run.
            const late=/B\u1ee9t ph\u00e1/.test(this.stageText);
            const adjacentSource=late&&this.lateAdjacentSourceMs?this.lateAdjacentSourceMs:(this.sourceOccupiedMs??(this.instantOccupancy?10:65));
            const crossSource=late&&this.lateCrossSourceMs?this.lateCrossSourceMs:(this.sourceOccupiedMs??(this.instantOccupancy?10:40));
            const middleOccupied=late&&this.lateMiddleOccupiedMs?this.lateMiddleOccupiedMs:(this.middleOccupiedMs??(this.instantOccupancy?45:120));
            if(arrival>horizon)continue;
            const reserve=/B\u1ee9t ph\u00e1/.test(this.stageText)?(this.lateSafeDetourMs||0):0;
            if(distance&&reserve&&!danger(state.lane,t,t+reserve)&&danger(to,t,arrival+reserve))continue;
            let unsafe=distance===0?danger(to,t,arrival):distance===1?
              ((t>0||emergency)&&danger(state.lane,t,t+adjacentSource))||danger(to,t+(this.adjacentEntryMs??(this.instantOccupancy?0:65)),arrival):
              ((t>0||emergency)&&danger(state.lane,t,t+crossSource))||danger(0,t+(this.middleStartMs??(this.instantOccupancy?0:40)),t+middleOccupied)||danger(to,t+(this.destinationStartMs??(this.instantOccupancy?40:120)),arrival);
            if(unsafe)continue;
            const room=Math.min(700,...times[to+1].filter(v=>v>arrival).map(v=>v-arrival));
            const exposure=distance===0?softExposure(to,t,arrival):distance===1?
              softExposure(state.lane,t,t+adjacentSource)+softExposure(to,t+(this.adjacentEntryMs??(this.instantOccupancy?0:65)),arrival):
              softExposure(state.lane,t,t+crossSource)+softExposure(0,t+(this.middleStartMs??(this.instantOccupancy?0:40)),t+middleOccupied)+softExposure(to,t+(this.destinationStartMs??(this.instantOccupancy?40:120)),arrival);
            const softCost=exposure*(late?(this.lateSoftCostScale??.8):(this.earlySoftCostScale??.8));
            // Only award a pickup once, when a route actually occupies its lane
            // at the estimated arrival. During a move, credit starts on arrival.
            // Pickups may overlap before the runner finishes settling. Keep
            // full movement/collision bounds, but credit destination overlap
            // after a separately calibrated entry time in the faster stages.
            const pickupEntry=t+(distance?(pickupEntryTimes?.[distance]??duration):0);
            // A departing runner briefly still overlaps the source lane. This
            // reward-only experiment leaves every hard occupancy check intact.
            const sourceCredit=late&&distance&&this.sourcePickupCreditMs?
              pickupCredit(pickupEvents,state.lane,t,t+Math.min(duration,this.sourcePickupCreditMs),t):0;
            const reward=pickupCredit(pickupEvents,to,t,arrival,pickupEntry)+sourceCredit;
            const moveCost=this.deadlineRewards?(late?2.5:(this.earlyMoveCost??2.5)):18;
            const roomCredit=this.timeScaledClearance&&late&&this.deadlineRewards?
              clearanceCredit(times,state.lane,to,t,duration):room*(this.deadlineRewards?.0007:.006);
            const candidate={lane:to,time:arrival,score:state.score+duration+roomCredit-distance*moveCost-softCost+reward+(rewardTarget?.lane===to?duration*.15:0),
              route:distance?[...state.route,{from:state.lane,to,at:t,duration}]:state.route};
            const row=grid[arrival/step],old=row.get(to);
            if(!old||candidate.score>old.score)row.set(to,candidate);
          }
        }
      }
      finished.sort((a,b)=>b.time-a.time||b.score-a.score);return finished[0];
      };
      plan=search();
      if(this.staggeredClearance&&/B\u1ee9t ph\u00e1/.test(this.stageText)&&ownThreat&&plan?.time<500){
        // Narrowly scoped experiment: three mature visible fences cause a
        // dead end under the normal100ms passed-fence padding. Preserve source
        // occupancy, destination entry, movement duration and75ms approach
        // padding; try smaller passed-fence padding only with a full escape.
        const mature=d.trackedFences.filter(f=>!f.forecast&&f.hits>=4&&f.pairedHits>=3&&this.observationClock-f.seen<=200&&f.eta>-100&&f.eta<700);
        if(new Set(mature.map(f=>f.lane)).size===3){
          const normalHorizon=plan.time;
          for(const after of [90,80,70,60,50]){
            const escape=search(after,true);
            if(escape?.time===2100&&escape.route.length){
              staggeredClearance={normalHorizon,afterMs:after,approachMs:before,strictSource:true,trackIds:mature.map(f=>f.id)};
              plan=escape;break;
            }
          }
        }
      }
      if(this.occludedGapEscape&&/B\u1ee9t ph\u00e1/.test(this.stageText)&&Math.abs(current)===1&&plan?.time<500){
        const visible=d.trackedFences.filter(f=>!f.forecast&&f.hits>=4&&f.pairedHits>=1&&this.observationClock-f.seen<=200&&f.eta>-100&&f.eta<500);
        const center=visible.find(f=>f.lane===0&&f.hits>=6&&f.pairedHits>=5&&f.eta<200);
        const source=visible.find(f=>f.lane===current&&f.eta>0);
        const opposite=visible.find(f=>f.lane===-current&&f.pairedHits>=3&&Math.abs(f.eta-(source?.eta??Infinity))<=120);
        if(center&&source&&opposite){
          // Last-resort experiment for a visually confirmed staggered row.
          // Only the first500ms use50/50 uncertainty padding. Full physical
          // movement/overlap and all later normal fence bounds still apply.
          const escape=search(50,true,50,500),first=escape?.route[0];
          if(escape?.time===2100&&first?.from===current&&first.to===0&&first.at<=120){
            staggeredClearance={normalHorizon:plan.time,afterMs:50,approachMs:50,strictSource:true,localLimit:500,occluded:true,trackIds:[center.id,source.id,opposite.id]};
            plan=escape;
          }
        }
      }
      const first=plan?.route[0];
      if(first&&(ownThreat||ownSoft||rewardTarget?.lane===first.to||this.deadlineRewards&&routeAuthorized)&&first.at<=(this.commitAheadMs??60)&&now-previousMove>=(this.moveCooldownMs??130)){
        const key=first.to<current?'ArrowLeft':'ArrowRight';
        for(let n=0;n<Math.abs(first.to-current);n++){
          keys.push(key);commands.push({key,atMs:(this.analysisEstimate||5)+first.at+n*(this.hopInputMs??40)});
        }
        end=first.to;reason=ownThreat?'follow route with measured lane-crossing time':ownSoft?'avoid confirmed small obstacles on a fence-safe route':this.deadlineRewards?'collect timed pickups on a fence-safe route':'collect recognized item on a safe route';
      }else reason=ownThreat?'wait for a physically reachable gap':'keep safe lane throughout fence sequence';
    }
    if(commands.length){this.commandLane=end;this.lane=end;this.lastMove=now+commands.at(-1).atMs;}
    const earlyThreat=this.hazardOnlyEarlyJumps?earlyJumpThreat(this.jumpConesOnly?softObstacles.filter(o=>o.kind==='cones'):softObstacles,{current,end,commands}):null;
    const wantJump=(this.feedbackJump||(this.lateFeedbackJump&&/B\u1ee9t ph\u00e1/.test(this.stageText)))?
      d.player?.y>frame.height*.575&&now-this.lastAutoJump>(this.jumpRetryMs??170):
      this.hazardOnlyEarlyJumps?Boolean(earlyThreat)&&d.player?.y>frame.height*.575&&now-this.lastAutoJump>120:
      now-this.lastAutoJump>1000&&!times[end+1].some(t=>t>-100&&t<350)&&!(this.groundLetters&&target?.letter>=.65);
    const jumpDeferredForSoft=wantJump&&this.phaseAlignedJumps&&/B\u1ee9t ph\u00e1/.test(this.stageText)?deferJumpForKnownObstacle(softObstacles,{current,end,commands}):null;
    const jumpDeferredForGreen=this.groundGreenPickups?greenJumpDeferral(pickupEvents,softObstacles,{late:/B\u1ee9t ph\u00e1/.test(this.stageText),current,end}):null;
    const jumpNow=wantJump&&!jumpDeferredForSoft&&!jumpDeferredForGreen;
    if(jumpNow){
      keys.push('ArrowUp');commands.push({key:'ArrowUp',atMs:commands.at(-1)?.atMs||0});
      this.lastAutoJump=now;this.lastJump=now;
    }
    return {...d,medalObservations,navyObservations,planSendClock:timing.sendClock,remainingBusyMs:timing.busy,keys,commands,lane:end,target,reason,plan,staggeredClearance,routeAuthorized,bonuses,giftObservations,gifts,orbitObservations,collectionPlan,coneObservations,railObservations,railTracks,softObstacles,softTimes,pickupEvents,earlyJumpThreat:earlyThreat,jumpDeferredForSoft,jumpDeferredForGreen};
  }
}
