// Endgame controller (2800 m onward) inside the interactive edition.
// The distance clock comes from timestamps of visible HUD stage-label changes.
// From 2806 m the controller follows the course on every frame, also while the
// bot is off ("shadow"), so control can be handed back at any point; it only
// sends keys while the bot is on. Only visible page text and screenshots are
// read; no game state is accessed.
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {EndgameV3} from './endgame-v3.mjs';
import {timeAtDistance,distanceAtTime,LANE_X} from './endgame-v3-course.mjs';
import {ManualHandoff} from './manual-handoff.mjs';

export const FINAL_STAGE='Bứt phá';
export const TAKEOVER_Z=2806;
const STAGE_BOUNDARY={'Tăng tốc 1':500,'Tăng tốc 2':1100,'Tăng tốc 3':1700,'Về đích':2300,'Bứt phá':2600};

// Page timestamps of visible events: stage-label changes, the puzzle screen
// appearing, its continue click, and the tab being hidden (the game clock then
// no longer follows wall time).
export function installEndgameLog(){
  if(window.top!==window||window.__endgameLog)return;
  const log=window.__endgameLog={stage:[],pause:[],hidden:[]};let last=null,inChallenge=false;
  document.addEventListener('click',e=>{if(e.target?.closest?.('.puzzle-continue-btn'))log.pause.push({type:'resume',at:Date.now()});},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)log.hidden.push({at:Date.now()});});
  const check=()=>{
    const t=document.querySelector('.stage-label')?.textContent;if(t&&t!==last){last=t;log.stage.push({t,at:Date.now()});}
    const c=!!document.querySelector('.challenge-title');if(c&&!inChallenge)log.pause.push({type:'pause',at:Date.now()});inChallenge=c;
  };
  const start=()=>{new MutationObserver(check).observe(document.documentElement,{subtree:true,childList:true,characterData:true});check();};
  if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
}
export async function instrumentEndgame(page){await page.addInitScript(installEndgameLog);}
// Runs in the page: hands over the events logged since the last call.
export function takeEndgameLog(){
  const l=window.__endgameLog;if(!l)return null;
  return {stage:l.stage.splice(0),pause:l.pause.splice(0),hidden:l.hidden.splice(0)};
}

// Presses at planned wall-clock times (spinning for the last ms), as in the batch bot.
export class EndgameKeys{
  constructor({send,begin,confirm,allowed=()=>true}){Object.assign(this,{send,begin,confirm,allowed});this.queue=[];this.timer=null;this.busy=false;this.seq=0;this.log=[];}
  replace(presses,seqAtPlan){if(seqAtPlan!==this.seq||!this.allowed())return false;const L=this.latency();
    this.queue=presses.map(p=>({...p,atMs:p.atMs-L})).sort((a,b)=>a.atMs-b.atMs);this.arm();return true;}
  clear(){this.queue=[];clearTimeout(this.timer);this.timer=null;}
  arm(){clearTimeout(this.timer);this.timer=null;if(!this.queue.length||this.busy)return;
    this.timer=setTimeout(()=>this.fire(),Math.max(0,this.queue[0].atMs-Date.now()-4));}
  // Wait for keys in flight and send any key due within windowMs, so the
  // synchronous analysis that follows cannot delay them.
  async settle(windowMs){
    for(let i=0;i<6;i++){
      if(this.active){await this.active;continue;}
      if(!this.queue.length||this.queue[0].atMs>Date.now()+windowMs)return;
      clearTimeout(this.timer);this.timer=null;
      const wait=this.queue[0].atMs-Date.now()-3;if(wait>0)await new Promise(r=>setTimeout(r,wait));
      await this.fire();
    }
  }
  latency(){const a=this.rtts;if(!a?.length)return 8;const s=[...a].sort((x,y)=>x-y);return Math.max(0,Math.min(30,s[s.length>>1]-3));}
  // A press that fails (page closed, run reset) must not end the process.
  fire(){if(this.busy)return this.active;this.active=this.fireInner().catch(e=>{this.error=e;this.queue=[];}).finally(()=>{this.active=null;});return this.active;}
  async fireInner(){
    if(this.busy)return;this.busy=true;
    try{
      while(this.queue.length&&this.queue[0].atMs<=Date.now()+4){
        if(!this.allowed()){this.clear();break;}
        const due=this.queue[0].atMs;while(Date.now()<due-0.5){}
        // A double press is one action: take every key planned for this instant.
        const group=[];while(this.queue.length&&Math.abs(this.queue[0].atMs-due)<1)group.push(this.queue.shift());
        const sent=Date.now();this.seq++;
        // Update the lane state before awaiting the browser, so a plan computed
        // meanwhile already sees these keys; then correct their timing on ack.
        this.begin(group,sent);
        const done=[];for(const p of group){await this.send(p);done.push(Date.now());}
        this.confirm(group,done);(this.rtts??=[]).push(done[0]-sent);if(this.rtts.length>30)this.rtts.shift();
        group.forEach((p,i)=>this.log.push({key:p.key,z:+p.z.toFixed(2),planned:Math.round(p.atMs),sent,done:done[i]}));
      }
    }finally{this.busy=false;this.arm();}
  }
}

// Lane for handing control back (0..2): the runner must be seen settled in the
// same lane for minMs, longer than a lane change (0.15 s at 50 m/s), so that a
// move the player has just started is not taken for the lane it leaves. The lane
// lines (the endgame's own runner measurement) are read on most frames; the
// runner figure is the fallback. Frames with neither are skipped, unless the
// gap grows past maxGapMs.
export class SettledLane{
  constructor(minMs=200,maxGapMs=150){this.handoff=new ManualHandoff();Object.assign(this,{minMs,maxGapMs});this.lane=null;this.since=null;this.last=null;}
  observe(measured,at,frame){
    let lane;
    if(measured){const near=LANE_X.reduce((b,v,i)=>Math.abs(v-measured.x)<Math.abs(LANE_X[b]-measured.x)?i:b,0);
      lane=Math.abs(measured.x-LANE_X[near])<0.35?near:null;this.handoff.observe(frame,at);}
    else{const seen=this.handoff.observe(frame,at);lane=seen===null?undefined:1-seen;}
    if(lane===undefined)return null;
    if(this.last!=null&&at-this.last>this.maxGapMs){this.lane=null;this.since=null;}
    this.last=at;
    if(lane===null||lane!==this.lane){this.lane=lane;this.since=lane===null?null:at;return null;}
    return at-this.since>=this.minMs?lane:null;
  }
}

const p90=a=>{if(!a.length)return 30;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length*0.9)];};

export class EndgameSession{
  // pressKey(key,token) sends one arrow key and resolves when acknowledged;
  // allowed(token) says whether the bot may still send input under that token.
  constructor({output,pressKey,allowed,margin=2,lagPrior=25}){
    Object.assign(this,{output,pressKey,allowed,margin,lagPrior});this.newGame();
  }
  newGame(){
    this.keys?.clear();this.keys=null;
    this.ctl=null;this.phase=null;this.phaseAt=null;this.stage=null;this.invalid=null;this.paused=false;this.pausedAt=null;this.lastResumeClick=null;this.mode=null;this.driveToken=null;
    this.pauseEvents=[];this.clockLog=[];this.handoffs=[];this.records=[];this.gameStamp=Date.now();this.saved=false;
  }
  get tracking(){return !!this.ctl&&!this.invalid;}
  zAt(ms){return this.ctl?this.ctl.zAt(ms):this.phase==null?null:distanceAtTime((ms-this.phase)/1000);}
  invalidate(reason,at=Date.now()){
    if(this.invalid)return;this.invalid=reason;this.keys?.clear();
    this.clockLog.push({invalid:reason,at,z:this.ctl?+this.ctl.zAt(at).toFixed(1):null});
  }
  // Page logs: stage changes give clock samples; a hidden tab or a puzzle
  // before the takeover makes the clock unusable until the next stage change.
  async sync(page){
    await this.ingest(await page.evaluate(takeEndgameLog).catch(()=>null));
  }
  // A log taken from the page (also by a caller's combined page read).
  async ingest(log){
    if(!log)return;
    for(const h of log.hidden){
      this.clockLog.push({hidden:h.at});
      if(this.ctl)this.invalidate('tab hidden',h.at);else this.phase=null;
    }
    for(const c of log.stage){
      const t=c.t.trim(),z=STAGE_BOUNDARY[t];
      // A new run (without a result screen seen, e.g. after a reload).
      if(t==='Nhập cuộc'&&(this.ctl||this.invalid||this.phase!=null)){await this.save('new run');this.newGame();}
      this.clockLog.push({stage:t,at:c.at});this.stage=t;
      if(z==null||this.ctl)continue;
      this.phase=c.at-timeAtDistance(z)*1000;this.phaseAt=c.at;this.clockLog.at(-1).sample=this.phase;
    }
    // A puzzle after the last stage change, before the takeover, stops the clock
    // for an unknown time: wait for the next stage change.
    for(const e of log.pause)if(e.type==='pause'&&!this.ctl&&this.phase!=null&&e.at>this.phaseAt){this.phase=null;this.clockLog.push({clockLost:'puzzle',at:e.at});}
    this.pauseEvents.push(...log.pause);
  }
  // At the takeover distance with a usable clock.
  ready(stage,now){return !this.ctl&&!this.invalid&&this.phase!=null&&stage===FINAL_STAGE&&this.zAt(now)>=TAKEOVER_Z;}
  // Start following the course (lane: 0..2, the controller's numbering; null
  // when unknown).
  start(now,lane){
    if(this.ctl)return false;
    const ctl=this.ctl=new EndgameV3({margin:this.margin,lagPrior:this.lagPrior});ctl.phase=this.phase;
    ctl.takeOver(now,lane??1);
    // Bound to this run's controller: a key still in flight when the run ends
    // (and the session resets) updates the old controller, not a missing one.
    this.keys=new EndgameKeys({send:p=>this.pressKey(p.key==='L'?'ArrowLeft':'ArrowRight',this.driveToken),allowed:()=>this.ctl===ctl&&this.mode==='drive'&&this.allowed(this.driveToken),
      begin:(group,sent)=>ctl.beginKeys(group.map(p=>p.key),sent),confirm:(group,done)=>ctl.confirmKeys(group.map(p=>p.key),done)});
    this.clockLog.push({takeover:now,z:+this.ctl.zAt(now).toFixed(1),lane:lane??null,phase:this.phase});
    return true;
  }
  // The bot (re)gains control with the runner seen in lane (0..2) under token.
  drive(now,lane,token,{continuous=false}={}){
    if(!continuous)this.ctl.rebaseLane(now,lane);
    this.mode='drive';this.driveToken=token;this.handoffs.push({at:now,z:+this.ctl.zAt(now).toFixed(1),to:'bot',lane,continuous});
  }
  shadow(now){
    if(this.mode==='shadow')return;
    this.keys?.clear();if(this.mode)this.handoffs.push({at:now,z:+this.ctl.zAt(now).toFixed(1),to:'player'});this.mode='shadow';
  }
  pause(now=Date.now()){if(!this.tracking||this.paused)return;this.paused=true;this.pausedAt=now;this.keys.clear();this.ctl.pause();}
  resume(){
    if(!this.paused)return;this.paused=false;if(!this.tracking)return;
    // This puzzle's page events (the puzzle title appears just before we see it).
    const pl=this.pauseEvents.filter(e=>e.at>=this.pausedAt-3000),p=pl.findLast(e=>e.type==='pause'),r=p&&pl.findLast(e=>e.type==='resume'&&e.at>p.at);
    if(p&&r&&r.at>p.at)this.ctl.resumeExact(p.at,r.at);
    else if(this.lastResumeClick)this.ctl.resume(this.lastResumeClick);
    else{this.invalidate('puzzle timing unknown');return;}
    this.clockLog.push({resume:this.ctl.lastPause,events:pl});
  }
  // One frame: follow the course; plan and send keys only while driving.
  async step(frame,{captureMs,stage}){
    const ctl=this.ctl,drive=this.mode==='drive'&&this.allowed(this.driveToken);
    ctl.perceiveMs??=[];ctl.planMs??=[];
    if(drive)await this.keys.settle(p90(ctl.perceiveMs)+8);
    let u0=Date.now();ctl.perceive(frame,{captureMs,shadow:!drive});
    ctl.perceiveMs.push(Date.now()-u0);if(ctl.perceiveMs.length>40)ctl.perceiveMs.shift();
    // The lane model was corrected from the screen: drop keys planned from it.
    if(ctl.laneCorrected){ctl.laneCorrected=false;this.keys.clear();}
    let record;
    if(drive){
      await this.keys.settle(p90(ctl.planMs)+8);
      const seq=this.keys.seq;u0=Date.now();
      const plan=ctl.plan(Date.now());record=plan.record;
      ctl.planMs.push(Date.now()-u0);if(ctl.planMs.length>40)ctl.planMs.shift();
      record.accepted=this.keys.replace(plan.presses,seq);record.inputLatency=this.keys.latency();
    }else{
      const {zFrame,px,visible}=ctl.lastPerception;
      record={endgame:true,shadow:true,zFrame:+zFrame.toFixed(2),px:+px.toFixed(2),pxSrc:ctl.pxSource,zOffset:+ctl.zOffset.toFixed(2),
        rows:visible.slice(0,4).map(r=>{const p=r.passing();return {z:+r.z.toFixed(1),k:r.kind[0],f:p.fences,c:p.confident};}),
        denseStart:ctl.denseStart&&+ctl.denseStart.toFixed(1),...(ctl.chain.boundary?{boundary:+ctl.chain.boundary.z.toFixed(1)}:{}),...(ctl.denseAlt?{denseAlt:+ctl.denseAlt.start.toFixed(1)}:{})};
    }
    record.stage=stage;record.captureMs=captureMs;record.mode=drive?'drive':'shadow';
    this.records.push(record);
    return record;
  }
  async save(reason){
    if(this.saved||(!this.ctl&&!this.clockLog.length))return;this.saved=true;const c=this.ctl;
    await writeFile(resolve(this.output,`endgame-${this.gameStamp}.json`),JSON.stringify({reason,invalid:this.invalid,clockLog:this.clockLog,handoffs:this.handoffs,
      keys:this.keys?.log??[],denseStart:c?.denseStart??null,denseShift:c?.denseShift??null,denseLog:c?.denseLog??[],rebases:c?.rebases??[],
      laneCorrections:c?.laneCorrections??[],lastPause:c?.lastPause??null,clockFixes:c?.clockFixes??[],lagMs:c?.lagMs??null,lagN:c?.lagN??null,zOffset:c?.zOffset??null,records:this.records},null,0));
  }
}
