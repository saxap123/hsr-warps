/* Export / import of the warp history in the community formats (uigf.org), without the authkey (it is never part of
   the history, and export takes only these fields):
   - SRGF v1.0 — the format asked for; deprecated by its authors in favour of UIGF 4. Its schema allows only the banner
     types 1, 2, 11, 12, so collaboration pulls (21, 22) and unknown new types are not written there (the result says
     how many were left out).
   - UIGF v4.2, section "hkrpg" — the current standard; all types are written.
   Import reads both (and the plain store format of this app). Every id stays a digit string. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./warps-core.js'));else root.WarpsSrgf=factory(root.WarpsCore);})(globalThis,function(Core){
 'use strict';
 const arr=v=>Array.isArray(v)?v:[];
 const str=v=>v===undefined||v===null?'':String(v);
 const APP='HSR Warp Tracker';
 const SRGF_TYPES=['1','2','11','12'];
 const UIGF_LANGS=['de-de','en-us','es-es','fr-fr','id-id','it-it','ja-jp','ko-kr','pt-pt','ru-ru','th-th','tr-tr','vi-vn','zh-cn','zh-tw'];
 const TIME=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
 function items(history){
  const out=[];
  for(const [t,list] of Object.entries(history?.byType||{}))for(const raw of arr(list)){const it=Core.normalizeItem(raw,t);if(it)out.push({...it,poolType:Core.typeKey(t)});}
  return out.sort((a,b)=>Core.compareId(a.id,b.id));
 }
 // The pool type is what the app fetched it under (the pity pool); the record's own gacha_type is kept when it has one.
 const record=it=>({gacha_id:it.gacha_id,gacha_type:it.gacha_type||it.poolType,item_id:it.item_id,count:'1',time:it.time,name:it.name,item_type:it.item_type,rank_type:it.rank_type,id:it.id});
 function lang(history){const l=str(history?.lang).toLowerCase();return UIGF_LANGS.includes(l)?l:/^ru/.test(l)?'ru-ru':/^en/.test(l)?'en-us':l||'ru-ru';}
 function tz(history){const n=Number(history?.timeZone);return Number.isFinite(n)?Math.round(n):history?.region==='cn'?8:0;}
 function toSrgf(history,{now=Date.now(),version='1.0.0'}={}){
  const all=items(history),kept=all.filter(it=>SRGF_TYPES.includes(it.poolType));
  const data={info:{uid:str(history.uid),lang:lang(history),region_time_zone:tz(history),export_timestamp:Math.floor(now/1000),export_app:APP,export_app_version:version,srgf_version:'v1.0'},list:kept.map(record)};
  return {data,text:JSON.stringify(data,null,2),count:kept.length,skipped:all.length-kept.length,skippedTypes:[...new Set(all.filter(it=>!SRGF_TYPES.includes(it.poolType)).map(it=>it.poolType))]};
 }
 function toUigf(history,{now=Date.now(),version='1.0.0'}={}){
  const all=items(history);
  const data={info:{export_timestamp:Math.floor(now/1000),export_app:APP,export_app_version:version,version:'v4.2'},hkrpg:[{uid:str(history.uid),timezone:tz(history),lang:lang(history),list:all.map(record)}]};
  return {data,text:JSON.stringify(data,null,2),count:all.length,skipped:0};
 }
 const fail=reason=>({ok:false,reason});
 // JSON with 16+ digit bare numbers quoted first, so an id written as a number by another tracker keeps its digits.
 function parseJson(text){return JSON.parse(String(text).replace(/^\uFEFF/,'').replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,'$1"$2"'));}
 // parse(text) -> {ok, format, accounts:[{uid, timeZone, lang, byType, count}], warnings} | {ok:false, reason}
 function parse(text){
  let data;try{data=typeof text==='string'?parseJson(text):text;}catch{return fail('Файл не похож на JSON: его не удалось прочитать.');}
  if(!data||typeof data!=='object')return fail('В файле нет истории прыжков.');
  const accounts=[],warnings=[];let format;
  const take=(uid,timeZone,lang,list)=>{
   const byType={};let bad=0;
   for(const raw of arr(list)){
    const t=Core.typeKey(raw?.gacha_type),id=Core.idString(raw?.id);
    if(!t||!id||!str(raw?.item_id)||!TIME.test(str(raw?.time))){bad++;continue;}
    (byType[t]=byType[t]||[]).push({id,uid:str(uid),gacha_type:t,gacha_id:str(raw.gacha_id),item_id:str(raw.item_id),name:str(raw.name),item_type:str(raw.item_type),rank_type:str(raw.rank_type),time:str(raw.time),lang:str(lang)});
   }
   if(bad)warnings.push('Пропущено записей с ошибками: '+bad+'.');
   accounts.push({uid:str(uid),timeZone:Number.isFinite(Number(timeZone))?Number(timeZone):null,lang:str(lang),byType,count:Object.values(byType).reduce((s,l)=>s+l.length,0)});
  };
  if(data.info&&str(data.info.srgf_version)&&Array.isArray(data.list)){format='SRGF '+str(data.info.srgf_version);take(data.info.uid,data.info.region_time_zone,data.info.lang,data.list);}
  else if(data.info&&/^v4\./.test(str(data.info.version))&&Array.isArray(data.hkrpg)){format='UIGF '+str(data.info.version);for(const a of data.hkrpg)take(a?.uid,a?.timezone,a?.lang,a?.list);}
  else if(data.info&&Array.isArray(data.list)&&str(data.info.uigf_version)){return fail('Это файл Genshin Impact (UIGF 2–3), а не Honkai: Star Rail.');}
  else if(data.byType&&typeof data.byType==='object'){format='HSR Warp Tracker';take(data.uid,data.timeZone,data.lang,Object.entries(data.byType).flatMap(([t,l])=>arr(l).map(x=>({...x,gacha_type:x.gacha_type||t}))));}
  else return fail('Формат файла не распознан: нужен SRGF v1.0 или UIGF v4 (раздел Honkai: Star Rail).');
  const good=accounts.filter(a=>/^\d{5,12}$/.test(a.uid));
  if(!good.length)return fail(accounts.length?'В файле нет UID аккаунта или он неверный.':'В файле нет истории Honkai: Star Rail.');
  if(!good.some(a=>a.count))return fail('В файле нет ни одного прыжка.');
  return {ok:true,format,accounts:good,warnings};
 }
 return {toSrgf,toUigf,parse,SRGF_TYPES,APP};
});
