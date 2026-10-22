import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FrameRing,CrashFrames,endedEarly,earlyBefore,FRESH_MS} from '../src/crash-frames.mjs';
import {withCourse} from '../src/endgame-v3-course.mjs';

// One analysed frame every 40 ms from t0 (capture time), analysed 30 ms later,
// at distances z(i) (null: no clock), with its timing line as the bot writes it.
function frames(n,{t0=1e12,f0=1,z=i=>4000+2*i,game=1}={}){
  return Array.from({length:n},(_,i)=>{
    const at=t0+40*i,f=f0+i;
    return {f,shot:Buffer.from(`jpeg ${f}`),line:{f,at:at+30,stage:'Bứt phá',analyse:12,age:30},at,z:z(i),game};
  });
}
async function withDir(fn){const dir=await mkdtemp(join(tmpdir(),'crash-frames-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const lines=text=>text.trim().split('\n').map(l=>JSON.parse(l));

test('the ring keeps the frames of the last windowMs, oldest first, by reference',()=>{
  const ring=new FrameRing({windowMs:4000}),all=frames(250);
  for(const e of all)ring.push(e);
  const kept=ring.items(),last=all.at(-1);
  assert.equal(kept.length,101);assert.equal(kept[0].at,last.at-4000);assert.equal(kept.at(-1),last);
  assert.ok(kept.every((e,i)=>i===0||e.at>kept[i-1].at));
  assert.equal(kept.at(-1).shot,last.shot);
  ring.clear();assert.deepEqual(ring.items(),[]);
});

test('the ring holds at most its capacity',()=>{
  const ring=new FrameRing({windowMs:4000,capacity:5});
  for(const e of frames(12))ring.push(e);
  assert.deepEqual(ring.items().map(e=>e.f),[8,9,10,11,12]);
  // 50 frames a second at most by default.
  assert.equal(new FrameRing({windowMs:4000}).slots.length,200);
});

test('a run ended early when its furthest distance is short of the last sliding range',()=>{
  assert.equal(earlyBefore(),8540);
  assert.equal(withCourse('DnBWvl2N',earlyBefore),7500);
  for(const z of [null,undefined,NaN,0,4390,8539.9])assert.equal(endedEarly(z),true,String(z));
  for(const z of [8540,8996,9172.5])assert.equal(endedEarly(z),false,String(z));
});

test('an early end writes the last frames, their timing lines, the endgame log and a summary',()=>withDir(async dir=>{
  const crash=new CrashFrames({output:dir,windowMs:4000}),all=frames(250,{f0:2701});
  for(const e of all)crash.push(e);
  const egFile=join(dir,'endgame-1792660163886.json');await writeFile(egFile,JSON.stringify({records:[]}));
  const last=all.at(-1),out=await crash.end({reason:'result',now:last.at+300,endgameFile:egFile});
  assert.equal(out,join(dir,`crash-${last.at+300}`));
  const files=await readdir(out),jpgs=files.filter(f=>f.endsWith('.jpg')).sort();
  assert.equal(jpgs.length,101);assert.equal(jpgs[0],'frame-002850.jpg');assert.equal(jpgs.at(-1),'frame-002950.jpg');
  assert.equal(String(await readFile(join(out,'frame-002950.jpg'))),'jpeg 2950');
  assert.ok(files.includes('endgame-1792660163886.json'));
  // As the replay tools read them: every line's frame is there, and at - age is
  // the capture time of that frame.
  const timing=lines(await readFile(join(out,'timing.jsonl'),'utf8'));
  assert.equal(timing.length,101);
  for(const t of timing){assert.ok(files.includes(`frame-${String(t.f).padStart(6,'0')}.jpg`));assert.equal(t.at-t.age,all[t.f-2701].at);}
  const summary=JSON.parse(await readFile(join(out,'crash.json'),'utf8'));
  assert.deepEqual(summary,{reason:'result',endedAt:new Date(last.at+300).toISOString(),furthestZ:4498,earlyBefore:8540,
    frames:101,first:2850,last:2950,lastZ:4498,hit:{f:2925,z:4448}});
  // The buffer starts over.
  assert.equal(await crash.end({reason:'result',now:last.at+400}),null);
}));

test('a full-course game writes nothing, also after the clock jumps back at the course end',()=>withDir(async dir=>{
  const crash=new CrashFrames({output:dir});
  // The revival puzzle at ~9,000 m is taken for a box pause: the clock then reads ~4,855 m.
  const all=frames(300,{z:i=>i<200?8600+2.1*i:4855+2*(i-200)});
  for(const e of all)crash.push(e);
  assert.equal(await crash.end({reason:'result',now:all.at(-1).at+200}),null);
  assert.deepEqual(await readdir(dir),[]);
}));

test('an end the bot did not watch writes nothing',()=>withDir(async dir=>{
  const crash=new CrashFrames({output:dir}),all=frames(100);
  for(const e of all)crash.push(e);
  assert.equal(await crash.end({reason:'result',now:all.at(-1).at+FRESH_MS+1}),null);
  assert.deepEqual(await readdir(dir),[]);
}));

test('a new game starts the buffer and the furthest distance over',()=>withDir(async dir=>{
  const crash=new CrashFrames({output:dir});
  const first=frames(100,{z:i=>8900+i,game:1}),second=frames(60,{t0:first.at(-1).at+60000,f0:101,z:()=>null,game:2});
  for(const e of [...first,...second])crash.push(e);
  // No clock in the second game (it ended before its first stage change): early.
  const out=await crash.end({reason:'result',now:second.at(-1).at+100});
  assert.ok(out);
  const jpgs=(await readdir(out)).filter(f=>f.endsWith('.jpg'));
  assert.equal(jpgs.length,60);assert.ok(jpgs.every(f=>+f.slice(6,12)>100));
  const summary=JSON.parse(await readFile(join(out,'crash.json'),'utf8'));
  assert.equal(summary.furthestZ,null);assert.equal(summary.lastZ,null);
}));
