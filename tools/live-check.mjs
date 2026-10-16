// Live check of the merged interactive edition: runs interactive-play in its own
// visible Chrome window and presses F8 as a player would. The bot is turned on
// at the menu (it selects Guest and Hanoi); with --toggle it is turned off and
// back on inside the obstacle-free stretch after 2806 m (off at the "Bứt phá"
// label + offMs, on again offForMs later). One game per call.
// Usage (from the repo root): node tools/live-check.mjs <outputDir> [--edge] [--toggle] [offMs=8000] [offForMs=2000]
// Needs the user's approval (live run) and an idle ChatGPT batch.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
const [outArg,...rest]=process.argv.slice(2);
const edge=rest.includes('--edge'),toggle=rest.includes('--toggle'),nums=rest.filter(a=>/^\d+$/.test(a)).map(Number);
const offMs=nums[0]??8000,offForMs=nums[1]??2000;
const require=createRequire(process.env.SC_BOT_DEPENDENCIES?resolve(process.env.SC_BOT_DEPENDENCIES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const {runInteractive}=await import('../src/interactive-play.mjs');
const {launchUserBrowser}=await import('../src/user-browser.mjs');
const settings=JSON.parse(readFileSync(new URL('../src/interactive-settings.json',import.meta.url),'utf8'));
const output=resolve(outArg);mkdirSync(output,{recursive:true});
const argv=[...settings.args,'--age-authorized','--capture'];
const profile=fileURLToPath(new URL(edge?'../work/live-check-profile-edge':'../work/live-check-profile',import.meta.url));
const browser=await launchUserBrowser(chromium,{profile,channel:edge?'msedge':'chrome'});
const {page}=browser;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(new Date().toISOString().slice(11,23),...a);
// Driver: F8 at the menu, optional off/on in the breather, stop after the result.
const driver=(async()=>{
  await sleep(4000);
  for(let i=0;i<40&&!page.isClosed();i++){
    const text=await page.locator('body').innerText().catch(()=>'');
    if(/Start bot|Stop bot/.test(text)||text.includes('Bắt đầu chạy')||text.includes('Chơi'))break;await sleep(500);
  }
  // F8 only works once the game version has been checked: retry until the
  // panel shows the bot as on.
  const isOn=()=>page.locator('#city-quest-bot-controls button').getAttribute('aria-pressed').then(v=>v==='true').catch(()=>false);
  for(let i=0;i<10&&!await isOn();i++){
    // F8 as a player would; every third try click the panel's button instead.
    if(i%3===2)await page.locator('#city-quest-bot-controls button').click({timeout:2000}).catch(()=>{});else await page.keyboard.press('F8');
    await sleep(1000);
  }
  if(!await isOn()){log('could not turn the bot on');await browser.close();return;}
  log('F8: bot on');
  let finalSeen=null,toggled=false;
  while(!page.isClosed()){
    const text=await page.locator('body').innerText().catch(()=>'');
    if(text.includes('NEXT QUEST')){log('result screen');await sleep(3000);break;}
    if(toggle&&!toggled&&/Hanoi\s+Bứt phá/.test(text)){
      finalSeen??=Date.now();
      if(Date.now()-finalSeen>offMs){
        await page.keyboard.press('F8');log('F8: bot off (player)',await isOn());await sleep(offForMs);
        await page.keyboard.press('F8');await sleep(100);log('F8: bot on again',await isOn());toggled=true;
      }
    }
    await sleep(200);
  }
  await browser.close();
})();
try{await runInteractive({context:page.context(),page,argv,output});}
catch(e){log('runInteractive ended:',e.message);}
await driver.catch(e=>log('driver:',e.message));
const results=existsSync(resolve(output,'results.jsonl'))?readFileSync(resolve(output,'results.jsonl'),'utf8').trim():'(no result)';
log('results',results);
