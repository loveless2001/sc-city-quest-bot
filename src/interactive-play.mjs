import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {BotControl,attachBotControls} from './bot-control.mjs';
import {InterruptibleScheduler} from './interruptible-scheduler.mjs';
import {ManualHandoff,prepareManualHandoff} from './manual-handoff.mjs';
import {createConfiguredPilot} from './controller-config.mjs';
import {RenderedFrameStream} from './rendered-frame-stream.mjs';
import {commitRoute} from './commit-route.mjs';
import {routeGroups} from './route-groups.mjs';
import {launchUserBrowser,keepGameTab} from './user-browser.mjs';
import {EndgameSession,SettledLane,instrumentEndgame,FINAL_STAGE,TAKEOVER_Z} from './endgame-session.mjs';
import {LANE_X} from './endgame-v3-course.mjs';
import {warmUp} from './warmup.mjs';
import {OverlappedText,playingText} from './page-text.mjs';
import {CrashFrames} from './crash-frames.mjs';

const require=createRequire(process.env.SC_BOT_DEPENDENCIES?resolve(process.env.SC_BOT_DEPENDENCIES,'package.json'):import.meta.url);
const {chromium}=require('playwright'),sharp=require('sharp');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stageFrom=text=>text.match(/Hanoi\s+(Nhập cuộc|Tăng tốc\s*\d|Về đích|Bứt phá)/)?.[1]||'';
// For the per-frame timing log: the HUD score, and a penalty popup ("-30" cone,
// "-60" barrier) if the page shows one.
const hudScore=text=>Number(text.match(/Điểm số\s*([\d,]+)/)?.[1]?.replaceAll(',',''))||undefined;
const penaltyShown=text=>Number(text.match(/(?:^|\n)\s*-(30|60)\s*(?:\n|$)/)?.[1])||undefined;
// Score pop-ups on screen (letters +40/+120/+200, wrong lane -80, word +800,
// badges and boxes +200), and a completed word's "PHRASE!" banner.
const popupsShown=text=>{const p=[...text.matchAll(/(?:^|\n)[ \t]*([+-]\d{2,4})[ \t]*(?=\n|$)/g)].map(m=>m[1]);
  const w=text.match(/(?:^|\n)[ \t]*([A-Z][A-Z ]{3,}!)[ \t]*(?=\n|$)/)?.[1];return p.length||w?[...p,...(w?[w]:[])]:undefined;};
// Since index-omdIpeof.js a cookie notice shows on every screen until the
// player accepts it ('Đồng ý'; remembered by the page). In a run it covers the
// road at the runner's feet (x 193-553, rows 575-638): with it, the lane-line
// reading was lost or more than 1 m off on 5% of a recorded endgame's frames.
// The bot doesn't accept it; it turns itself off while the notice shows.
const cookieNoticeShown=text=>text.includes('Trò chơi sử dụng cookie');
const COOKIE_NOTICE='Accept the cookie notice (Đồng ý), then press F8';

export async function runInteractive({context,page,argv,output,url='https://sccityquest.zenimpact.vn/'}={}){
  await mkdir(output,{recursive:true});
  const flags=new Set(argv),control=new BotControl();
  await attachBotControls(page,control);
  const input=await context.newCDPSession(page);
  const stream=new RenderedFrameStream(context,page);
  const expected=argv.find(a=>a.startsWith('--expected-bundle='))?.split('=')[1];
  const frameInterval=Number(argv.find(a=>a.startsWith('--frame-ms='))?.split('=')[1])||50;
  const lateFrameInterval=Number(argv.find(a=>a.startsWith('--late-frame-ms='))?.split('=')[1])||frameInterval;
  let closed=false,pilot=null,scheduler=null,handoff=new ManualHandoff(),settled=new SettledLane(),currentToken=-1;
  // After the endgame controller takes over, an early-game controller keeps
  // analysing frames (no keys) until the last random obstacles are passed: its
  // tracks are the endgame planner's obstacles there (endgame-session.mjs).
  let junctionPilot=null,junctionCreating=null,lastDecision=null;
  let needsVersionCheck=true,resetting=Promise.resolve(),mouseOwned=false,frames=0,lastReport=0,resultSeen=false,puzzleStarted=null;
  const held=new Set();
  const live=token=>!closed&&!page.isClosed()&&control.valid(token);
  // From 2806 m the endgame controller follows the course on every frame, with
  // the bot on or off, and steers only while the bot is on (--endgame-v3).
  const endgame=flags.has('--endgame-v3')?new EndgameSession({output,pressKey:(k,token)=>key(k,token),allowed:token=>live(token),
    margin:Number(argv.find(a=>a.startsWith('--endgame-margin='))?.split('=')[1])||2,
    // Mystery boxes in 3300-3800 m: collect (default) or avoid (--endgame-boxes=avoid).
    boxes:argv.find(a=>a.startsWith('--endgame-boxes='))?.split('=')[1]||'collect'}):null;
  if(endgame)await instrumentEndgame(page);
  const release=async()=>{
    const keys=[...held];held.clear();
    await Promise.allSettled(keys.map(key=>input.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:{ArrowLeft:37,ArrowUp:38,ArrowRight:39}[key]})));
    if(mouseOwned){mouseOwned=false;await page.mouse.up().catch(()=>{});}
  };
  const reset=()=>{
    const previous=scheduler;scheduler=null;pilot=null;handoff=new ManualHandoff();settled=new SettledLane();
    const aborted=previous?.abort();endgame?.keys?.clear();
    // While the endgame follows the course, the screenshots keep coming.
    resetting=Promise.allSettled([resetting,aborted,release(),endgame?.tracking?null:stream.stop()]);
    return resetting;
  };
  let seenGeneration=control.generation;
  control.listeners.add(state=>{
    if(state.generation!==seenGeneration){seenGeneration=state.generation;reset();}
    appendFile(resolve(output,'controls.jsonl'),JSON.stringify({...state,at:new Date().toISOString()})+'\n').catch(()=>{});
  });
  const close=()=>{closed=true;control.setEnabled(false,'Browser closed');reset();};
  context.on('close',close);page.on('close',close);
  page.on('framenavigated',frame=>{
    if(frame!==page.mainFrame())return;
    needsVersionCheck=true;control.availability(false,'Checking game…');
    if(endgame){endgame.save('page reloaded').catch(()=>{});endgame.newGame();}
  });
  const stop=()=>{closed=true;control.setEnabled(false,'Stopping');};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);

  async function key(key,token){
    if(!live(token))return;
    const code={ArrowLeft:37,ArrowUp:38,ArrowRight:39}[key];
    if(!code)throw new Error('Only gameplay arrow keys are supported');
    held.add(key);
    try{
      await Promise.all(['keyDown','keyUp'].map(type=>input.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})));
    }finally{held.delete(key);}
  }
  async function tap(locator,token){
    if(!live(token)||!await locator.isVisible().catch(()=>false))return false;
    const box=await locator.boundingBox();if(!box||!live(token))return false;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    if(!live(token))return false;
    mouseOwned=true;
    try{await page.mouse.down();}finally{if(mouseOwned){mouseOwned=false;await page.mouse.up();}}
    return live(token);
  }
  const button=name=>page.getByRole('button',{name,exact:true});
  async function puzzleStep(token){
    control.status('Solving puzzle · F8 stops');
    if(await button('Quay lại đường chạy').isVisible().catch(()=>false)){
      if(puzzleStarted)await page.screenshot({path:resolve(output,`puzzle-${puzzleStarted}-solved.jpg`),type:'jpeg'});
      if(await tap(button('Quay lại đường chạy'),token)&&endgame)endgame.lastResumeClick=Date.now();
      puzzleStarted=null;return;
    }
    if(!puzzleStarted)puzzleStarted=Date.now();
    if(await button('Chơi minigame ghép hình').isVisible().catch(()=>false)){
      await tap(button('Chơi minigame ghép hình'),token);return;
    }
    const pieces=await page.locator('div').evaluateAll(elements=>elements.map(e=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return {cursor:s.cursor,position:s.backgroundPosition,background:s.backgroundImage,x:r.x,y:r.y,w:r.width,h:r.height};
    }).filter(p=>p.cursor==='grab'&&p.w>0&&p.h>0&&p.background.includes('/images/minigame/puzzle-')));
    const p=pieces.find(p=>p.x>=280&&p.x+p.w<=585);if(!p||!live(token))return;
    const [col,row]=p.position.split(' ').map(parseFloat),dy=p.y-383.925;
    if(![0,100].includes(col)||![0,50,100].includes(row)){control.setEnabled(false,'Puzzle needs manual help');return;}
    const x=p.x+p.w/2,y=p.y+p.h/2,toX=col===0?368:501,toY=126+dy+row*1.92;
    await page.mouse.move(x,y);if(!live(token))return;
    mouseOwned=true;
    try{
      await page.mouse.down();
      for(let step=1;step<=8&&live(token);step++)await page.mouse.move(x+(toX-x)*step/8,y+(toY-y)*step/8);
    }finally{if(mouseOwned){mouseOwned=false;await page.mouse.up();}}
  }
  let noGuestSince=null;
  async function setupStep(token){
    // The 18+ confirmation, shown until index-B8HeQgVv.js; index-BG06rE0x.js
    // dropped it (its only other 'Xác nhận' is phone verification, not on the
    // Guest path).
    if(await button('Xác nhận').isVisible().catch(()=>false)){
      if(!flags.has('--age-authorized')){control.status('Confirm your age in the game');return;}
      const checked=await tap(page.getByText('Tôi đã đủ 18 tuổi trước khi bắt đầu chơi game.',{exact:true}),token);
      if(checked)await tap(button('Xác nhận'),token);return;
    }
    // Guest button: 'Chơi ngay (Guest)' until index-BFqScKec.js, 'Chơi thử' since index-CE9I5eWz.js.
    for(const name of ['Bắt đầu chạy','VN Hà Nội','Chơi','Chơi thử','Chơi ngay (Guest)']){
      if(await tap(button(name),token)){noGuestSince=null;control.status('Starting Guest game…');return;}
    }
    // Since index-DS2du1bN.js the site can switch guest play off: the login
    // screen then shows the Facebook button without 'Chơi thử' (it also lacks
    // it for a moment while the site's settings load). The bot plays as Guest only.
    if(await button('Đăng nhập bằng Facebook').isVisible().catch(()=>false)){
      noGuestSince??=Date.now();
      if(Date.now()-noGuestSince>3000){control.status('Guest play is off on the site');return;}
    }else noGuestSince=null;
    control.status('Waiting for Hanoi track');
  }
  // The game's page can be unresponsive for seconds while it loads; a text read
  // that times out is retried, and only a page unreadable for 10 s is an error.
  // The text is read in one page round trip; --sequential-text keeps the
  // original locator read, always awaited before each screenshot.
  const sequentialText=flags.has('--sequential-text');
  async function bodyText(){
    if(sequentialText)return page.locator('body').innerText({timeout:1500});
    let timer;
    const text=await Promise.race([page.evaluate(()=>document.body?document.body.innerText:null),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Page text read timed out')),1500);})]).finally(()=>clearTimeout(timer));
    if(text===null)throw new Error('Page has no body yet');
    return text;
  }
  let textStuckSince=null;
  async function readText(){
    try{const text=await bodyText();textStuckSince=null;return text;}
    catch(error){
      if(closed||page.isClosed())throw error;
      textStuckSince??=Date.now();if(Date.now()-textStuckSince>10000)throw error;
      return null;
    }
  }
  const pageText=new OverlappedText(readText);
  async function capture(){
    const t0=Date.now(),rendered=await stream.next(),t1=Date.now();
    const decoded=await sharp(rendered.shot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return {...rendered,waitMs:t1-t0,decodeMs:Date.now()-t1,frame:{data:decoded.data,width:decoded.info.width,height:decoded.info.height}};
  }
  // Frames for --capture are written in the background, as in the batch bot:
  // an awaited disk write would delay the next screenshot.
  const pendingWrites=new Set();
  async function saveFrame(shot){
    const pending=writeFile(resolve(output,`frame-${String(frames).padStart(6,'0')}.jpg`),shot).catch(()=>{}).finally(()=>pendingWrites.delete(pending));
    pendingWrites.add(pending);if(pendingWrites.size>8)await Promise.race(pendingWrites);
  }
  async function recordResult(text){
    if(resultSeen)return;
    const stamp=Date.now(),score=Number(text.match(/Điểm Số\s*([\d,]+)/)?.[1]?.replaceAll(',',''));
    await writeFile(resolve(output,`result-${stamp}.txt`),text);
    await page.screenshot({path:resolve(output,`result-${stamp}.jpg`),type:'jpeg'});
    await appendFile(resolve(output,'results.jsonl'),JSON.stringify({at:new Date().toISOString(),score,mode:'interactive; manual assistance possible',
      ...(endgame?.ctl?{endgame:{denseStart:endgame.ctl.denseStart,invalid:endgame.invalid,handoffs:endgame.handoffs.length}}:{})})+'\n');resultSeen=true;
  }
  // Loop timing per frame (ms), summarized in the progress lines: frame
  // interval, wait for the page text, the text read itself, wait for a new
  // screenshot, decode, analysis, and the screenshot's age when analysed;
  // stale counts frames that used the previous text. With --capture the
  // per-frame values are also written to timing.jsonl.
  let timing=[],lastTick=null,timingWrites=Promise.resolve();
  const writeTiming=()=>{
    if(flags.has('--capture')&&timing.length){const lines=timing.map(t=>JSON.stringify(t)).join('\n')+'\n';
      timingWrites=timingWrites.then(()=>appendFile(resolve(output,'timing.jsonl'),lines)).catch(()=>{});}
    return timingWrites;
  };
  const timingSummary=()=>{
    writeTiming();
    const out={};for(const k of ['dt','text','read','wait','decode','analyse','age']){const v=timing.map(t=>t[k]).filter(x=>x!=null).sort((a,b)=>a-b);
    if(v.length)out[k]=[v[v.length>>1],v[Math.floor(v.length*.9)],v.at(-1)].map(x=>Math.round(x));}
    const stale=timing.filter(t=>t.stale).length;if(stale)out.stale=stale;timing=[];return out;};
  // Without --capture, the frames and timing lines of the last few seconds
  // (--crash-frames-ms, default 4000; 0 turns this off) stay in memory, and a
  // run that ends early leaves them in a crash-<time>/ folder (crash-frames.mjs).
  const crashMs=Number(argv.find(a=>a.startsWith('--crash-frames-ms='))?.split('=')[1]??4000);
  const crash=!flags.has('--capture')&&crashMs>0?new CrashFrames({output,windowMs:crashMs}):null;
  const keepFrame=(line,image)=>crash?.push({f:line.f,shot:image.shot,line,at:image.captureStart,z:endgame?.zAt(image.captureStart),game:endgame?.gameStamp});
  // A run has ended (seen at time at): after its endgame log is saved, before
  // endgame.newGame().
  async function runEnded(reason,at=Date.now()){
    if(!crash)return;
    const endgameFile=endgame?.saved?resolve(output,`endgame-${endgame.gameStamp}.json`):null;
    try{const dir=await crash.end({reason,now:at,endgameFile});if(dir)console.log(JSON.stringify({crashFrames:dir}));}
    catch(error){await appendFile(resolve(output,'errors.log'),`${new Date().toISOString()} crash frames: ${error.stack||error}\n`).catch(()=>{});}
  }
  // Until the last random obstacles are passed, the early-game controller's
  // obstacle tracks go to the endgame planner (see junctionPilot). Its lane
  // prior comes from the endgame's lane model (its own lanes are -1..1, with
  // -1 on the left). Returns the analysis time (ms).
  function junctionStep(image,stage,now){
    if(!endgame.junction(now)){if(junctionPilot||endgame.ctl?.external){junctionPilot=null;endgame.external(null,now);}return 0;}
    const ctl=endgame.ctl,seen=ctl.seenPx;
    const lane=endgame.mode==='drive'||seen==null?ctl.state.target:LANE_X.reduce((b,x,i)=>Math.abs(x-seen)<Math.abs(LANE_X[b]-seen)?i:b,0);
    if(!junctionPilot){
      junctionCreating??=createConfiguredPilot(argv).then(p=>{junctionPilot=prepareManualHandoff(p,1-lane,stage,Date.now());}).catch(()=>{}).finally(()=>{junctionCreating=null;});
      return 0;
    }
    const jp=junctionPilot,t0=Date.now(),last=endgame.keys?.log.at(-1);
    jp.stageText=stage;jp.commandLane=jp.lane=1-lane;jp.sensorLagMs=now-(image.captureStart+image.captureEnd)/2;
    if(last)jp.lastMove=Math.max(jp.lastMove??-Infinity,last.sent);
    try{endgame.external(jp.analyse(image.frame,now),now);}catch(error){endgame.external(null,now);}
    const ms=Date.now()-t0;jp.analysisEstimate=.8*(jp.analysisEstimate??ms)+.2*ms;
    return ms;
  }
  // One endgame frame, with the bot on (steering) or off (following only).
  let endgameText=null,endgameFrames=0,endgamePuzzle=false,hudMissingSince=null,puzzleClosingUntil=0;
  async function endgameStep(tick){
    const enabled=control.enabled,token=control.generation;
    // Page text (result, puzzle, stage) and the endgame event log are read in
    // one round trip every fifth frame (each waits for the game's main thread);
    // the frame analysis itself does not need them. Near a mystery box the
    // bot may collect, every frame, so that its puzzle pause is seen at once.
    let probeMs=0;
    const closing=Date.now()<puzzleClosingUntil;
    if(!endgameText||endgamePuzzle||closing||endgameFrames%5===0||endgame.boxNear(tick)){
      const t0=Date.now(),read=await page.evaluate(()=>{const l=window.__endgameLog;
        return {text:document.body.innerText,log:l?{stage:l.stage.splice(0),pause:l.pause.splice(0),hidden:l.hidden.splice(0)}:null};}).catch(()=>null);
      probeMs=Date.now()-t0;
      if(!read){if(!endgameText){await sleep(50);return;}}
      else{endgameText=read.text;await endgame.ingest(read.log);}
    }
    const text=endgameText;endgameFrames++;
    const leave=async reason=>{await endgame.save(reason);await runEnded(reason,hudMissingSince??Date.now());endgame.newGame();endgameText=null;endgamePuzzle=false;hudMissingSince=null;puzzleClosingUntil=0;junctionPilot=null;};
    if(text.includes('NEXT QUEST')){
      await recordResult(text);await leave('result');
      if(enabled)control.setEnabled(false,'Run ended · start a new game');return;
    }
    if(enabled&&cookieNoticeShown(text)){control.setEnabled(false,COOKIE_NOTICE);return;}
    const puzzleText=/GHÉP HÌNH|THỬ THÁCH BẤT NGỜ/.test(text);
    // After the continue click the puzzle window fades out for a few hundred ms
    // with its text still on the page, while the game already runs (live game
    // i-018 went 0.48 s without steering and hit the fence 15 m past the box).
    // Unless a new puzzle screen has appeared since, steer from the lane model.
    if(puzzleText&&closing&&!endgame.puzzleSince(endgame.lastResumeClick)){
      endgame.steerFromModel(FINAL_STAGE);await sleep(15);return;
    }
    if(puzzleText){
      endgamePuzzle=true;puzzleClosingUntil=0;endgame.pause();
      const clicked=endgame.lastResumeClick;
      if(enabled){await release();if(live(token))await puzzleStep(token);}
      if(endgame.lastResumeClick!==clicked&&endgame.tracking){
        // Continue clicked: the game runs again. Resume the clock (from the click
        // time; the page's own resume event is read later) and steer at once.
        endgamePuzzle=false;puzzleClosingUntil=Date.now()+1500;endgame.resume();
        if(endgame.tracking)endgame.steerFromModel(FINAL_STAGE);
        return;
      }
      await sleep(70);return;
    }
    if(endgamePuzzle){endgamePuzzle=false;await endgame.sync(page);endgame.resume();if(!endgame.tracking)return;}
    if(!text.includes('Điểm số')||text.includes('Đang vào game')){
      hudMissingSince??=Date.now();endgameText=null;
      if(Date.now()-hudMissingSince>3000)await leave('left the track');else await sleep(50);
      return;
    }
    hudMissingSince=null;resultSeen=false;
    const stage=stageFrom(text)||FINAL_STAGE;
    const image=await capture();
    if(closed)return;
    const now=Date.now(),regain=enabled&&live(token)&&(endgame.mode!=='drive'||endgame.driveToken!==token);
    if(!enabled||!live(token)||regain)endgame.shadow(now);
    const junctionMs=junctionStep(image,stage,now);
    const s0=Date.now(),record=await endgame.step(image.frame,{captureMs:image.captureStart,stage});
    record.timing={probe:probeMs,wait:image.waitMs,decode:image.decodeMs,step:Date.now()-s0,since:tick-(endgame.lastTick??tick),...(junctionMs?{junction:junctionMs}:{})};endgame.lastTick=tick;
    // f is this frame's number, as its --capture file is named (until
    // 2026-10-22 an endgame line had the number of the frame before).
    frames++;
    const line={f:frames,at:now,stage,dt:record.timing.since,text:probeMs,wait:image.waitMs,decode:image.decodeMs,analyse:record.timing.step,age:now-image.captureStart};
    timing.push(line);keepFrame(line,image);
    if(regain){
      // Control comes back: keep following until the runner is seen settled in a lane.
      const lane=settled.observe(endgame.ctl.lastMeasured,image.captureStart,image.frame);
      if(lane===null)control.status('Finding runner…');
      else{endgame.drive(Date.now(),lane,token);control.status('Bot running · F8 takes over');}
    }
    if(flags.has('--capture'))await saveFrame(image.shot);
    if(Date.now()-lastReport>5000){
      lastReport=Date.now();const progress={frames,score:Number(text.match(/Điểm số\s*([\d,]+)/)?.[1]?.replaceAll(',','')),stage,z:record.zFrame,endgame:record.mode,enabled:control.enabled,timing:timingSummary()};
      await writeFile(resolve(output,'progress.json'),JSON.stringify(progress,null,2));console.log(JSON.stringify(progress));
    }
    await sleep(Math.max(0,lateFrameInterval-(Date.now()-tick)));
  }
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await keepGameTab(page);
    // Warm up the controllers and the page-text path while the menu loads, so
    // the first seconds of a run are not slowed by unoptimized code (--no-warmup skips).
    if(!flags.has('--no-warmup')){
      control.status('Warming up…');
      const warm=await warmUp({argv,sharp}).catch(error=>({error:error.message}));
      for(let i=0;i<3;i++)await readText().catch(()=>null);
      console.log(JSON.stringify({warmUp:warm}));
    }
    console.log('Browser ready. F8 toggles the bot; Esc stops it. Bot starts OFF. Close the browser to exit.');
    let lastSync=0;
    while(!closed&&!page.isClosed()){
      const iterationGeneration=control.generation;
      try{
        await resetting;
        if(needsVersionCheck){
          const here=new URL(page.url()),wanted=new URL(url);
          if(here.origin!==wanted.origin){control.availability(false,'Return to the game tab');needsVersionCheck=false;continue;}
          const scripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.src));
          const matched=!expected||scripts.some(s=>s.endsWith('/'+expected));
          await writeFile(resolve(output,'game-version.json'),JSON.stringify({checkedAt:new Date().toISOString(),moduleScripts:scripts,expectedBundle:expected,matched},null,2));
          control.availability(matched,matched?'You control the game':'Game updated · bot needs review');needsVersionCheck=false;
        }
        // The endgame loop runs once the endgame controller follows the course,
        // except while the early-game controller still steers: before
        // TAKEOVER_Z, and until it has handed over.
        const pilotSteers=control.enabled&&endgame?.mode!=='drive'&&(pilot&&currentToken===control.generation||!endgame?.steering(Date.now()));
        if(endgame?.tracking&&control.available&&!pilotSteers){await endgameStep(Date.now());continue;}
        if(!control.enabled){
          if(pilot||scheduler||stream.active)await reset();
          // Watch the visible stage labels so that the endgame controller can
          // start following the course (FOLLOW_Z) while you play.
          if(endgame&&control.available&&Date.now()-lastSync>250){
            lastSync=Date.now();await endgame.sync(page);
            if(endgame.ready(endgame.stage,Date.now()))endgame.start(Date.now(),null);
          }
          await sleep(50);continue;
        }
        const token=control.generation,tick=Date.now();
        // While the run is on screen, the frame waits at most 25 ms for the page
        // text; a slower read goes on during the screenshot and analysis, and
        // the frame uses the previous text (page-text.mjs). The screenshot is
        // taken after the text, so it is as fresh as before. On other screens
        // the text is awaited, and --sequential-text keeps the original read.
        const read=sequentialText?{text:await readText(),stale:false}:await pageText.get({stale:playingText(pageText.lastText)});
        const text=read.text,textMs=Date.now()-tick;if(!live(token))continue;
        if(text===null){await sleep(100);continue;}
        if(text.includes('NEXT QUEST')){
          await recordResult(text);await endgame?.save('result');await runEnded('result');endgame?.newGame();
          control.setEnabled(false,'Run ended · start a new game');continue;
        }
        if(cookieNoticeShown(text)){control.setEnabled(false,COOKIE_NOTICE);continue;}
        if(/GHÉP HÌNH|THỬ THÁCH BẤT NGỜ/.test(text)){
          await reset();if(live(token))await puzzleStep(token);await sleep(70);continue;
        }
        if(!text.includes('Điểm số')||text.includes('Đang vào game')){
          await reset();if(live(token))await setupStep(token);await sleep(100);continue;
        }
        resultSeen=false;
        const stage=stageFrom(text);if(!stage){control.setEnabled(false,'Use the Hanoi course');continue;}
        if(endgame&&(stage===FINAL_STAGE||Date.now()-lastSync>250)){
          lastSync=Date.now();await endgame.sync(page);
          // From FOLLOW_Z the endgame controller follows the course (below, on
          // the early-game controller's frames).
          if(endgame.ready(stage,Date.now()))endgame.start(Date.now(),pilot&&currentToken===token?1-pilot.commandLane:null);
          // Hand the run from the early-game pilot to the endgame controller at
          // TAKEOVER_Z, between two of its moves (or 15 m on in any case). Its
          // tracks of the last random obstacles stay with the endgame planner.
          if(pilot&&currentToken===token&&endgame.steering(Date.now())){
            // Not while it is about to pass an obstacle it tracks (~350 ms, 15 m).
            const passing=[...(lastDecision?.trackedFences??[]),...(lastDecision?.softObstacles??[])].some(o=>Number.isFinite(o.impact)&&o.impact-Date.now()>-150&&o.impact-Date.now()<350);
            const calm=!scheduler?.queue?.length&&!scheduler?.active&&Date.now()-pilot.lastMove>300&&!passing;
            if(calm||endgame.zAt(Date.now())>=TAKEOVER_Z+15){
              await scheduler?.drain();if(!live(token))continue;
              const now=Date.now(),lane=1-pilot.commandLane;endgame.drive(now,lane,token);
              junctionPilot=endgame.junction(now)?pilot:null;
              console.log(JSON.stringify({endgameTakeover:{z:endgame.zAt(now).toFixed(1),lane,calm}}));
              scheduler=null;pilot=null;
              continue;
            }
          }
        }
        const image=await capture();if(!live(token))continue;
        const now=Date.now();
        if(!pilot||currentToken!==token){
          control.status('Finding runner…');
          const lane=handoff.observe(image.frame,now);if(lane===null){await sleep(frameInterval);continue;}
          const configured=await createConfiguredPilot(argv);if(!live(token))continue;
          pilot=prepareManualHandoff(configured,lane,stage,now);currentToken=token;
          const controlled=pilot;
          scheduler=new InterruptibleScheduler({
            refreshDuringSingleInput:flags.has('--refresh-during-single-input'),allowed:()=>live(token),getLane:()=>controlled.commandLane,
            onSent:(key,at)=>{
              if(key==='ArrowUp'){controlled.lastJump=at;controlled.lastAutoJump=at;}
              else{controlled.commandLane=Math.max(-1,Math.min(1,controlled.commandLane+(key==='ArrowRight'?1:-1)));controlled.lane=controlled.commandLane;controlled.lastMove=at;}
            },press:async k=>{const sent=Date.now();await key(k,token);controlled.observeCommandDuration(Date.now()-sent);}
          });
          control.status('Bot running · F8 takes over');
        }
        const controlled=pilot,queue=scheduler;
        if(queue.error)throw queue.error;
        controlled.stageText=stage;controlled.sensorLagMs=now-(image.captureStart+image.captureEnd)/2;
        if(flags.has('--flush-due-actions'))queue.flushDue();
        const state=Object.fromEntries(['commandLane','lane','lastMove','lastJump','lastAutoJump'].map(k=>[k,controlled[k]]));
        const decision=controlled.analyse(image.frame,now),analysisMs=Date.now()-now;
        controlled.analysisEstimate=.8*controlled.analysisEstimate+.2*analysisMs;
        Object.assign(controlled,state);
        if(!live(token))continue;
        if(flags.has('--flush-due-actions'))queue.flushDue();
        const events=[],groups=[];
        if(decision.trackedFences?.length||decision.softObstacles?.length||controlled.deadlineRewards){
          if(decision.routeAuthorized)groups.push(...routeGroups(decision.plan?.route||[],{clock:decision.planSendClock??(now+analysisMs),horizon:400,events,hopInputMs:controlled.hopInputMs??40,atomic:flags.has('--atomic-route')}));
          if(decision.keys.includes('ArrowUp'))groups.push({at:Date.now(),events,commands:[{key:'ArrowUp',offset:0}]});
        }else if(decision.commands?.length)groups.push({at:now,from:state.commandLane,events,commands:decision.commands.map(c=>({key:c.key,offset:c.atMs}))});
        commitRoute(queue,groups,state,controlled,flags.has('--guard-plan-state'));
        // Before the takeover the endgame controller follows on the same frames
        // (after this frame's keys are scheduled), and already measures the
        // ground contact of the fences this controller tracks.
        let followMs;lastDecision=decision;
        if(endgame?.tracking&&endgame.mode!=='drive'){const f0=Date.now();if(endgame.junction(now))endgame.external(decision,now);
          await endgame.step(image.frame,{captureMs:image.captureStart,stage});followMs=Date.now()-f0;}
        frames++;
        if(flags.has('--capture'))await saveFrame(image.shot);
        const line={f:frames,at:now,stage,dt:tick-(lastTick??tick),text:textMs,read:read.readMs,stale:read.stale||undefined,textAge:read.ageMs,jump:decision.keys?.includes('ArrowUp')?1:undefined,score:hudScore(text),pen:penaltyShown(text),pop:popupsShown(text),
          wait:image.waitMs,decode:image.decodeMs,analyse:analysisMs,follow:followMs,age:now-image.captureStart};
        timing.push(line);keepFrame(line,image);lastTick=tick;
        if(Date.now()-lastReport>5000){
          lastReport=Date.now();const progress={frames,score:Number(text.match(/Điểm số\s*([\d,]+)/)?.[1]?.replaceAll(',','')),stage,analysisMs,enabled:control.enabled,timing:timingSummary()};
          await writeFile(resolve(output,'progress.json'),JSON.stringify(progress,null,2));console.log(JSON.stringify(progress));
        }
        await sleep(Math.max(0,(stage===FINAL_STAGE?lateFrameInterval:frameInterval)-(Date.now()-tick)));
      }catch(error){
        if(closed||page.isClosed())break;
        // A stop, or a quick stop/start, can invalidate the old pending capture.
        if(!control.enabled||control.generation!==iterationGeneration){await sleep(50);continue;}
        control.setEnabled(false,'Bot stopped · check session log');
        await appendFile(resolve(output,'errors.log'),`${new Date().toISOString()} ${error.stack||error}\n`);
        console.error(error.message);
      }
    }
  }finally{
    closed=true;control.setEnabled(false,'Stopped');await reset();await resetting;
    await endgame?.save('stopped').catch(()=>{});
    timingSummary();await timingWrites;
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const settings=JSON.parse(await readFile(new URL('./interactive-settings.json',import.meta.url),'utf8'));
  const argv=[...settings.args,...process.argv.slice(2)];
  if(argv.includes('--headless'))throw new Error('Interactive mode needs a visible browser. Remove --headless.');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  // Logs and the browser profile go to work/ in this repo unless set otherwise.
  const workRoot=resolve(process.env.SC_BOT_WORKSPACE||fileURLToPath(new URL('..',import.meta.url)),'work');
  const output=resolve(process.env.SC_BOT_OUTPUT||resolve(workRoot,`interactive-${stamp}`));
  const profile=resolve(process.env.SC_BOT_BROWSER_PROFILE||resolve(workRoot,'interactive-browser-profile'));
  const channel=argv.includes('--edge')?'msedge':argv.includes('--chromium')?'chromium':'chrome';
  const userBrowser=await launchUserBrowser(chromium,{profile,channel});
  const {context,page}=userBrowser;
  try{await runInteractive({context,page,argv,output});}
  finally{await userBrowser.close();}
}
