// Screenshots of every screen (offscreen Electron, the production main process and page). Never reaches the warp
// API: --shots blocks it and the session cancels any request to HoYoverse / miHoYo hosts.
//   --demo         a fresh profile in .realdata/demo-profile with the synthetic history of the tests (UID 800123456),
//                  the game files are not read at all; for the README (docs/screenshots by default).
//   --art-net      download the art of the shown items from StarRailRes (otherwise only what is cached).
//   --no-game      do not read the game cache (no current banners).
//   --seed=<file>  drop a store file into the profile; --archiver=<file> scan for the planner; --jade=<n> --extra=<n>.
//   --start        an empty profile: the start screen and the «link expired» state.
// Usage: .build-tools\electron\electron.exe scripts\shots.cjs --demo --art-net
'use strict';
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):d;};
const flag=k=>process.argv.includes('--'+k);
const root=path.resolve(__dirname,'..'),demo=flag('demo'),noGame=demo||flag('no-game');
const profile=path.resolve(process.env.HSRW_PROFILE||path.join(root,'.realdata',demo?'demo-profile':'profile'));process.env.HSRW_PROFILE=profile;
const out=path.resolve(arg('out',demo?path.join(root,'docs','screenshots'):path.join(root,'.realdata','shots')));fs.mkdirSync(out,{recursive:true});
if(demo){
 fs.rmSync(path.join(profile,'warps'),{recursive:true,force:true});fs.rmSync(path.join(profile,'banners'),{recursive:true,force:true});fs.rmSync(path.join(profile,'settings.json'),{force:true});
 const {makeWarpsHistory}=require('./fixtures/make_warps_history.cjs'),h=makeWarpsHistory();
 fs.mkdirSync(path.join(profile,'warps'),{recursive:true});fs.writeFileSync(path.join(profile,'warps',h.uid+'.json'),JSON.stringify(h));
}
const seed=arg('seed','');
if(seed){const h=JSON.parse(fs.readFileSync(seed,'utf8'));fs.mkdirSync(path.join(profile,'warps'),{recursive:true});fs.writeFileSync(path.join(profile,'warps',h.uid+'.json'),JSON.stringify(h));}
const width=Number(arg('width',1440)),archiver=arg('archiver',''),extra=arg('extra',demo?'0':'90'),jade=arg('jade',demo?'14400':'');
process.argv.push('--shots');if(noGame)process.argv.push('--no-game');
require('../app/main.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const blocked=[];session.defaultSession.webRequest.onBeforeRequest({urls:['*://*.hoyoverse.com/*','*://*.mihoyo.com/*']},(d,cb)=>{blocked.push(new URL(d.url).host);cb({cancel:true});});
 let win;for(let i=0;i<100&&!(win=BrowserWindow.getAllWindows()[0]);i++)await sleep(50);
 const js=code=>win.webContents.executeJavaScript(code,true);
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level==='warning')errors.push(e.level+': '+e.message);});
 for(let i=0;i<200&&!(await js('!!(window.AppState&&AppState.ready)').catch(()=>false));i++)await sleep(100);
 if(noGame)await js(`AppState.cache={pageTypes:{},banners:[]};App.rebuild();App.draw()`);
 const found=noGame?null:await js('App.find()');
 // Art: wait for the on-demand download (started by the page) to finish.
 if(flag('art-net')){await js('App.fetchArt()');for(let i=0;i<600&&await js('!!AppState.artBusy');i++)await sleep(200);}
 const report={found,blocked,errors,shots:[]};
 async function shot(name,{max=7000}={}){
  win.setContentSize(width,960);await sleep(300);
  const full=Math.min(max,await js('Math.ceil(document.documentElement.scrollHeight)'));
  win.setContentSize(width,full);await sleep(900);
  fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());report.shots.push({name,h:full});
 }
 const tab=async t=>{await js(`AppState.tab=${JSON.stringify(t)};AppState.notice=null;App.draw();scrollTo(0,0)`);await sleep(500);};
 if(flag('start')){
  await js(`AppState.problem=null;App.draw()`);await shot('00-start',{max:1100});
  await js(`AppState.problem={title:'Ссылка устарела',reason:WarpsCore.REASONS.expired+'. Ссылка из игры от 23 ноября, 20:55 — ей уже 26 ч, а живёт она около суток. Если сервер скажет «устарела», открой историю прыжков в игре ещё раз.',steps:true};App.draw()`);await shot('00-start-expired',{max:1500});
  fs.writeFileSync(path.join(out,'report-start.json'),JSON.stringify(report,null,1));console.log(JSON.stringify({ok:!errors.length,errors}));app.exit(0);return;
 }
 await tab('main');await shot('01-main');
 await tab('history');await shot('02-history',{max:2600});
 await js(`History.goto(AppState.vm.recent[0].id)`);await sleep(400);await js(`HistoryState.flash='';App.draw();scrollTo(0,0)`);await sleep(300);await shot('03-history-open',{max:2600});
 await js(`Object.assign(HistoryState,{quick:'5',open:new Set([AppState.vm.recent[1].id,AppState.vm.recent[3].id])});App.draw()`);await sleep(400);await shot('04-history-5star',{max:4000});
 await js(`Object.assign(HistoryState,{quick:'all',open:new Set()})`);
 await tab('collection');await shot('05-collection',{max:3200});
 await tab('luck');await shot('06-luck');
 if(archiver)await js(`desktop.settings({archiverFile:${JSON.stringify(archiver)}})`);
 await js(`Object.assign(PlanState,{char:'11',charCopies:1,cone:'12',coneCopies:1,extra:${JSON.stringify(extra)}${jade?`,jade:${JSON.stringify(jade)}`:''}})`);
 await tab('plan');
 if(archiver){await js(`document.querySelector('[data-act="pscan"]').click()`);await sleep(600);}
 await shot('07-planner');
 await tab('settings');await shot('08-settings');
 if(!demo)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
 console.log(JSON.stringify({ok:!errors.length,out,found,blocked:blocked.length,errors,shots:report.shots.length,art:await js('Object.keys(AppState.artUrls).length')}));
 app.exit(0);
});
