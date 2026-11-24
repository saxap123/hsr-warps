'use strict';
// HSR Warp Tracker, Electron main process. Portable: settings, history and backups live in <exe folder>/userdata.
// The full history link (authkey) stays in this process, in memory only: the page gets its masked form; it is never
// written to a file or the log (warps.cjs masks it). Game files are only read (Player.log, web cache).
// Test launches: --test (hidden window) and --shots (offscreen); only with --test are these hooks read:
//  HSRW_TEST_ORIGIN=http://127.0.0.1:<port>  every warp API request goes there instead of the official host;
//  HSRW_TEST_HOME=<folder>                   stands in for USERPROFILE / APPDATA when the game files are searched.
// HSRW_PROFILE=<folder> (any launch) moves userdata, e.g. for a test profile.
const {app,BrowserWindow,protocol,net,ipcMain,dialog,session,Menu,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const W=require('./warps.cjs'),G=require('./game-cache.cjs'),Core=require('./core/warps-core.js'),Srgf=require('./core/srgf.js'),{readArchiver}=require('./archiver.cjs');
const root=__dirname,test=process.argv.includes('--test'),shots=process.argv.includes('--shots'),hidden=test||shots;
const profile=process.env.HSRW_PROFILE?path.resolve(process.env.HSRW_PROFILE):path.join(path.dirname(process.execPath),'userdata');
app.setPath('userData',profile);app.setName('HSR Warp Tracker');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const dirs={warps:path.join(profile,'warps'),banners:path.join(profile,'banners'),log:path.join(profile,'app.log'),settings:path.join(profile,'settings.json')};
const log=W.createLog({file:dirs.log});
// ---------- settings (small JSON, atomic write) ----------
const SETTINGS_KEYS={variant:v=>['A','B','C'].includes(v)?v:undefined,archiverFile:v=>typeof v==='string'&&v.length<1024?v:undefined,jade:v=>Number.isFinite(+v)&&+v>=0&&+v<1e8?Math.floor(+v):undefined,
 passes:v=>Number.isFinite(+v)&&+v>=0&&+v<1e5?Math.floor(+v):undefined,extra:v=>Number.isFinite(+v)&&+v>=0&&+v<1e5?Math.floor(+v):undefined,jadeSource:v=>['manual','archiver'].includes(v)?v:undefined,uid:v=>/^\d{5,12}$/.test(String(v))?String(v):undefined,
 planner:v=>v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):undefined};
function readSettings(){try{const v=JSON.parse(fs.readFileSync(dirs.settings,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
function writeSettings(patch){
 const cur=readSettings();for(const [k,check] of Object.entries(SETTINGS_KEYS))if(patch&&Object.prototype.hasOwnProperty.call(patch,k)){const v=check(patch[k]);if(v!==undefined)cur[k]=v;}
 fs.mkdirSync(profile,{recursive:true});const tmp=dirs.settings+'.tmp';fs.writeFileSync(tmp,JSON.stringify(cur,null,1),'utf8');fs.renameSync(tmp,dirs.settings);return cur;
}
// ---------- game files (read only) ----------
const testValue=name=>test?process.env[name]||'':'';
// --test: a fake game tree or none; --shots (screenshots) reads the real game files like a normal launch (read only).
function gameEnv(){if(!test)return process.env;const home=testValue('HSRW_TEST_HOME');return home?{USERPROFILE:path.resolve(home),APPDATA:path.join(path.resolve(home),'AppData','Roaming')}:{};}
function warpsFetch(url,options){
 if(!hidden)return net.fetch(url,options);
 // Test and screenshot launches never reach the real server: only a loopback test origin (read with --test).
 const origin=testValue('HSRW_TEST_ORIGIN');
 if(!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin))return Promise.reject(Error('Test launch: HSRW_TEST_ORIGIN=http://127.0.0.1:<port> is required'));
 const u=new URL(url);return net.fetch(origin+u.pathname+u.search,options);
}
let cacheInfo={pageTypes:{},banners:[],readAt:0},bannerImages=new Map();
// Banner details and their strip images from the game cache; images are copied to userdata/banners so they stay
// after the game clears its cache. Only the image is copied, never a cached link.
function readGameCacheInfo(installDir){
 try{
  const info=G.readGameCache({dirs:G.cacheDirs(installDir)});
  fs.mkdirSync(dirs.banners,{recursive:true});
  const banners=info.banners.map(b=>{
   const fix=x=>{if(!x.image)return x;const id=crypto.createHash('sha1').update(x.image).digest('hex').slice(0,20),file=path.join(dirs.banners,id+'.png');
    if(!fs.existsSync(file)){const img=info.image(x.image);if(img)fs.writeFileSync(file,img);}
    return {...x,image:fs.existsSync(file)?'app://banner/'+id+'.png':''};};
   return {...b,up5:b.up5.map(fix),up4:b.up4.map(fix)};
  });
  cacheInfo={pageTypes:info.pageTypes,banners,readAt:Date.now()};
  fs.writeFileSync(path.join(dirs.banners,'banners.json'),JSON.stringify(cacheInfo),'utf8');
 }catch(e){log('game cache: not read',e.message);}
 return cacheInfo;
}
function savedCacheInfo(){try{const v=JSON.parse(fs.readFileSync(path.join(dirs.banners,'banners.json'),'utf8'));if(v&&Array.isArray(v.banners))cacheInfo=v;}catch{}return cacheInfo;}
// ---------- app ----------
app.whenReady().then(()=>{
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
 protocol.handle('app',request=>{
  const url=new URL(request.url);let base;
  if(url.hostname==='banner')base=dirs.banners;else if(url.hostname==='items')base=path.join(root,'assets','items');else if(url.hostname==='ui')base=root;else return new Response('Not found',{status:404});
  let rel;try{rel=decodeURIComponent(url.pathname);}catch{return new Response('Not found',{status:404});}
  const file=path.resolve(base,'.'+rel);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
  return net.fetch(pathToFileURL(file).toString()).then(r=>new Response(r.body,{headers:{'content-type':types[path.extname(file).toLowerCase()]||'application/octet-stream'}}));
 });
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(false));
 const win=new BrowserWindow({width:1440,height:960,minWidth:1024,minHeight:700,title:'HSR Warp Tracker',backgroundColor:'#090b14',show:!hidden,autoHideMenuBar:true,
  webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,offscreen:shots,preload:path.join(root,'preload.cjs')}});
 Menu.setApplicationMenu(null);
 const trusted=event=>{if(event.sender!==win.webContents)throw Error('Unknown renderer');};
 const service=W.createWarpsService({dir:dirs.warps,fetch:warpsFetch,log});
 savedCacheInfo();
 let link=null,abort=null;
 ipcMain.handle('hsrw-state',event=>{
  trusted(event);const settings=readSettings();
  const accounts=service.accounts().map(({file,...a})=>a),pick=accounts.find(a=>!a.broken&&a.uid===settings.uid)||accounts.find(a=>!a.broken);
  let history=null,error='';try{history=pick?service.load(pick.uid):null;}catch(e){error=e.message;}
  return {version,history,accounts,settings,cache:cacheInfo,error,test:hidden};
 });
 ipcMain.handle('hsrw-find',event=>{
  trusted(event);const r=service.findLink({env:gameEnv()});
  if(!r.ok){link=null;log('find: not found',r.code);return {ok:false,code:r.code,reason:r.reason,steps:r.steps};}
  link=r.url;W.rememberSecret(Core.parseLink(r.url).params?.authkey);
  readGameCacheInfo(r.installDir);
  log('find: ok',r.region,'linkTime',r.linkTime?new Date(r.linkTime).toISOString():'');
  return {ok:true,region:r.region,masked:Core.maskUrl(r.url),linkTime:r.linkTime||null,cacheTime:r.mtime,cache:cacheInfo};
 });
 ipcMain.handle('hsrw-update',async(event,options)=>{
  trusted(event);const o=options&&typeof options==='object'?options:{},found=o.useFound===true;
  const url=found?link:typeof o.url==='string'&&o.url.length<=64*1024?o.url:'';
  if(!url)return found?{ok:false,code:'NO_LINK',reason:'Сначала найди ссылку в файлах игры.',steps:Core.MANUAL_STEPS.slice()}:{ok:false,code:'BAD_LINK',reason:Core.REASONS.empty};
  if(abort)return {ok:false,code:'BUSY',reason:'Загрузка уже идёт.'};
  const ctl=new AbortController();abort=ctl;
  try{
   const r=await service.update({url,signal:ctl.signal,discovered:cacheInfo.pageTypes,onProgress:p=>{if(!win.isDestroyed())win.webContents.send('hsrw-progress',p);}});
   if(r.code==='AUTHKEY'&&found)link=null;
   if(r.uid)writeSettings({uid:r.uid});
   return r;
  }finally{if(abort===ctl)abort=null;}
 });
 ipcMain.handle('hsrw-cancel',event=>{trusted(event);const busy=!!abort;abort?.abort();return busy;});
 ipcMain.handle('hsrw-load',(event,uid)=>{trusted(event);const h=service.load(String(uid??''));if(h)writeSettings({uid:h.uid});return h;});
 ipcMain.handle('hsrw-settings',(event,patch)=>{trusted(event);return writeSettings(patch);});
 ipcMain.handle('hsrw-import',async event=>{
  trusted(event);const pick=await dialog.showOpenDialog(win,{title:'Импорт истории прыжков (SRGF / UIGF)',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
  if(pick.canceled)return null;const file=pick.filePaths[0];if(fs.statSync(file).size>60*1024*1024)return {ok:false,reason:'Файл больше 60 МБ.'};
  const parsed=Srgf.parse(fs.readFileSync(file,'utf8'));if(!parsed.ok)return parsed;
  const result=service.importAccounts(parsed.accounts);if(result[0])writeSettings({uid:result[0].uid});
  return {ok:true,format:parsed.format,warnings:parsed.warnings,result};
 });
 ipcMain.handle('hsrw-export',async(event,{uid,format}={})=>{
  trusted(event);const h=service.load(String(uid??''));if(!h)return {ok:false,reason:'Нет истории для экспорта.'};
  const out=format==='uigf'?Srgf.toUigf(h,{version}):Srgf.toSrgf(h,{version});
  const pick=await dialog.showSaveDialog(win,{title:'Экспорт истории прыжков',defaultPath:(format==='uigf'?'UIGF':'SRGF')+'-'+h.uid+'.json',filters:[{name:'JSON',extensions:['json']}]});
  if(pick.canceled)return null;fs.writeFileSync(pick.filePath,out.text,'utf8');log('export',format,out.count,'skipped',out.skipped);
  return {ok:true,count:out.count,skipped:out.skipped,skippedTypes:out.skippedTypes||[],file:path.basename(pick.filePath)};
 });
 ipcMain.handle('hsrw-archiver',async(event,{choose=false}={})=>{
  trusted(event);let file=readSettings().archiverFile||'';
  if(choose||!file){const pick=await dialog.showOpenDialog(win,{title:'Скан Reliquary Archiver (archiver_output.json)',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(pick.canceled)return null;file=pick.filePaths[0];writeSettings({archiverFile:file,jadeSource:'archiver'});}
  const r=readArchiver(file);return {...r,file:path.basename(file)};
 });
 ipcMain.handle('hsrw-open-data',event=>{trusted(event);fs.mkdirSync(dirs.warps,{recursive:true});return shell.openPath(dirs.warps);});
 app.on('before-quit',()=>abort?.abort());
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('app://ui/'))event.preventDefault();});
 log('start',version,hidden?'(test)':'');
 win.loadURL('app://ui/index.html');
});
app.on('window-all-closed',()=>app.quit());
