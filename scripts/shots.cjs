// Screenshots of the app (offscreen Electron, the production main process and page). No network: --shots blocks
// every warp API request (only a loopback test origin would be allowed, and none is given); the game files are only
// read (the history link is located but never used, banner details and images come from the game cache).
// The profile is HSRW_PROFILE (default .realdata/profile); a store file can be seeded with --seed=<file.json>.
// Usage: .build-tools\electron\electron.exe scripts\shots.cjs [--seed=<store.json>] [--out=<dir>] [--width=1440] [--names=A,B,C]
'use strict';
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):d;};
const root=path.resolve(__dirname,'..');
const profile=path.resolve(process.env.HSRW_PROFILE||path.join(root,'.realdata','profile'));process.env.HSRW_PROFILE=profile;
const out=path.resolve(arg('out',path.join(root,'.realdata','shots')));fs.mkdirSync(out,{recursive:true});
const seed=arg('seed','');
if(seed){const h=JSON.parse(fs.readFileSync(seed,'utf8'));fs.mkdirSync(path.join(profile,'warps'),{recursive:true});fs.writeFileSync(path.join(profile,'warps',h.uid+'.json'),JSON.stringify(h));}
const width=Number(arg('width',1440)),names=arg('names','A,B,C').split(',');
process.argv.push('--shots');
require('../app/main.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const blocked=[];session.defaultSession.webRequest.onBeforeRequest({urls:['*://*.hoyoverse.com/*','*://*.mihoyo.com/*']},(d,cb)=>{blocked.push(new URL(d.url).host);cb({cancel:true});});
 let win;for(let i=0;i<100&&!(win=BrowserWindow.getAllWindows()[0]);i++)await sleep(50);
 const js=code=>win.webContents.executeJavaScript(code,true);
 const errors=[];win.webContents.on('console-message',(_e,d)=>{if(d.level==='error')errors.push(d.message);});
 for(let i=0;i<200&&!(await js('!!(window.AppState&&AppState.ready)').catch(()=>false));i++)await sleep(100);
 const found=await js('App.find()');
 const report={found,blocked,errors,shots:[]};
 async function shot(name,{w=width,h=null}={}){
  win.setContentSize(w,960);await sleep(250);
  const full=h||Math.min(6000,await js('Math.ceil(document.documentElement.scrollHeight)'));
  win.setContentSize(w,full);await sleep(700);
  const img=await win.webContents.capturePage();const file=path.join(out,name+'.png');fs.writeFileSync(file,img.toPNG());report.shots.push({name,w,h:full});
 }
 for(const v of names){await js(`AppState.variant=${JSON.stringify(v)};App.draw()`);await sleep(600);await shot('variant-'+v);}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
 console.log(JSON.stringify({ok:true,out,found:found,blocked:blocked.length,errors}));
 app.exit(0);
});
