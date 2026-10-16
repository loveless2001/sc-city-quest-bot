import test from 'node:test';
import assert from 'node:assert/strict';
import {OverlappedText,playingText} from '../src/page-text.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// A read that returns the given texts in turn, each after its delay (ms).
function reads(...steps){
  let i=0,calls=0;
  const read=async()=>{calls++;const [text,ms]=steps[Math.min(i++,steps.length-1)];await sleep(ms);if(text instanceof Error)throw text;return text;};
  return {read,calls:()=>calls};
}

test('a quick read is used fresh',async()=>{
  const r=reads(['HUD 1',5]),t=new OverlappedText(r.read,{graceMs:25});
  const got=await t.get();
  assert.equal(got.text,'HUD 1');assert.equal(got.stale,false);assert.ok(got.readMs>=4);
});

test('a slow read falls back to the last text without waiting for it',async()=>{
  const r=reads(['HUD 1',5],['HUD 2',120]),t=new OverlappedText(r.read,{graceMs:25,maxAgeMs:250});
  await t.get();
  const t0=Date.now(),got=await t.get(),waited=Date.now()-t0;
  assert.equal(got.text,'HUD 1');assert.equal(got.stale,true);assert.ok(waited<60,`waited ${waited} ms`);
  // The slow read keeps running (no second read) and is used once it is done.
  const again=await t.get();assert.equal(again.text,'HUD 1');assert.equal(r.calls(),2);
  await sleep(120);assert.equal(t.lastText,'HUD 2');
  const later=await t.get();assert.equal(later.text,'HUD 2');
});

test('without a recent text the running read is awaited',async()=>{
  const r=reads(['HUD 1',80]),t=new OverlappedText(r.read,{graceMs:25,maxAgeMs:250});
  const got=await t.get();assert.equal(got.text,'HUD 1');assert.equal(got.stale,false);
  // Old text (started more than maxAgeMs ago) is not reused.
  const old=new OverlappedText(reads(['A',1],['B',80]).read,{graceMs:10,maxAgeMs:30});
  await old.get();await sleep(40);
  const fresh=await old.get();assert.equal(fresh.text,'B');assert.equal(fresh.stale,false);
});

test('stale:false always awaits the running read',async()=>{
  const r=reads(['A',1],['B',60]),t=new OverlappedText(r.read,{graceMs:10});
  await t.get();const got=await t.get({stale:false});assert.equal(got.text,'B');assert.equal(got.stale,false);
});

test('a timed-out read (null) keeps the last text, and an error is reported once',async()=>{
  const r=reads(['A',1],[null,1],[new Error('page stuck'),1],['C',1]),t=new OverlappedText(r.read,{graceMs:25});
  await t.get();
  const timedOut=await t.get();assert.equal(timedOut.text,null);assert.equal(t.lastText,'A');
  await assert.rejects(t.get(),/page stuck/);
  const after=await t.get();assert.equal(after.text,'C');
});

test('an error in a read that ran in the background is reported on the next get',async()=>{
  const r=reads(['A',1],[new Error('page stuck'),60],['C',1]),t=new OverlappedText(r.read,{graceMs:10,maxAgeMs:250});
  await t.get();
  const stale=await t.get();assert.equal(stale.stale,true);
  await sleep(80);
  await assert.rejects(t.get(),/page stuck/);
  assert.equal((await t.get()).text,'C');
});

test('only the running game counts as playing',()=>{
  assert.equal(playingText('Hanoi Nhập cuộc\nĐiểm số 310'),true);
  for(const text of [null,'','Đang vào game Điểm số','Hanoi Bứt phá Điểm số 10 GHÉP HÌNH','THỬ THÁCH BẤT NGỜ Điểm số','NEXT QUEST Điểm Số 31,000 Điểm số'])
    assert.equal(playingText(text),false,text);
});
