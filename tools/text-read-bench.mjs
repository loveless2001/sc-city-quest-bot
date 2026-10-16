// Offline browser replay of the interactive bot's early-game loop, to compare
// the page-text read always awaited before each screenshot (--sequential-text,
// the old loop) with the current loop: one-round-trip read, awaited at most
// 25 ms (page-text.mjs). No live game is contacted. The comparison of other
// variants (screenshot in parallel with the read; read during the pause before
// the frame) is in interactive-merge-REPORT.md; that code was removed.
//
// A local page replays the recorded frames of a live run (e.g. i-010) on a
// canvas at their recorded pace, with the HUD text (stage, score) in hidden
// DOM, as the game shows it. The page's animation frames carry main-thread work
// like a busy game: heavy for the first 10 s, light after. The run starts from
// a Guest button, shows a loading text, then the frames; one puzzle screen
// interrupts it and a result screen ends it. The real interactive loop
// (runInteractive, with the warm-up and the trial-427 pilot) plays it in
// headless Chrome; its keys reach the page but do not change the frames.
//
// Modes (BENCH_MODES, comma-separated): sequential (old loop), bounded (current).
// runDir is a game recorded with --capture (frame-*.jpg, plus timing.jsonl or a
// <runDir>.log of its progress lines for the stage changes).
// Usage (from the repo root): node tools/text-read-bench.mjs <runDir> [reps=3] [outDir=work/text-read-bench] [first=1] [last=600]
import {createServer} from 'node:http';
import {readFile,mkdir,rm} from 'node:fs/promises';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const [runArg,repsArg='3',outArg='work/text-read-bench',firstArg='1',lastArg='600']=process.argv.slice(2);
if(!runArg)throw new Error('Usage: node tools/text-read-bench.mjs <runDir> [reps] [outDir] [first] [last]');
const reps=+repsArg,outRoot=resolve(outArg),runDir=resolve(runArg),first=+firstArg,last=+lastArg;
const require=createRequire(process.env.SC_BOT_DEPENDENCIES?resolve(process.env.SC_BOT_DEPENDENCIES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const {runInteractive}=await import('../src/interactive-play.mjs');
const settings=JSON.parse(readFileSync(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
const bundle=settings.args.find(a=>a.startsWith('--expected-bundle=')).split('=')[1];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Stage changes of the recorded run (frame -> stage): from its per-frame
// timing.jsonl if it has one, else from the progress lines in <runDir>.log.
const stages=[[first,'Nhập cuộc']];
const frameStages=existsSync(runDir+'/timing.jsonl')
  ?readFileSync(runDir+'/timing.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l)).map(t=>[t.f,t.stage])
  :readFileSync(runDir+'.log','utf8').split('\n').map(l=>l.match(/^\{"frames":(\d+),"score":\d+,"stage":"([^"]+)"/)).filter(Boolean).map(m=>[+m[1],m[2]]);
for(const [f,stage] of frameStages)if(stage&&stage!==stages.at(-1)[1]&&f<=last)stages.push([f,stage]);
const config={first,last,frameMs:52,stages,puzzleAt:first+Math.round((last-first)*.45),puzzleMs:2500,loadingMs:1500,
  heavyMs:10000,heavy:{base:[8,30],spikeP:.04,spike:[60,100]},light:{base:[2,6],spikeP:.005,spike:[25,40]}};

const page=`<!doctype html><html><head><meta charset="utf-8"><title>replay</title>
<script type="module" src="/assets/${bundle}"></script>
<style>html,body{margin:0;background:#000;overflow:hidden;font:14px sans-serif}canvas{display:block}
#hud{position:fixed;left:0;top:0;opacity:0;white-space:pre;pointer-events:none}#menu{position:fixed;left:350px;top:300px;z-index:2}
#tick{position:fixed;right:0;bottom:0;width:2px;height:2px;background:#000;opacity:.02}#about{position:fixed;left:0;top:0;opacity:0;pointer-events:none}</style></head>
<body><canvas id="c" width="870" height="668"></canvas><div id="tick"></div>
<div id="menu"><button id="go">Chơi ngay (Guest)</button></div><div id="hud"></div>
<div id="about">${Array.from({length:40},(_,i)=>`Dòng hướng dẫn ${i}: Dùng 3 phím mũi tên để di chuyển, thu thập coin và word để tăng điểm.`).join('<br>')}</div>
<script>
const C=${JSON.stringify(config)},ctx=document.getElementById('c').getContext('2d'),hud=document.getElementById('hud'),tick=document.getElementById('tick');
const log=window.__bench={stages:[],puzzle:[],result:null,keys:0,started:null};
addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))log.keys++;});
const rand=([a,b])=>a+Math.random()*(b-a),burn=ms=>{const end=performance.now()+ms;while(performance.now()<end);};
const imgs=new Map(),want=i=>{if(i>C.last||imgs.has(i))return;const im=new Image();im.src='/frames/'+i+'.jpg';imgs.set(i,{im,ready:im.decode().then(()=>true,()=>false)});};
let state='menu',t0=0,paused=0,pauseStart=0,shown=0,score=0,stage=null,puzzleDone=false;
const stageAt=i=>{let s=C.stages[0][1];for(const [f,n] of C.stages)if(i>=f)s=n;return s;};
function setHud(extra=''){hud.innerHTML='<div>Hanoi</div><div class="stage-label">'+stage+'</div><div>Điểm số</div><div>'+score+'</div>'+extra;}
document.getElementById('go').onclick=()=>{if(state!=='menu')return;state='loading';document.getElementById('menu').remove();hud.textContent='Đang vào game';t0=performance.now();};
for(let i=C.first;i<C.first+30;i++)want(i);
function frame(){
  const now=performance.now();
  if(state==='loading'){burn(rand([30,120]));if(now-t0>C.loadingMs){state='run';t0=performance.now();log.started=Date.now();}}
  else if(state==='run'||state==='puzzle'){
    const runMs=now-t0-paused;
    burn(Math.random()<(runMs<C.heavyMs?C.heavy.spikeP:C.light.spikeP)?rand(runMs<C.heavyMs?C.heavy.spike:C.light.spike):rand(runMs<C.heavyMs?C.heavy.base:C.light.base));
    if(state==='puzzle'){
      if(now-pauseStart>C.puzzleMs){paused+=now-pauseStart;state='run';puzzleDone=true;setHud();log.puzzle.push({end:Date.now()});}
    }else{
      const i=Math.min(C.last,C.first+Math.floor(runMs/C.frameMs));
      for(let k=i;k<i+30;k++)want(k);
      const e=imgs.get(i);
      if(i!==shown&&e){e.ready.then(ok=>{if(ok&&state!=='result')ctx.drawImage(e.im,0,0);});shown=i;for(const k of imgs.keys())if(k<i-2)imgs.delete(k);}
      score=Math.round((i-C.first)*2.1);
      const s=stageAt(i);if(s!==stage){stage=s;setHud();log.stages.push({stage:s,at:Date.now()});}else if(i%10===0)setHud();
      if(!puzzleDone&&i>=C.puzzleAt){state='puzzle';pauseStart=now;setHud('<div>GHÉP HÌNH</div><div>THỬ THÁCH BẤT NGỜ</div>');log.puzzle.push({start:Date.now()});}
      if(i>=C.last&&runMs>(C.last-C.first+20)*C.frameMs){state='result';hud.textContent='KẾT QUẢ\\nĐiểm Số\\n'+score.toLocaleString('en-US')+'\\nNEXT QUEST';log.result=Date.now();}
    }
  }
  tick.style.right=(Math.random()*2)+'px';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script></body></html>`;

const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  try{
    if(url.pathname==='/')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(page);
    if(url.pathname==='/assets/'+bundle)return res.writeHead(200,{'content-type':'text/javascript'}).end('export {};');
    const m=url.pathname.match(/^\/frames\/(\d+)\.jpg$/);
    if(m)return res.writeHead(200,{'content-type':'image/jpeg'}).end(await readFile(`${runDir}/frame-${m[1].padStart(6,'0')}.jpg`));
  }catch{}
  res.writeHead(404).end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`;
if(process.env.BENCH_PAGE_ONLY){console.log('page',base);await new Promise(()=>{});}

const q=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(s.length*p))]);};
const stat=a=>({n:a.length,p50:q(a,.5),p90:q(a,.9),p99:q(a,.99),max:a.length?Math.round(Math.max(...a)):null});

// dt across the puzzle pause (over 1.5 s) is not a frame gap.
const summary=a=>({dt:stat(a.slice(1).map(t=>t.dt).filter(x=>x<1500)),text:stat(a.map(t=>t.text)),read:stat(a.map(t=>t.read).filter(x=>x!=null)),
  textAge:stat(a.map(t=>t.textAge).filter(x=>x!=null)),age:stat(a.map(t=>t.age)),stale:a.filter(t=>t.stale).length,n:a.length});

async function one(mode,rep){
  const output=resolve(outRoot,`${mode}-${rep}`);await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:870,height:668}}),page=await context.newPage();
  const argv=[...settings.args,'--age-authorized','--capture',...(mode==='sequential'?['--sequential-text']:[])];
  const ended=(async()=>{
    const isOn=()=>page.locator('#city-quest-bot-controls button').getAttribute('aria-pressed').then(v=>v==='true').catch(()=>false);
    for(let i=0;i<60&&!await isOn();i++){await page.keyboard.press('F8').catch(()=>{});await sleep(500);}
    const deadline=Date.now()+120000;
    while(Date.now()<deadline&&!existsSync(resolve(output,'results.jsonl')))await sleep(250);
    await sleep(500);
    const bench=await page.evaluate(()=>window.__bench).catch(()=>null);
    await browser.close();return bench;
  })();
  await runInteractive({context,page,argv,output,url:base}).catch(e=>console.log(mode,rep,'runInteractive ended:',e.message));
  const bench=await ended;
  const lines=existsSync(resolve(output,'timing.jsonl'))?readFileSync(resolve(output,'timing.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
  const controls=readFileSync(resolve(output,'controls.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const results=existsSync(resolve(output,'results.jsonl'))?readFileSync(resolve(output,'results.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
  const errors=existsSync(resolve(output,'errors.log'))?readFileSync(resolve(output,'errors.log'),'utf8'):'';
  // The analysed frames are only needed for inspection; keep the logs.
  for(const f of readdirSync(output))if(/^frame-\d+\.jpg$/.test(f))await rm(resolve(output,f));
  const start=bench?.started??lines[0]?.at,early=lines.filter(t=>t.at-start<10000),late=lines.filter(t=>t.at-start>=10000);
  // How late the loop saw each stage change, the puzzle and the result screen.
  const stageDelay=(bench?.stages??[]).slice(1).map(s=>{const r=lines.find(t=>t.stage===s.stage&&t.at>=s.at-5);return r?r.at-s.at:null;});
  const puzzleStart=bench?.puzzle?.find(p=>p.start)?.start,puzzleSeen=controls.find(c=>c.message?.startsWith('Solving puzzle')&&Date.parse(c.at)>=puzzleStart-5);
  const resultSeen=results[0]?Date.parse(results[0].at)-bench?.result:null;
  return {mode,rep,frames:lines.length,keys:bench?.keys,errors:errors.trim().split('\n').filter(Boolean).length,early,late,
    stageDelay,puzzleDelay:puzzleSeen?Date.parse(puzzleSeen.at)-puzzleStart:null,resultDelay:resultSeen,result:results[0]?.score??null,
    resumed:controls.filter(c=>c.message==='Bot running · F8 takes over').length};
}

const MODES=(process.env.BENCH_MODES||'sequential,bounded').split(',');
const all=[];
for(let rep=1;rep<=reps;rep++)for(const mode of rep%2?MODES:[...MODES].reverse()){
  const r=await one(mode,rep);all.push(r);
  console.log(JSON.stringify({mode,rep,frames:r.frames,keys:r.keys,errors:r.errors,early:summary(r.early),late:summary(r.late),stageDelay:r.stageDelay,puzzleDelay:r.puzzleDelay,resultDelay:r.resultDelay,resumed:r.resumed}));
}
server.close();
const fmt=s=>s.n?`${s.p50}/${s.p90}/${s.p99}/${s.max}`:'-';
console.log('\nPer run: mode rep frames keys errors resumed | stage delays | puzzle | result (ms)');
for(const r of all)console.log(`${r.mode.padEnd(10)} ${r.rep} ${r.frames} ${r.keys} ${r.errors} ${r.resumed} | ${r.stageDelay.join(',')} | ${r.puzzleDelay} | ${r.resultDelay}`);
console.log('\nPooled over runs, p50/p90/p99/max (ms):');
for(const part of ['early','late']){
  console.log(`\n${part==='early'?'first 10 s':'after 10 s'}: mode | frame gap | text wait | text read | text age | frame age at analysis | stale frames`);
  for(const mode of MODES){const s=summary(all.filter(r=>r.mode===mode).flatMap(r=>r[part]));
    console.log(`${mode.padEnd(10)} | ${fmt(s.dt)} | ${fmt(s.text)} | ${fmt(s.read)} | ${fmt(s.textAge)} | ${fmt(s.age)} | ${s.stale}/${s.n}`);}
}
