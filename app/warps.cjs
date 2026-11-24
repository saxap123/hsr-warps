'use strict';
// HSR Warp Tracker, main process (from HSR Atelier «Крутки»): find the history link in the game files (read only: Player.log and the web cache,
// never game memory, never writing into the game folder), fetch the official endpoint with pauses, keep history locally.
// fs, path, env, fetch, sleep and clock are injectable for tests.
const nodeFs=require('node:fs'),nodePath=require('node:path');
const Core=require('./core/warps-core.js'),{openCache}=require('./game-cache.cjs');

const CN_LOG_DIR='崩坏：星穹铁道'; // 崩坏：星穹铁道, full-width colon U+FF1A
const LOG_NAMES=['Player.log','Player-prev.log'];
const MB=1024*1024;

// ---------- finding the link ----------
const FIND_REASONS={
 NO_GAME:'Не нашли Honkai: Star Rail на этом компьютере: игра здесь ещё не запускалась или запускалась под другим пользователем Windows.',
 NO_INSTALL:'Игра найдена, но в её журнале не записано, в какой папке она установлена.',
 NO_CACHE:'Папка игры найдена, но история прыжков в игре ещё не открывалась.',
 NO_LINK:'В файлах игры нет ссылки на историю прыжков.',
 READ_ERROR:'Не получилось прочитать файлы игры.'};
function logDirs(env,path){
 const roots=[];
 if(env.USERPROFILE)roots.push(path.join(env.USERPROFILE,'AppData','LocalLow'));
 if(env.APPDATA)roots.push(path.join(env.APPDATA,'..','LocalLow'));
 const seen=new Set(),out=[];
 for(const root of roots){const key=path.resolve(root).toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({region:'global',dir:path.join(root,'Cognosphere','Star Rail')},{region:'cn',dir:path.join(root,'miHoYo',CN_LOG_DIR)});}
 return out;
}
// "<drive>:/…/StarRail_Data/" from the log: the "Loading player data from" line near the top, otherwise any such path.
function installDirsFromLog(text){
 const out=[];
 for(const line of String(text).split(/\r?\n/).slice(0,20)){const m=/^Loading player data from (.+?)data\.unity3d\s*$/.exec(line);if(m)out.push(m[1].trim());}
 for(const m of String(text).matchAll(/[A-Za-z]:[\\/][^\r\n\0"<>|?*:]*?[\\/]StarRail_Data(?=[\\/])/gi))out.push(m[0]);
 return out.map(d=>d.replace(/[\\/]+$/,''));
}
function isDir(fs,p){try{return fs.statSync(p).isDirectory();}catch{return false;}}
function statFile(fs,p){try{const s=fs.statSync(p);return s.isFile()?s:null;}catch{return null;}}
function dataDirsFromGameDir(fs,path,dir){
 if(path.basename(dir).toLowerCase()==='starrail_data')return [dir];
 // Old launcher: <Star Rail>/Games/StarRail_Data; HoYoPlay: <HoYoPlay>/games/Star Rail Games/StarRail_Data.
 return [path.join(dir,'StarRail_Data'),path.join(dir,'Games','StarRail_Data'),path.join(dir,'Star Rail Games','StarRail_Data'),path.join(dir,'games','Star Rail Games','StarRail_Data')].filter(d=>isDir(fs,d));
}
// <StarRail_Data>/webCaches/<any folder, e.g. 2.14.0.0>/Cache/Cache_Data/data_2 and the old webCaches/Cache/Cache_Data/data_2.
function cacheFiles(fs,path,dataDir){
 const web=path.join(dataDir,'webCaches'),out=[];
 let entries=[];try{entries=fs.readdirSync(web,{withFileTypes:true});}catch{return out;}
 const dirs=new Set(['Cache',...entries.filter(e=>e.isDirectory()).map(e=>e.name)]);
 for(const name of dirs){
  const file=name==='Cache'?path.join(web,'Cache','Cache_Data','data_2'):path.join(web,name,'Cache','Cache_Data','data_2');
  const s=statFile(fs,file);if(s)out.push({file,mtime:s.mtimeMs,size:s.size});
 }
 return out;
}
// History links of the blockfile index (data_1) of one Cache_Data folder, one per authkey, newest stored first.
function indexedLinks(fs,path,dir){
 let cache;try{cache=openCache(dir,{fs,path});}catch{return [];}
 const byKey=new Map();
 for(const e of cache.entries){
  if(e.url.indexOf('authkey=')<0||!e.created)continue;
  const r=Core.parseLink(e.url);if(!r.ok)continue;
  const k=r.region+'|'+r.params.authkey,prev=byKey.get(k);
  if(!prev||prev.created<e.created)byKey.set(k,{...r,created:e.created});
 }
 return [...byKey.values()].sort((a,b)=>b.created-a.created);
}
function notFound(code,detail){return {ok:false,code,reason:FIND_REASONS[code]+(detail?' '+detail:''),steps:Core.MANUAL_STEPS.slice()};}
// findLink({env, fs, path, gameDirs}) -> {ok:true, url, region, host, source:'cache', file, mtime, candidates, installDir, logs}
//                                     | {ok:false, code, reason, steps}
function findLink({env=process.env,fs=nodeFs,path=nodePath,gameDirs=[],maxLogBytes=64*MB,maxCacheBytes=256*MB}={}){
 const logs=[];
 for(const {region,dir} of logDirs(env||{},path))for(const name of LOG_NAMES){const file=path.join(dir,name),s=statFile(fs,file);if(s)logs.push({file,region,size:s.size});}
 const installs=new Map(),add=d=>{const key=path.resolve(d).toLowerCase();if(!installs.has(key))installs.set(key,path.resolve(d));};
 for(const g of [].concat(gameDirs||[]))if(g)for(const d of dataDirsFromGameDir(fs,path,String(g)))add(d);
 if(!logs.length&&!installs.size)return notFound('NO_GAME');
 for(const log of logs){
  if(log.size>maxLogBytes||log.size===0)continue;
  let text;try{text=fs.readFileSync(log.file,'utf8');}catch{continue;}
  for(const d of installDirsFromLog(text))add(d);
 }
 if(!installs.size)return notFound('NO_INSTALL');
 const files=[];for(const dir of installs.values())for(const f of cacheFiles(fs,path,dir))files.push({...f,installDir:dir});
 if(!files.length)return notFound('NO_CACHE');
 files.sort((a,b)=>b.mtime-a.mtime);
 let readErrors=0;
 for(const f of files){
  if(f.size>maxCacheBytes){readErrors++;continue;}
  let data;try{data=fs.readFileSync(f.file);}catch{readErrors++;continue;}
  // The cache index knows when each response was stored: the newest stored link is the one the game opened last.
  // (The link's own `timestamp` parameter is not the opening time: on a real cache it points at an older link.)
  const indexed=indexedLinks(fs,path,path.dirname(f.file));
  if(indexed.length){const n=indexed[0];return {ok:true,url:n.url,region:n.region,host:n.host,source:'cache',file:f.file,mtime:f.mtime,linkTime:n.created,candidates:indexed.slice(0,5).map(l=>l.url),installDir:f.installDir,logs:logs.map(l=>l.file)};}
  const links=Core.extractLinks(data);if(!links.length)continue;
  const newest=links[links.length-1];
  return {ok:true,url:newest.url,region:newest.region,host:newest.host,source:'cache',file:f.file,mtime:f.mtime,linkTime:null,candidates:links.slice().reverse().slice(0,5).map(l=>l.url),installDir:f.installDir,logs:logs.map(l=>l.file)};
 }
 return readErrors===files.length?notFound('READ_ERROR'):notFound('NO_LINK');
}

// ---------- fetching ----------
const FETCH_REASONS={
 AUTHKEY:Core.REASONS.expired,
 TOO_FREQUENT:'Сервер просит не спешить: слишком много запросов подряд. Подожди минуту и повтори.',
 NETWORK:'Нет связи с сервером истории прыжков. Проверь интернет и повтори.',
 HTTP:'Сервер истории прыжков сейчас не отвечает. Повтори позже.',
 SERVER:'Сервер истории прыжков ответил ошибкой.',
 BAD_RESPONSE:'Сервер истории прыжков прислал непонятный ответ. Повтори позже.',
 ABORTED:'Загрузка остановлена.',
 UID_MISMATCH:'В ответе оказались данные разных аккаунтов — загрузка остановлена.'};
class WarpError extends Error{constructor(code,reason){super(reason||FETCH_REASONS[code]);this.code=code;this.reason=reason||FETCH_REASONS[code];}}
function defaultSleep(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new WarpError('ABORTED'));
  const onAbort=()=>{clearTimeout(timer);reject(new WarpError('ABORTED'));};
  const timer=setTimeout(()=>{signal?.removeEventListener?.('abort',onAbort);resolve();},ms);
  signal?.addEventListener?.('abort',onAbort,{once:true});
 });
}
// JSON with 16+ digit bare numbers quoted first, so an id sent as a number would keep all its digits.
function parseJson(text){return JSON.parse(String(text).replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,'$1"$2"'));}
const backoff=attempt=>Math.min(1000*2**(attempt-1),16000);
function normKnown(v){const out={};if(v&&typeof v==='object')for(const [t,id] of Object.entries(v)){const s=Core.idString(id);if(s)out[String(Number(t))]=s;}return out;}
// fetchHistory({url, fetch, sleep, knownLastIds, onProgress, signal}) ->
//  {ok:true, uid, region, serverRegion, timeZone, lang, byType:{type:[items newest first]}, counts, requests}
//  | {ok:false, code, reason, uid, completed:{type: items} (only fully fetched types: safe to merge), counts, requests}
// knownLastIds: {type: newest stored id} or (uid) => that object; a type stops at the first id not newer than it.
// types: pity pools to fetch in order (Core.resolveTypes); ld: the ones served by getLdGachaLog.
async function fetchHistory({url,fetch=globalThis.fetch,sleep=defaultSleep,knownLastIds={},onProgress=()=>{},signal,types=Core.TYPE_ORDER,ld=null,pauseMs=300,maxRetries=5,pageSize=20,maxPages=5000,timeoutMs=20000}={}){
 const link=Core.parseLink(url);
 if(!link.ok)return {ok:false,code:'BAD_LINK',reason:link.reason,uid:'',completed:{},counts:{},requests:0};
 if(typeof fetch!=='function')throw new TypeError('fetch is required');
 const pause=Math.max(300,Number(pauseMs)||0),size=Math.min(20,Math.max(1,Number(pageSize)||20));
 let requests=0,uid='',known=typeof knownLastIds==='function'?null:normKnown(knownLastIds),total=0;
 const meta={},completed={},counts={};
 async function wait(ms){try{await sleep(ms,signal);}catch(e){if(signal?.aborted||e?.code==='ABORTED'||e?.name==='AbortError')throw new WarpError('ABORTED');throw e;}if(signal?.aborted)throw new WarpError('ABORTED');}
 async function once(target){
  const ctl=new AbortController(),onAbort=()=>ctl.abort();
  signal?.addEventListener?.('abort',onAbort,{once:true});
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{return await fetch(target,{method:'GET',signal:ctl.signal,credentials:'omit',redirect:'error'});}
  finally{clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);}
 }
 // One page with the pause before it (none before the very first request) and retries for transient failures.
 async function request(target){
  for(let attempt=0;;attempt++){
   if(signal?.aborted)throw new WarpError('ABORTED');
   if(requests>0)await wait(attempt?backoff(attempt):pause);
   requests++;
   const retry=attempt<maxRetries;
   let res;
   try{res=await once(target);}catch{if(signal?.aborted)throw new WarpError('ABORTED');if(retry)continue;throw new WarpError('NETWORK');}
   if(!res||!res.ok){const status=Number(res?.status)||0;if((status>=500||status===429)&&retry)continue;throw new WarpError('HTTP',FETCH_REASONS.HTTP+(status?' (ошибка '+status+')':''));}
   let body;
   try{body=typeof res.text==='function'?parseJson(await res.text()):await res.json();}catch{if(signal?.aborted)throw new WarpError('ABORTED');if(retry)continue;throw new WarpError('BAD_RESPONSE');}
   const code=Number(body?.retcode),message=String(body?.message??'');
   if(code===0)return body;
   if(code===-110){if(retry)continue;throw new WarpError('TOO_FREQUENT');}
   if(code===-100||code===-101||/authkey/i.test(message))throw new WarpError('AUTHKEY');
   throw new WarpError('SERVER',FETCH_REASONS.SERVER+(message?' '+message:'')+' (код '+(Number.isFinite(code)?code:'?')+')');
  }
 }
 const result=extra=>({uid,region:link.region,...meta,counts,requests,...extra});
 try{
  const list=[...new Set(types.map(t=>Core.typeKey(t)).filter(Boolean))],ldSet=new Set((ld||Core.LD_TYPES).map(String));
  for(const [typeIndex,type] of list.entries()){
   const items=[];let endId='0',page=1,done=false;
   while(!done){
    if(page>maxPages)throw new WarpError('BAD_RESPONSE');
    const body=await request(Core.pageUrl(link.url,type,page,size,endId,ldSet.has(type)));
    const data=body.data&&typeof body.data==='object'?body.data:{},pageList=Array.isArray(data.list)?data.list:[];
    if(data.region&&!meta.serverRegion)meta.serverRegion=String(data.region);
    if(data.region_time_zone!==undefined&&data.region_time_zone!==null&&meta.timeZone===undefined&&Number.isFinite(Number(data.region_time_zone)))meta.timeZone=Number(data.region_time_zone);
    for(const raw of pageList){
     const it=Core.normalizeItem(raw,type);if(!it)throw new WarpError('BAD_RESPONSE');
     if(it.uid){if(!uid){uid=it.uid;if(!known)known=normKnown(knownLastIds(uid));}else if(it.uid!==uid)throw new WarpError('UID_MISMATCH');}
     if(it.lang&&!meta.lang)meta.lang=it.lang;
     const last=(known||{})[type];
     if(last&&Core.compareId(it.id,last)<=0){done=true;break;}
     items.push(it);
    }
    try{onProgress({type,title:Core.typeInfo(type).title,page,fetched:items.length,total:total+items.length,done:done||pageList.length<size,index:typeIndex,count:list.length});}catch{}
    if(done||pageList.length<size)break;
    const next=Core.idString(pageList[pageList.length-1].id);
    // Paging must move to older ids; otherwise stop instead of looping (the type is not marked complete).
    if(!next||(endId!=='0'&&Core.compareId(next,endId)>=0))throw new WarpError('BAD_RESPONSE');
    endId=next;page++;
   }
   completed[type]=items;counts[type]=items.length;total+=items.length;
  }
  return result({ok:true,byType:completed});
 }catch(e){
  if(e instanceof WarpError)return result({ok:false,code:e.code,reason:e.reason,completed});
  throw e;
 }
}

// ---------- local storage ----------
const STORE_REASONS={
 BAD_UID:'Неверный UID аккаунта.',
 BROKEN:'Файл с историей прыжков повреждён.',
 TOO_BIG:'История прыжков слишком большая для сохранения.'};
const storeError=(code,extra='')=>Object.assign(Error(STORE_REASONS[code]+extra),{code});
const stamp=ms=>new Date(ms).toISOString().replace(/[:.]/g,'-');
// createStore({dir}) -> {load(uid), save(uid, history), list(), file(uid), backups(uid)}.
// <dir>/<uid>.json is written via tmp + rename. save() is append-only: it merges into what is on disk and never drops
// stored pulls. Before every write that adds pulls, the previous file is copied to <dir>/backups/<uid>/; the newest
// `keepBackups` copies are kept (each newer copy contains every pull of the older ones: the store only grows).
function createStore({dir,fs=nodeFs,path=nodePath,maxBytes=20*MB,now=()=>Date.now(),keepBackups=30}={}){
 if(!dir)throw new TypeError('dir is required');
 const checkUid=uid=>{const s=String(uid??'').trim();if(!/^\d{5,12}$/.test(s))throw storeError('BAD_UID');return s;};
 const file=uid=>path.join(dir,checkUid(uid)+'.json');
 const backupDir=uid=>path.join(dir,'backups',checkUid(uid));
 function readFile(target){
  let text;try{text=fs.readFileSync(target,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(Buffer.byteLength(text)>maxBytes)throw storeError('TOO_BIG');
  let value;try{value=JSON.parse(text);}catch{throw storeError('BROKEN');}
  if(!value||typeof value!=='object'||!value.byType)throw storeError('BROKEN');
  return value;
 }
 function load(uid){
  const value=readFile(file(uid));if(!value)return null;
  if(value.uid&&String(value.uid)!==String(uid).trim())throw storeError('BROKEN');
  return {...Core.mergeHistory(value,null).history,updatedAt:String(value.updatedAt||'')};
 }
 function backups(uid){
  let names=[];try{names=fs.readdirSync(backupDir(uid));}catch{return [];}
  return names.filter(n=>/^\d+-.*\.json$/.test(n)).sort().map(n=>path.join(backupDir(uid),n));
 }
 function backup(id,target){
  if(!fs.existsSync(target))return null;
  const folder=backupDir(id);fs.mkdirSync(folder,{recursive:true});
  let copy=path.join(folder,id+'-'+stamp(now())+'.json'),n=1;
  while(fs.existsSync(copy))copy=path.join(folder,id+'-'+stamp(now())+'-'+(n++)+'.json');
  fs.copyFileSync(target,copy);
  const all=backups(id);for(const old of all.slice(0,Math.max(0,all.length-keepBackups)))try{fs.unlinkSync(old);}catch{}
  return copy;
 }
 // touch=false: nothing is written when nothing new arrives (import of a file that is already in the store).
 function save(uid,history,{touch=true}={}){
  const id=checkUid(uid),target=file(id);
  fs.mkdirSync(dir,{recursive:true});
  let existing=null;
  try{existing=load(id);}catch(e){
   if(e.code!=='BROKEN')throw e;
   // Keep the damaged file next to the new one instead of overwriting it.
   fs.renameSync(target,path.join(dir,id+'.broken-'+now()+'.json'));
  }
  const incoming=history&&typeof history==='object'&&history.byType?history:{byType:history||{}};
  if(incoming.uid&&String(incoming.uid)!==id)throw Object.assign(Error(FETCH_REASONS.UID_MISMATCH),{code:'UID_MISMATCH'});
  const merged=Core.mergeHistory(existing||Core.emptyHistory(id),{...incoming,uid:id});
  if(existing&&!merged.addedTotal&&!touch)return {...merged,history:existing,backup:null,written:false};
  merged.history.updatedAt=new Date(now()).toISOString();
  const text=JSON.stringify(merged.history);
  if(Buffer.byteLength(text)>maxBytes)throw storeError('TOO_BIG',' Сохранённая история не изменилась.');
  const copy=merged.addedTotal&&existing?backup(id,target):null;
  const temp=target+'.tmp';
  try{fs.writeFileSync(temp,text,'utf8');fs.renameSync(temp,target);}
  catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}
  return {...merged,backup:copy,written:true};
 }
 function list(){
  let names=[];try{names=fs.readdirSync(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const out=[];
  for(const name of names){
   const m=/^(\d{5,12})\.json$/.exec(name);if(!m)continue;
   try{const h=load(m[1]);if(h)out.push({uid:m[1],updatedAt:h.updatedAt,total:Object.values(h.byType).reduce((s,l)=>s+l.length,0),region:h.region,file:path.join(dir,name)});}
   catch(e){out.push({uid:m[1],broken:true,reason:e.message,file:path.join(dir,name)});}
  }
  return out.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 }
 return {load,save,list,file,backups};
}

// ---------- log ----------
// Every line goes through maskSecrets: an authkey (in a link, a query or as a bare value seen this session) never
// reaches the file. Size-capped: the log is rotated to app.log.1 at 1 MB.
const secrets=new Set();
function rememberSecret(value){const v=String(value||'');if(v.length>=8){secrets.add(v);try{secrets.add(encodeURIComponent(v));}catch{}}}
function maskSecrets(text){
 let s=String(text??'');
 s=s.replace(/(authkey=)[^&\s"'<>]*/gi,'$1•••');
 for(const v of secrets)if(v&&s.includes(v))s=s.split(v).join('•••');
 return s;
}
function createLog({file,fs=nodeFs,now=()=>Date.now(),maxBytes=MB}={}){
 return function log(...parts){
  if(!file)return;
  const line=new Date(now()).toISOString()+' '+maskSecrets(parts.map(p=>typeof p==='string'?p:JSON.stringify(p)).join(' '))+'\n';
  try{
   try{if(fs.statSync(file).size>maxBytes)fs.renameSync(file,file+'.1');}catch{}
   fs.appendFileSync(file,line,'utf8');
  }catch{}
 };
}

// ---------- service for the IPC layer ----------
// update({url, discovered}) fetches only what is newer than the stored history of that UID and saves the fully
// fetched types, also when a later type failed (so no gap can appear between stored and newly fetched pulls).
// discovered: banner types read from the official history page in the game cache ({type:{name, ld}}).
function createWarpsService({dir,fetch=globalThis.fetch,sleep=defaultSleep,fs=nodeFs,path=nodePath,env=process.env,now=()=>Date.now(),pauseMs=300,log=()=>{}}={}){
 const store=createStore({dir,fs,path,now});
 let busy=false;
 async function update({url,onProgress,signal,discovered=null}={}){
  if(busy)return {ok:false,code:'BUSY',reason:'Загрузка уже идёт.'};
  busy=true;
  try{
   const link=Core.parseLink(url);
   if(!link.ok)return {ok:false,code:'BAD_LINK',reason:link.reason};
   rememberSecret(link.params.authkey);
   // Types: the defaults, the ones the official history page lists, and every type already stored for any account.
   const storedTypes=new Set();for(const a of store.list())if(!a.broken)try{for(const t of Object.keys(store.load(a.uid)?.byType||{}))storedTypes.add(t);}catch{}
   const {types,ld}=Core.resolveTypes({discovered,extra:[...storedTypes]});
   log('update: start',link.region,'types',types.join(','));
   const r=await fetchHistory({url:link.url,fetch,sleep,signal,onProgress,pauseMs,types,ld,knownLastIds:uid=>{try{return Core.lastIds(store.load(uid));}catch{return {};}}});
   const byType=r.ok?r.byType:r.completed||{};
   let saved=null;
   if(r.uid&&Object.keys(byType).length)saved=store.save(r.uid,{uid:r.uid,region:link.region,serverRegion:r.serverRegion,timeZone:r.timeZone,lang:r.lang,byType});
   const out={ok:r.ok,uid:r.uid,region:link.region,added:saved?.added||{},addedTotal:saved?.addedTotal||0,history:saved?.history||null,requests:r.requests,types};
   if(!r.ok)Object.assign(out,{code:r.code,reason:r.reason});
   else if(!r.uid)out.notice='За доступный срок прыжков не было — показывать пока нечего.';
   log('update: done',{ok:r.ok,code:r.code||'',uid:r.uid,requests:r.requests,added:out.addedTotal,counts:r.counts});
   return out;
  }catch(e){log('update: error',e.code||'',e.message);return {ok:false,code:e.code||'ERROR',reason:e.message};}
  finally{busy=false;}
 }
 // Import of a parsed SRGF / UIGF / store file (core/srgf.js parse): merged append-only, one store file per UID.
 function importAccounts(accounts){
  const out=[];
  for(const a of accounts){
   const saved=store.save(a.uid,{uid:a.uid,timeZone:a.timeZone,lang:a.lang,byType:a.byType},{touch:false});
   out.push({uid:a.uid,added:saved.addedTotal,total:Object.values(saved.history.byType).reduce((s,l)=>s+l.length,0)});
  }
  log('import:',out);
  return out;
 }
 return {
  findLink:(options={})=>findLink({env,fs,path,...options}),
  parseLink:Core.parseLink,
  update,importAccounts,
  load:uid=>store.load(uid),
  accounts:()=>store.list(),
  latest(){const first=store.list().find(a=>!a.broken);return first?store.load(first.uid):null;},
  store};
}

module.exports={findLink,fetchHistory,createStore,createWarpsService,createLog,maskSecrets,rememberSecret,installDirsFromLog,FIND_REASONS,FETCH_REASONS,STORE_REASONS,CN_LOG_DIR};
