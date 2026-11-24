// HSR Warp Tracker, new parts: banner types not fixed in advance (a new type from the official history page, an unknown
// type shown as its own banner), backups before every write, the log never sees the authkey, the authkey in no file at
// all after a full cycle (fetch, update, import, SRGF / UIGF export, log), SRGF / UIGF export and import, the
// probability model (official consolidated rates, planner, seeded luck percentile), the read-only game cache reader on
// a synthetic Chromium blockfile cache, Stellar Jade from a Reliquary Archiver scan.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const C=require('../app/core/warps-core.js'),A=require('../app/core/analysis.js'),M=require('../app/core/model.js'),S=require('../app/core/srgf.js');
const W=require('../app/warps.cjs'),G=require('../app/game-cache.cjs'),{readArchiver}=require('../app/archiver.cjs'),catalog=null;   // no bundled catalog
const {makeWarpsItems,makeWarpsHistory,UID,AUTHKEY}=require('./fixtures/make_warps_history.cjs');
const temps=[],tempDir=name=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'hsr-tracker-'+name+'-'));temps.push(d);return d;};
const GLOBAL='https://public-operation-hkrpg-sg.hoyoverse.com';
const apiLink=(key=AUTHKEY)=>GLOBAL+'/common/hkrpg_gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&lang=ru&authkey='+encodeURIComponent(key)+'&game_biz=hkrpg_global&page=1&size=5&gacha_type=11&end_id=0';
const BIG=(a,b)=>{const x=BigInt(a),y=BigInt(b);return x<y?-1:x>y?1:0;};
const sleeper=()=>{const calls=[];return {calls,sleep:async ms=>{calls.push(ms);}};};
function server({items=makeWarpsItems(),key=AUTHKEY,ldTypes=['21','22']}={}){
 const newest=Object.fromEntries(Object.entries(items).map(([t,l])=>[t,l.slice().sort((a,b)=>BIG(b.id,a.id))]));const log=[];
 return {log,fetch:async url=>{
  const u=new URL(url),q=u.searchParams,e={path:u.pathname,type:q.get('gacha_type'),end:q.get('end_id'),size:Number(q.get('size')),key:q.get('authkey')};log.push(e);
  const reply=b=>({ok:true,status:200,text:async()=>JSON.stringify(b)});
  if(e.key!==key)return reply({retcode:-101,message:'authkey timeout',data:null});
  const data={region:'prod_official_eur',region_time_zone:1,list:[]};
  if(u.pathname.endsWith('/getLdGachaLog')!==ldTypes.includes(e.type))return reply({retcode:0,data});
  let list=newest[e.type]||[];if(e.end!=='0')list=list.filter(x=>BIG(x.id,e.end)<0);data.list=list.slice(0,e.size);return reply({retcode:0,data});
 }};
}
const walk=dir=>{const out=[];const go=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())go(p);else out.push(p);}};go(dir);return out;};
const keyForms=key=>[key,encodeURIComponent(key),key.slice(0,8)];

async function main(){
// ---------- banner types are not a closed list ----------
{
 assert.deepEqual(C.resolveTypes().types,['11','12','1','2','21','22']);assert.deepEqual(C.resolveTypes().ld,['21','22']);
 const page={'1':{name:'STANDARD'},'11':{name:'UP_ROLE'},'23':{name:'CO_BRANDED_ROLE_V2',ld:true},'31':{name:'UP_ROLE_LIMITED'},'41':{name:'SOMETHING_NEW'}};
 const r=C.resolveTypes({discovered:page,extra:['77']});
 assert.deepEqual(r.types,['11','12','1','2','21','22','23','31','41','77'],'new types after the known ones, by number');assert.deepEqual(r.ld,['21','22','23']);
 assert.equal(C.typeInfo('31',page).kind,'character');assert.equal(C.typeInfo('31',page).maxPity,90);assert.equal(C.typeInfo('41',page).maxPity,null);assert.equal(C.typeInfo('77').title,'Другой баннер (тип 77)');
 // The fetcher asks the new types too, with the endpoint the page implies.
 const items={...makeWarpsItems(),'23':makeWarpsItems()['21'].slice(0,30).map((x,i)=>({...x,gacha_type:'23',id:String(1900000000000000000n+BigInt(i))})),'77':[{uid:UID,gacha_id:'9901',gacha_type:'77',item_id:'1310',count:'1',time:'2026-06-10 10:00:00',name:'Firefly',lang:'en-us',item_type:'Character',rank_type:'5',id:'1950000000000000001'}]};
 const s=server({items,ldTypes:['21','22','23']});
 const res=await W.fetchHistory({url:C.parseLink(apiLink()).url,fetch:s.fetch,sleep:sleeper().sleep,...C.resolveTypes({discovered:page,extra:['77']})});
 assert.equal(res.ok,true);assert.equal(res.counts['23'],30);assert.equal(res.counts['77'],1);assert(s.log.filter(e=>e.type==='23').every(e=>e.path.endsWith('/getLdGachaLog')));
 const h=C.mergeHistory(null,res).history,st=A.analyze(h,{catalog,discovered:page});
 const t77=st.byType['77'],t23=st.byType['23'];
 assert.equal(t77.title,'Другой баннер (тип 77)');assert.equal(t77.total,1);assert.equal(t77.fiveCount,1);assert.equal(t77.maxPity,null);assert.equal(t77.texts.pity5,'С последней 5★: 0 прыжков');
 assert.equal(t23.kind,'character');assert.equal(t23.total,30);assert(st.shown.some(b=>b.type==='77')&&st.shown.some(b=>b.type==='23'),'unknown types are shown as their own banners');
 // The service fetches every type already stored, also without the page.
 const dir=path.join(tempDir('types'),'warps'),svc=W.createWarpsService({dir,fetch:s.fetch,sleep:sleeper().sleep,env:{}});
 svc.store.save(UID,{uid:UID,byType:{'77':items['77']}});
 const up=await svc.update({url:apiLink()});assert.equal(up.ok,true);assert(up.types.includes('77'));
}
// ---------- the official history page in the game cache ----------
{
 const js='t.GACHA_TYPE={STANDARD:1,FRESH:2,UP_ROLE:11,UP_WEAPON:12,CO_BRANDED_ROLE:21,CO_BRANDED_WEAPON:22,UP_ROLE_2:31};var l={gacha_type_1_text:"1",gacha_type_2_text:"2",gacha_type_11_text:"11",gacha_type_12_text:"12",gacha_type_21_text_2:"21",gacha_type_22_text_2:"22",gacha_type_31_text:"31"};';
 const t=G.parsePageTypes(js);
 assert.deepEqual(Object.keys(t).sort((a,b)=>a-b),['1','2','11','12','21','22','31']);assert.equal(t['21'].ld,true);assert.equal(t['11'].ld,false);assert.equal(t['31'].name,'UP_ROLE_2');assert.equal(t['31'].tab,true);
 assert.deepEqual(G.parsePageTypes('nothing here'),{});
}
// ---------- synthetic Chromium blockfile cache ----------
{
 const dir=tempDir('cache');
 const FILETIME=ms=>BigInt(ms+11644473600000)*1000n;
 const data1=Buffer.alloc(8192+256*16),data3=[],files={};let block3=0,fNo=0,slot=0;
 const addr=(type,file,num,blocks=1)=>(0x80000000|(type<<28)|((blocks-1)<<24)|(file<<16)|num)>>>0;
 const store=buf=>{if(buf.length>4096*4){const n=fNo++;files['f_'+n.toString(16).padStart(6,'0')]=buf;return (addr(0,0,0)|n)>>>0;}const blocks=Math.ceil(buf.length/4096)||1,start=block3;block3+=blocks;const b=Buffer.alloc(blocks*4096);buf.copy(b);data3.push(b);return addr(4,3,start,blocks);};
 const entry=(url,body,{enc='',type='application/json',created=Date.UTC(2026,10,20)}={})=>{
  const off=8192+256*(slot++),key=Buffer.from('1/0/'+url,'latin1');
  const headers=Buffer.from('HTTP/1.1 200\0content-type: '+type+'\0'+(enc?'content-encoding: '+enc+'\0':'')+'date: Mon, 23 Nov 2026 17:55:16 GMT\0\0','latin1');
  const coded=enc==='br'?zlib.brotliCompressSync(body):enc==='gzip'?zlib.gzipSync(body):body;
  data1.writeBigInt64LE(FILETIME(created),off+24);data1.writeInt32LE(key.length,off+32);
  data1.writeInt32LE(headers.length,off+40);data1.writeInt32LE(coded.length,off+44);
  data1.writeUInt32LE(store(headers),off+56);data1.writeUInt32LE(store(coded),off+60);
  if(key.length<=160)key.copy(data1,off+96);else data1.writeUInt32LE(store(key),off+36);   // long keys live in a block of their own
 };
 const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(30000,7)]);
 const info=(title,type,up,extra={})=>Buffer.from(JSON.stringify({title,gacha_type:type,items_up_star_5:[{item_id:0,item_name:up,item_type:'avatar',star:5,is_up:0,image_url:'https://operation-webstatic.hoyoverse.com/gacha_info/hkrpg/aa_1.png',origin_item_id:0}],items_up_star_4:[],
  items_avatar_star_5:[{item_name:up,is_up:1,origin_item_id:1310},{item_name:'Броня',is_up:0,origin_item_id:1101}],items_replace_avatar_star_5:[{item_name:'Зеле',origin_item_id:1102}],items_light_cone_star_5:null,base_prob_star5:'0,600%',general_prob_star5:'1,600%',base_prob_star4:'5,100%',general_prob_star4:'13,000%',up_prob:'50%',...extra}),'utf8');
 entry('https://gs.hoyoverse.com/hkrpg/event/e20211215gacha-v2/bundle_x.js',Buffer.from('var a=1;t.GACHA_TYPE={STANDARD:1,FRESH:2,UP_ROLE:11,UP_WEAPON:12,CO_BRANDED_ROLE:21,CO_BRANDED_WEAPON:22};'.padEnd(20000,' ')),{enc:'gzip',type:'application/javascript'});
 entry('https://operation-webstatic.hoyoverse.com/gacha_info/hkrpg/prod_official_eur/'+'a'.repeat(40)+'/ru-ru.json',info('Старый баннер','11','Светлячок'),{enc:'br',created:Date.UTC(2026,9,1)});
 entry('https://operation-webstatic.hoyoverse.com/gacha_info/hkrpg/prod_official_eur/'+'b'.repeat(40)+'/en-us.json',info('New banner','11','Firefly'),{enc:'br',created:Date.UTC(2026,10,22)});
 entry('https://operation-webstatic.hoyoverse.com/gacha_info/hkrpg/prod_official_eur/'+'b'.repeat(40)+'/ru-ru.json',info('Новый баннер','11','Светлячок'),{enc:'br',created:Date.UTC(2026,10,21)});
 entry('https://operation-webstatic.hoyoverse.com/gacha_info/hkrpg/aa_1.png',png,{type:'image/png'});
 // A history call with an authkey in the cache: the reader never returns it.
 entry(apiLink('SECRET_CACHE_KEY'),Buffer.from('{"retcode":0}'),{created:Date.UTC(2026,10,1)});
 // Two more links: the newer `timestamp` parameter belongs to the OLDER stored response (as in a real cache).
 const withTs=(key,ts)=>apiLink(key).replace('&lang=ru','&timestamp='+ts+'&lang=ru');
 entry(withTs('KEY_STORED_EARLIER',1800000000),Buffer.from('{"retcode":0}'),{created:Date.UTC(2026,10,10)});
 entry(withTs('KEY_STORED_LAST',1700000000),Buffer.from('{"retcode":0}'),{created:Date.UTC(2026,10,23,17,55)});
 fs.writeFileSync(path.join(dir,'data_1'),data1);fs.writeFileSync(path.join(dir,'data_3'),Buffer.concat([Buffer.alloc(8192),...data3]));for(const [n,b] of Object.entries(files))fs.writeFileSync(path.join(dir,n),b);
 // data_2 as the old search sees it: both links, the one with the newer timestamp parameter last.
 fs.writeFileSync(path.join(dir,'data_2'),Buffer.concat([Buffer.alloc(9000),Buffer.from('1/0/'+withTs('KEY_STORED_LAST',1700000000)+'\0'+'1/0/'+withTs('KEY_STORED_EARLIER',1800000000)+'\0','latin1')]));
 const before=walk(dir).map(f=>f+'|'+fs.statSync(f).mtimeMs).sort();
 const r=G.readGameCache({dirs:[dir]});
 assert.deepEqual(walk(dir).map(f=>f+'|'+fs.statSync(f).mtimeMs).sort(),before,'the cache is only read');
 assert.equal(r.pageTypes['21'].ld,true);assert.equal(Object.keys(r.pageTypes).length,6);
 assert.equal(r.banners.length,2,'one banner per hash');assert.equal(r.banners[0].title,'Новый баннер','Russian text wins, newest seen first');assert.equal(r.banners[1].title,'Старый баннер');
 assert.deepEqual(r.banners[0].featuredIds,['1310']);assert.deepEqual(r.banners[0].standardCharacters,['1101']);assert.deepEqual(r.banners[0].invitation,['1102']);assert.equal(r.banners[0].probs.avg5,0.016);
 const img=r.image(r.banners[0].up5[0].image);assert(img&&img.equals(png),'banner image from the cache');assert.equal(r.image('https://operation-webstatic.hoyoverse.com/x.png'),null);
 assert(!JSON.stringify(r.banners).includes('SECRET_CACHE_KEY'));
 const fc=A.fromGameCache(r.banners,{catalog});assert.equal(fc.current['11'].title,'Новый баннер');assert.equal(fc.current['11'].featured[0].id,'1310');assert(fc.pools.standardCharacters.includes('1101'));
 assert.deepEqual(G.readGameCache({dirs:[tempDir('empty')]}).banners,[]);
 // findLink on a game tree with this cache: the link stored last wins, with its time; nothing is written.
 const home=tempDir('home'),game=path.join(home,'Games','StarRail_Data'),cd=path.join(game,'webCaches','2.54.0.0','Cache','Cache_Data');
 fs.mkdirSync(path.join(home,'AppData','LocalLow','Cognosphere','Star Rail'),{recursive:true});fs.writeFileSync(path.join(home,'AppData','LocalLow','Cognosphere','Star Rail','Player.log'),'Loading player data from '+game.split(path.sep).join('/')+'/data.unity3d\n');
 fs.cpSync(dir,cd,{recursive:true});const snap=walk(home).map(f=>f+'|'+fs.statSync(f).mtimeMs).sort();
 const fl=W.findLink({env:{USERPROFILE:home}});
 assert.equal(fl.ok,true,fl.reason);assert.equal(C.parseLink(fl.url).params.authkey,'KEY_STORED_LAST','the newest stored link, not the newest timestamp parameter');assert.equal(fl.linkTime,Date.UTC(2026,10,23,17,55));
 assert.deepEqual(fl.candidates.map(u=>C.parseLink(u).params.authkey),['KEY_STORED_LAST','KEY_STORED_EARLIER','SECRET_CACHE_KEY']);
 assert.deepEqual(walk(home).map(f=>f+'|'+fs.statSync(f).mtimeMs).sort(),snap,'findLink only reads');
 assert.equal(C.extractLinks(fs.readFileSync(path.join(dir,'data_2'))).at(-1).params.authkey,'KEY_STORED_EARLIER','without the index the timestamp parameter would pick the older link');
}
// ---------- store: backup before every write that adds pulls ----------
{
 const dir=path.join(tempDir('backup'),'warps');let clock=Date.UTC(2026,10,24,10);const store=W.createStore({dir,now:()=>clock++,keepBackups:3});
 const full=makeWarpsHistory(),part=t=>({uid:UID,byType:{'11':full.byType['11'].slice(0,t)}});
 store.save(UID,part(100));assert.deepEqual(store.backups(UID),[],'first save: nothing to back up');
 const r2=store.save(UID,part(200));assert.equal(r2.addedTotal,100);assert.equal(store.backups(UID).length,1);
 assert.equal(JSON.parse(fs.readFileSync(store.backups(UID)[0],'utf8')).byType['11'].length,100,'the backup is the file before the write');
 store.save(UID,part(200));assert.equal(store.backups(UID).length,1,'nothing added: no new backup');
 for(const n of [250,300,350,400])store.save(UID,part(n));
 const b=store.backups(UID);assert.equal(b.length,3,'only the newest copies are kept');
 assert.deepEqual(b.map(f=>JSON.parse(fs.readFileSync(f,'utf8')).byType['11'].length),[250,300,350],'newest backups: each a superset of the older ones');
 assert.equal(store.load(UID).byType['11'].length,400);
 const before=fs.readFileSync(store.file(UID),'utf8');const r3=store.save(UID,part(50),{touch:false});assert.equal(r3.written,false);assert.equal(fs.readFileSync(store.file(UID),'utf8'),before,'an import with nothing new does not touch the file');
}
// ---------- log masking ----------
{
 const dir=tempDir('log'),file=path.join(dir,'app.log'),log=W.createLog({file});
 W.rememberSecret('Ab+cd/EF==x9zz');
 log('link',apiLink('Ab+cd/EF==x9zz'),{nested:'authkey=Ab+cd/EF==x9zz&x=1'},'bare Ab+cd/EF==x9zz end',encodeURIComponent('Ab+cd/EF==x9zz'));
 const text=fs.readFileSync(file,'utf8');for(const k of keyForms('Ab+cd/EF==x9zz'))assert(!text.includes(k),'log has '+k);assert(text.includes('authkey=•••'));
 assert.equal(W.maskSecrets('x?authkey=abc&y=1'),'x?authkey=•••&y=1');
}
// ---------- SRGF / UIGF ----------
{
 const h=C.mergeHistory(null,{...makeWarpsHistory()}).history;h.lang='ru-ru';h.timeZone=1;
 const srgf=S.toSrgf(h,{now:Date.UTC(2026,10,24)});
 assert.equal(srgf.data.info.srgf_version,'v1.0');assert.equal(srgf.data.info.uid,UID);assert.equal(srgf.data.info.region_time_zone,1);assert.equal(srgf.data.info.lang,'ru-ru');assert.equal(srgf.data.info.export_timestamp,Math.floor(Date.UTC(2026,10,24)/1000));
 assert.equal(srgf.count,838);assert.equal(srgf.skipped,90,'collaboration pulls are outside SRGF v1.0');assert.deepEqual(srgf.skippedTypes,['21']);
 const req=['gacha_id','gacha_type','item_id','time','id'];
 for(const r of srgf.data.list){for(const k of req)assert.equal(typeof r[k],'string',k);assert(['1','2','11','12'].includes(r.gacha_type));assert(/^\d{19}$/.test(r.id));assert.equal(r.count,'1');}
 const uigf=S.toUigf(h,{now:Date.UTC(2026,10,24)});
 assert.equal(uigf.data.info.version,'v4.2');assert.equal(uigf.data.hkrpg.length,1);assert.equal(uigf.data.hkrpg[0].timezone,1);assert.equal(uigf.count,928);
 for(const r of uigf.data.hkrpg[0].list){assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.time));assert(r.id.length<=19);}
 // Round trip through import: the same history.
 const back=S.parse(uigf.text);assert.equal(back.ok,true);assert.equal(back.format,'UIGF v4.2');
 const again=C.mergeHistory(null,{uid:UID,byType:back.accounts[0].byType}).history;assert.deepEqual(Object.fromEntries(Object.entries(again.byType).map(([t,l])=>[t,l.map(x=>x.id)])),Object.fromEntries(Object.entries(h.byType).map(([t,l])=>[t,l.map(x=>x.id)])));
 const sb=S.parse(srgf.text);assert.equal(sb.ok,true);assert.equal(sb.format,'SRGF v1.0');assert.equal(sb.accounts[0].count,838);
 // Another tracker wrote ids as bare numbers: digits are kept.
 const bare=srgf.text.replace(/"id": "(\d+)"/g,'"id": $1');const pb=S.parse(bare);assert.deepEqual(pb.accounts[0].byType['11'].map(x=>x.id),sb.accounts[0].byType['11'].map(x=>x.id));
 for(const [text,re] of [['{',/JSON/],['{"info":{"uigf_version":"v2.2"},"list":[]}',/Genshin/],['{"a":1}',/не распознан/],[JSON.stringify({info:{srgf_version:'v1.0',uid:'abc'},list:[]}),/UID/],[JSON.stringify({info:{srgf_version:'v1.0',uid:UID},list:[]}),/ни одного/]])
  {const r=S.parse(text);assert.equal(r.ok,false,text);assert.match(r.reason,re);}
 // Import into the store: append-only, one file per UID, nothing lost.
 const dir=path.join(tempDir('import'),'warps'),svc=W.createWarpsService({dir,env:{}});
 svc.store.save(UID,{uid:UID,byType:{'11':h.byType['11'].slice(0,100)}});
 const res=svc.importAccounts(back.accounts);assert.deepEqual(res,[{uid:UID,added:828,total:928}]);
 assert.deepEqual(svc.importAccounts(back.accounts),[{uid:UID,added:0,total:928}],'importing twice adds nothing');
}
// ---------- the authkey in no file and no log after a full cycle ----------
{
 const KEY='Zx9+Leak/Test==Key42',root=tempDir('leak'),dir=path.join(root,'warps'),logFile=path.join(root,'app.log');
 const log=W.createLog({file:logFile}),s=server({key:KEY});
 const svc=W.createWarpsService({dir,fetch:s.fetch,sleep:sleeper().sleep,env:{},log});
 const first=await svc.update({url:'Вот ссылка: '+apiLink(KEY)});assert.equal(first.ok,true,first.reason);
 const items=makeWarpsItems();items['11'].push({...items['11'][0],id:'1999999999999999999',time:'2026-07-01 10:00:00'});
 const s2=server({key:KEY,items});const svc2=W.createWarpsService({dir,fetch:s2.fetch,sleep:sleeper().sleep,env:{},log});
 const second=await svc2.update({url:apiLink(KEY)});assert.equal(second.addedTotal,1);assert(svc2.store.backups(UID).length>=1);
 const expired=await W.createWarpsService({dir,fetch:server({key:'other-key-123'}).fetch,sleep:sleeper().sleep,env:{},log}).update({url:apiLink(KEY)});assert.equal(expired.code,'AUTHKEY');
 log('error while fetching',apiLink(KEY));
 const h=svc2.load(UID);fs.writeFileSync(path.join(root,'export-srgf.json'),S.toSrgf(h).text);fs.writeFileSync(path.join(root,'export-uigf.json'),S.toUigf(h).text);
 svc2.importAccounts(S.parse(S.toUigf(h).text).accounts);
 const all=walk(root);assert(all.length>=5,all);
 for(const f of all){const text=fs.readFileSync(f,'latin1');for(const k of keyForms(KEY))assert(!text.includes(k),path.relative(root,f)+' contains the authkey ('+k+')');}
 for(const r of [first,second,expired])for(const k of keyForms(KEY))assert(!JSON.stringify(r).includes(k),'service answer contains the authkey');
}
// ---------- probability model ----------
{
 const ch=M.dist('character'),lc=M.dist('lightcone');
 assert(Math.abs(1/ch.mean-0.016)<0.0001,'character model = official consolidated 1.6% ('+(100/ch.mean).toFixed(3)+'%)');
 assert(Math.abs(1/lc.mean-0.0187)<0.0001,'light cone model = official consolidated 1.87% ('+(100/lc.mean).toFixed(3)+'%)');
 assert(Math.abs(ch.cdf[90]-1)<1e-12&&Math.abs(lc.cdf[80]-1)<1e-12);assert(Math.abs(ch.pmf.reduce((a,b)=>a+b,0)-1)<1e-12);
 assert.equal(M.rate5(M.MODELS.character,73),0.006);assert(Math.abs(M.rate5(M.MODELS.character,74)-0.066)<1e-12);assert.equal(M.rate5(M.MODELS.character,90),1);assert(Math.abs(M.rate5(M.MODELS.lightcone,66)-0.078)<1e-12);
 const a=M.need({model:'character',rate:0.5,pity:0,guarantee:false});
 assert.equal(a.worst,180);assert(Math.abs(a.cdf[a.cdf.length-1]-1)<1e-9);assert(Math.abs(a.mean-ch.mean*1.5)<0.01,'no guarantee: 1.5 × mean');
 const g=M.need({model:'character',rate:0.5,pity:80,guarantee:true});assert.equal(g.worst,10);assert.equal(g.cdf[10],1);
 const l=M.need({model:'lightcone',rate:0.75,pity:0,guarantee:false});assert(Math.abs(l.mean-lc.mean*1.25)<0.01);assert.equal(l.worst,160);
 const two=M.need({model:'character',rate:0.5,copies:2});assert.equal(two.worst,360);assert(Math.abs(two.mean-ch.mean*3)<0.02);
 let prev=-1;for(const b of [0,50,100,150,180,200]){const c=M.chance(a,b).chance;assert(c>=prev);prev=c;}assert.equal(M.chance(a,180).chance,1);assert.equal(M.chance(a,0).chance,0);
 const both=M.chance([a,l],340);assert(Math.abs(both.chance-1)<1e-9);assert.equal(both.worst,340);assert(Math.abs(both.mean-(a.mean+l.mean))<0.01);
 assert.deepEqual(M.budget({jade:1000,passes:3,extra:2}),{pulls:11,fromJade:6,jadeLeft:40,passes:3,extra:2});
 const L1=M.luck({pities:{character:[20,30,40,50]},fifty:{'0.5':{won:4,played:4}}}),L2=M.luck({pities:{character:[20,30,40,50]},fifty:{'0.5':{won:4,played:4}}});
 assert.deepEqual(L1,L2,'seeded: same input, same percentile');assert(L1.pity.luckierThan>0.9,String(L1.pity.luckierThan));assert(M.luck({pities:{character:[5,5,5,5,5]}}).pity.luckierThan>0.999);assert(Math.abs(L1.fifty.luckierThan-(1-0.0625/2))<0.01,'4 of 4 at 50%: luckier than ~97%');
 const bad=M.luck({pities:{character:[90,90,90]}});assert(bad.pity.luckierThan<0.01);
 const t0=Date.now();M.luck({pities:{character:Array(60).fill(62),lightcone:Array(20).fill(53)},fifty:{'0.5':{won:20,played:40},'0.75':{won:15,played:20}}});assert(Date.now()-t0<1500,'luck stays cheap');
 assert(/оценка сообщества/.test(M.SOURCE_NOTE));
}
// ---------- Reliquary Archiver: Stellar Jade and passes ----------
{
 const r=readArchiver(path.join(__dirname,'fixtures','archiver-v0.20-synthetic.json'));
 assert.deepEqual({ok:r.ok,uid:r.uid,jade:r.jade,special:r.special,standard:r.standard},{ok:true,uid:'100000001',jade:16000,special:0,standard:0});
 const dir=tempDir('archiver'),f=path.join(dir,'archiver_output.json');
 fs.writeFileSync(f,JSON.stringify({gacha:{stellar_jade:3200},materials:[{id:'102',count:7},{id:'101',count:12}],metadata:{uid:UID}}));
 assert.deepEqual((({jade,special,standard,uid})=>({jade,special,standard,uid}))(readArchiver(f)),{jade:3200,special:7,standard:12,uid:UID});
 fs.writeFileSync(f,'{"relics":[]}');assert.equal(readArchiver(f).ok,false);fs.writeFileSync(f,'nope');assert.equal(readArchiver(f).ok,false);assert.equal(readArchiver(path.join(dir,'none.json')).ok,false);
}
console.log('PASS: tracker — new banner types from the history page and unknown types as their own banners, Ld endpoint by the page, synthetic blockfile cache read only (types, banners, image, no key), backups before writes, log masking, authkey in no file after fetch/update/expired/import/export/log, SRGF v1.0 and UIGF v4.2 export and import, model = official consolidated rates, exact planner, seeded luck percentile, Archiver jade');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const d of temps)fs.rmSync(d,{recursive:true,force:true});});
