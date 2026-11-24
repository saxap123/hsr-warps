// Screenshots of every screen (offscreen Electron, the production main process and page). No network: --shots
// blocks every warp API request and the session also cancels any request to HoYoverse / miHoYo hosts; the game files
// are only read (the link is located but never used; banner details and images come from the game cache).
// Profile: HSRW_PROFILE (default .realdata/profile); --seed=<store.json> drops a history into it first;
// --archiver=<archiver_output.json> sets the scan file for the planner; --extra=<n> adds pulls in the planner example.
// Usage: .build-tools\electron\electron.exe scripts\shots.cjs [--seed=..] [--archiver=..] [--out=dir] [--width=1440]
'use strict';
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):d;};
const root=path.resolve(__dirname,'..');
const profile=path.resolve(process.env.HSRW_PROFILE||path.join(root,'.realdata','profile'));process.env.HSRW_PROFILE=profile;
const out=path.resolve(arg('out',path.join(root,'.realdata','shots')));fs.mkdirSync(out,{recursive:true});
const seed=arg('seed','');
if(seed){const h=JSON.parse(fs.readFileSync(seed,'utf8'));fs.mkdirSync(path.join(profile,'warps'),{recursive:true});fs.writeFileSync(path.join(profile,'warps',h.uid+'.json'),JSON.stringify(h));}
const width=Number(arg('width',1440)),archiver=arg('archiver',''),extra=arg('extra','90');
process.argv.push('--shots');
require('../app/main.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const blocked=[];session.defaultSession.webRequest.onBeforeRequest({urls:['*://*.hoyoverse.com/*','*://*.mihoyo.com/*']},(d,cb)=>{blocked.push(new URL(d.url).host);cb({cancel:true});});
 let win;for(let i=0;i<100&&!(win=BrowserWindow.getAllWindows()[0]);i++)await sleep(50);
 const js=code=>win.webContents.executeJavaScript(code,true);
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level==='warning')errors.push(e.level+': '+e.message);});
 for(let i=0;i<200&&!(await js('!!(window.AppState&&AppState.ready)').catch(()=>false));i++)await sleep(100);
 const found=await js('App.find()');
 const report={found,blocked,errors,shots:[]};
 async function shot(name,{max=7000}={}){
  win.setContentSize(width,960);await sleep(300);
  const full=Math.min(max,await js('Math.ceil(document.documentElement.scrollHeight)'));
  win.setContentSize(width,full);await sleep(800);
  fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());report.shots.push({name,h:full});
 }
 const tab=async t=>{await js(`AppState.tab=${JSON.stringify(t)};AppState.notice=null;App.draw();scrollTo(0,0)`);await sleep(500);};
 await tab('main');await shot('01-main');
 await tab('history');await shot('02-history',{max:2600});
 await js(`History.goto(AppState.vm.recent[0].id)`);await sleep(400);await js(`HistoryState.flash='';App.draw();scrollTo(0,0)`);await sleep(300);await shot('03-history-open',{max:2600});
 await js(`Object.assign(HistoryState,{quick:'5',open:new Set([AppState.vm.recent[1].id,AppState.vm.recent[4].id])});App.draw()`);await sleep(400);await shot('04-history-5star',{max:4000});
 await js(`Object.assign(HistoryState,{quick:'all',open:new Set()})`);
 await tab('collection');await shot('05-collection',{max:3200});
 await tab('luck');await shot('06-luck');
 if(archiver)await js(`desktop.settings({archiverFile:${JSON.stringify(archiver)}})`);
 await js(`Object.assign(PlanState,{char:'11',charCopies:1,cone:'12',coneCopies:1,extra:${JSON.stringify(extra)}})`);
 await tab('plan');
 if(archiver){await js(`document.querySelector('[data-act="pscan"]').click()`);await sleep(600);}
 await shot('07-planner');
 await tab('settings');await shot('08-settings');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
 console.log(JSON.stringify({ok:!errors.length,out,found,blocked:blocked.length,errors,shots:report.shots.length}));
 app.exit(0);
});
