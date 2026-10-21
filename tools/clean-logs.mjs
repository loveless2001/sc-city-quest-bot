// Clears old logs: moves session logs, bench outputs and, with --cache or --all,
// the browser caches to the Recycle Bin. Nothing is deleted outright, so a
// mistake can be restored from there. The browser profiles themselves stay
// (sign-ins, settings and the 18+ confirmation are kept).
// Usage (from the repo root, or double-click "Clear Old Logs.cmd"):
//   node tools/clean-logs.mjs [--keep=N] [--all] [--cache] [--dry-run] [--yes]
//   --keep=N   keep the newest N session folders that hold a game (default 3);
//              folders without a game (the bot started, nothing played) go too
//   --all      keep no session logs, and clear the browser caches
//   --cache    also clear the browser caches (the game downloads them again)
//   --dry-run  list what would go and change nothing
//   --yes      do not ask first
// A session or profile in use (the bot or a live check running) is left alone.
import {readdirSync,lstatSync,existsSync,readFileSync,writeFileSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';

const args=process.argv.slice(2);
const bad=args.filter(a=>!/^--(all|cache|dry-run|yes|keep=\d+)$/.test(a));
if(bad.length){console.error(`Unknown option: ${bad.join(' ')}\nOptions: --keep=N --all --cache --dry-run --yes`);process.exit(2);}
if(process.platform!=='win32'){console.error('This script moves files to the Windows Recycle Bin and runs on Windows only.');process.exit(1);}
const all=args.includes('--all'),cache=all||args.includes('--cache'),dry=args.includes('--dry-run'),yes=args.includes('--yes');
const keep=all?0:Number(args.find(a=>a.startsWith('--keep='))?.slice(7)??3);

// The same locations as src/interactive-play.mjs and tools/live-check.mjs.
const repo=fileURLToPath(new URL('..',import.meta.url));
const work=resolve(process.env.SC_BOT_WORKSPACE||repo,'work');
const botProfile=resolve(process.env.SC_BOT_BROWSER_PROFILE||join(work,'interactive-browser-profile'));
const checkProfiles=[join(work,'live-check-profile'),join(work,'live-check-profile-edge')];

const list=p=>{try{return readdirSync(p,{withFileTypes:true});}catch{return [];}};
const dirs=p=>list(p).filter(d=>d.isDirectory()).map(d=>join(p,d.name));
// Bytes and the longest path inside.
function walk(p){
  try{const st=lstatSync(p);if(st.isSymbolicLink()||!st.isDirectory())return {bytes:st.isSymbolicLink()?0:st.size,longest:p.length};
    let bytes=0,longest=p.length;for(const d of list(p)){const w=walk(join(p,d.name));bytes+=w.bytes;longest=Math.max(longest,w.longest);}
    return {bytes,longest};}catch{return {bytes:0,longest:p.length};}
}
// The Windows shell cannot put a path of 260 characters or more (MAX_PATH) in
// the Recycle Bin: it asks to delete it permanently instead. Such items are
// left alone, with room to spare for the original path and for its path
// inside the bin (C:\$Recycle.Bin\<user SID>\$Rxxxxxx\..., about 80 characters).
const PATH_LIMIT=250,BIN_PREFIX=80;
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const mb=b=>b<1024?'<1 KB':b<0.05*2**20?`${Math.round(b/1024)} KB`:`${(b/2**20).toFixed(1)} MB`;
const when=ms=>new Date(ms).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
// A running browser holds "lockfile" open for writing (shared for reading
// only); the bot's own lock names its process.
function inUse(profile){
  if(!existsSync(profile))return false;
  try{closeSync(openSync(join(profile,'lockfile'),'r+'));}catch(e){if(e.code!=='ENOENT')return true;}
  try{process.kill(JSON.parse(readFileSync(join(profile,'city-quest-bot.lock'),'utf8')).pid,0);return true;}
  catch(e){return e.code==='EPERM';}
}
const botRunning=inUse(botProfile),checkRunning=checkProfiles.some(inUse);

// Session folders: interactive-<time> from the bot, work/live/<name> from live checks.
function sessions(paths,running){
  const out=paths.map(path=>{
    const files=list(path).map(d=>d.name);
    const results=files.includes('results.jsonl')?readFileSync(join(path,'results.jsonl'),'utf8').split('\n').filter(l=>l.trim()).length:0;
    const games=Math.max(results,files.filter(n=>/^result-.*\.txt$/.test(n)).length,files.some(n=>/^endgame-.*\.json$/.test(n))?1:0);
    return {path,games,mtime:lstatSync(path).mtimeMs,frames:files.filter(n=>/^frame-\d+\.jpg$/.test(n)).length};
  }).sort((a,b)=>b.mtime-a.mtime);
  // The newest one is being written while the bot (or a live check) runs.
  if(running&&out.length)out[0].inUse=true;
  return out;
}
const found=[
  ...sessions(dirs(work).filter(p=>/^interactive-\d{4}-/.test(basename(p))),botRunning),
  ...sessions(dirs(join(work,'live')),checkRunning),
].sort((a,b)=>b.mtime-a.mtime);
const remove=[],kept=[],skipped=[];
let withGame=0;
for(const s of found){
  const what=`${s.games?plural(s.games,'game'):'no game'}${s.frames?`, ${plural(s.frames,'frame')}`:''}, ${when(s.mtime)}`;
  const item={label:relative(work,s.path),what,paths:[s.path]};
  if(s.inUse)skipped.push({...item,why:'in use'});
  else if(s.games&&withGame<keep){withGame++;kept.push(item);}
  else remove.push(item);
}
// Bench outputs (rebuilt on every run) and stray log files.
const bench=join(work,'text-read-bench');
if(existsSync(bench))remove.push({label:'text-read-bench',what:'bench output',paths:[bench]});
for(const dir of [repo,work])for(const d of list(dir))if(d.isFile()&&/\.log$/i.test(d.name))
  remove.push({label:relative(work,join(dir,d.name)),what:'log file',paths:[join(dir,d.name)]});
// Browser caches: files the browser downloads or rebuilds by itself.
const ROOT_CACHES=['GrShaderCache','ShaderCache','GraphiteDawnCache','GPUPersistentCache'];
const PROFILE_CACHES=['Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache',join('Service Worker','CacheStorage'),join('Service Worker','ScriptCache')];
if(cache)for(const profile of [botProfile,...checkProfiles].filter(p=>existsSync(p))){
  const paths=[...ROOT_CACHES.map(c=>join(profile,c)),
    ...dirs(profile).filter(p=>/^(Default|Profile \d+)$/.test(basename(p))).flatMap(p=>PROFILE_CACHES.map(c=>join(p,c)))].filter(p=>existsSync(p));
  const item={label:relative(work,profile)||profile,what:`browser caches (${plural(paths.length,'folder')})`,paths};
  if(inUse(profile))skipped.push({...item,why:'browser open'});
  else if(paths.length)remove.push(item);
}

for(const r of [...remove]){
  const w=r.paths.map(walk);r.sizes=w.map(x=>x.bytes);r.bytes=r.sizes.reduce((s,b)=>s+b,0);
  const longest=Math.max(0,...w.map(x=>x.longest)),inBin=Math.max(0,...w.map((x,i)=>BIN_PREFIX+x.longest-r.paths[i].length));
  if(longest>=PATH_LIMIT||inBin>=PATH_LIMIT){remove.splice(remove.indexOf(r),1);
    skipped.push({...r,why:`paths too long for the Recycle Bin (up to ${Math.max(longest,inBin)} characters)`});}
}
const total=remove.reduce((s,r)=>s+r.bytes,0);
const width=Math.max(10,...[...remove,...kept,...skipped].map(r=>r.label.length));
const row=(r,extra='')=>`  ${r.label.padEnd(width)}  ${extra}${r.what}`;
console.log(`Work folder: ${work}`);
if(kept.length)console.log(`\nKeeping the newest ${plural(kept.length,'session')} with a game:\n${kept.map(r=>row(r)).join('\n')}`);
if(skipped.length)console.log(`\nLeft alone:\n${skipped.map(r=>row(r,`${r.why}: `)).join('\n')}`);
if(!remove.length){console.log('\nNothing to clear.');process.exit(0);}
console.log(`\nTo the Recycle Bin:\n${remove.map(r=>row(r,`${mb(r.bytes).padStart(9)}  `)).join('\n')}\n  ${'total'.padEnd(width)}  ${mb(total).padStart(9)}`);
if(!cache)console.log('\n(Browser caches stay; --cache or --all clears them too.)');
if(dry){console.log('\nDry run: nothing changed.');process.exit(0);}
if(!yes){
  if(!process.stdin.isTTY){console.log('\nRun again with --yes to clear these.');process.exit(0);}
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const answer=await rl.question('\nMove these to the Recycle Bin? [y/N] ');rl.close();
  if(!/^y(es)?$/i.test(answer.trim())){console.log('Nothing changed.');process.exit(0);}
}

// One item at a time, each found in the Recycle Bin afterwards (its $I record
// names the original path). Nothing is handed to the shell on a drive without
// a bin, with the bin turned off (NukeOnDelete) or when larger than the bin;
// an item that disappears without a record stops the run. FOF_ALLOWUNDO sends
// to the bin; FOF_WANTNUKEWARNING makes Windows ask before deleting anything it
// cannot recycle after all (answer No).
const RECYCLE=String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class CityQuestBin{
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  struct Op{public IntPtr hwnd;public uint func;public string from;public string to;public ushort flags;
    [MarshalAs(UnmanagedType.Bool)]public bool aborted;public IntPtr names;public string title;}
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SHFileOperation(ref Op op);
  public static int Recycle(string path){
    var op=new Op{func=3,from=path+"\0\0",flags=0x0040|0x0010|0x0004|0x4000};
    return SHFileOperation(ref op);}
}
'@
function Say($status,$path,$why=''){@($status,$path,$why) -join [char]9}
function Records($dir){@(Get-ChildItem -LiteralPath $dir -Force -Filter '$I*' -ErrorAction SilentlyContinue | ForEach-Object FullName)}
function Original($record){
  try{$b=[IO.File]::ReadAllBytes($record)
    if([BitConverter]::ToInt64($b,0) -eq 2){[Text.Encoding]::Unicode.GetString($b,28,([BitConverter]::ToInt32($b,24)-1)*2)}
    else{[Text.Encoding]::Unicode.GetString($b,24,520).TrimEnd([char]0)}}catch{''}
}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$volumes=@{};foreach($v in Get-CimInstance Win32_Volume){if($v.DriveLetter){$volumes[$v.Name]=[regex]::Match($v.DeviceID,'\{[^}]+\}').Value}}
# (Assigned first: Windows PowerShell passes a JSON array on as one object.)
$items=ConvertFrom-Json (Get-Content -Raw -Encoding UTF8 $env:CLEAN_LOGS_LIST)
foreach($item in $items){
  $path=$item.path;$root=[IO.Path]::GetPathRoot($path)
  if(-not $volumes.ContainsKey($root)){Say skip $path 'not on a drive with a Recycle Bin';continue}
  $bin=Get-ItemProperty -LiteralPath ('HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\Volume\'+$volumes[$root]) -ErrorAction SilentlyContinue
  if($bin.NukeOnDelete -eq 1){Say skip $path 'the Recycle Bin is turned off for this drive';continue}
  if($bin.MaxCapacity -and $item.bytes -ge $bin.MaxCapacity*1MB*0.9){Say skip $path 'larger than the Recycle Bin';continue}
  $dir=Join-Path $root ('$Recycle.Bin\'+$sid);$before=Records $dir
  $code=[CityQuestBin]::Recycle($path)
  $found=@(Records $dir | Where-Object {$before -notcontains $_} | Where-Object {(Original $_) -eq $path})
  if($found.Count){Say moved $path}
  elseif(Test-Path -LiteralPath $path){Say left $path "Windows did not move it, code $code"}
  else{Say lost $path;break}
}
`;
const units=remove.flatMap(r=>r.paths.map((path,i)=>({path,bytes:r.sizes[i]}))),listFile=join(tmpdir(),`city-quest-clean-${process.pid}.json`);
writeFileSync(listFile,JSON.stringify(units));
let out;
try{
  out=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(RECYCLE,'utf16le').toString('base64')],
    {env:{...process.env,CLEAN_LOGS_LIST:listFile},encoding:'utf8',windowsHide:true});
}finally{try{unlinkSync(listFile);}catch{}}
const status=new Map();
for(const line of (out.stdout||'').split(/\r?\n/)){const [s,path,why]=line.split('\t');if(path)status.set(path,{s,why});}
const moved=remove.filter(r=>r.paths.every(p=>status.get(p)?.s==='moved')),notMoved=remove.filter(r=>!moved.includes(r));
console.log(`\nMoved ${moved.length} of ${remove.length} to the Recycle Bin (${mb(moved.reduce((s,r)=>s+r.bytes,0))}).`);
const why=r=>r.paths.map(p=>status.get(p)).find(v=>v?.s!=='moved')?.why||'not tried';
if(notMoved.length)console.log(`Not moved:\n${notMoved.map(r=>`  ${r.label.padEnd(width)}  ${why(r)}`).join('\n')}`);
const lost=[...status].find(([,v])=>v.s==='lost');
if(lost){console.error(`\nStopped: ${lost[0]} disappeared without reaching the Recycle Bin.`);process.exit(1);}
if(out.error||out.status||units.some(u=>!status.has(u.path))){
  console.error(`\nRecycle Bin step failed: ${out.error?.message||(out.stderr||'').trim()||(out.stdout||'').trim()||'no answer'}`);process.exit(1);}
