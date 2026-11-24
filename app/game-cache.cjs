'use strict';
// Read-only reader of the game's web cache (Chromium "blockfile" cache: index, data_0..3, f_xxxxxx) in
// <StarRail_Data>/webCaches/<version>/Cache/Cache_Data. Nothing is ever written there.
// What it gives:
//  - pageTypes: banner types listed by the official warp history page itself (its GACHA_TYPE constants and tab list),
//    so a new banner type appears without an app update;
//  - banners: the banner details the game showed (gacha_info/<hash>/<lang>.json): title, type, featured 5★ / 4★, the
//    off-banner pools, the official probabilities and the banner strip image, newest first.
// The history link itself is found by warps.cjs (findLink); this module never reads or returns any authkey.
const nodeFs=require('node:fs'),nodePath=require('node:path'),zlib=require('node:zlib');
const MB=1024*1024,BLOCK={1:36,2:256,3:1024,4:4096},HEADER=8192;
const FILETIME_EPOCH=11644473600000;
function openCache(dir,{fs=nodeFs,path=nodePath,maxFile=64*MB}={}){
 const files=new Map();
 const file=name=>{if(!files.has(name)){let b=null;try{const p=path.join(dir,name),s=fs.statSync(p);if(s.isFile()&&s.size<=maxFile)b=fs.readFileSync(p);}catch{}files.set(name,b);}return files.get(name);};
 function read(addr,size){
  if(!(addr>>>31)||size<=0||size>maxFile)return null;
  const type=(addr>>>28)&7;
  if(type===0){const b=file('f_'+(addr&0x0fffffff).toString(16).padStart(6,'0'));return b?b.subarray(0,size):null;}
  if(!BLOCK[type])return null;
  const b=file('data_'+((addr>>>16)&0xff));if(!b)return null;
  const off=HEADER+(addr&0xffff)*BLOCK[type];return off+size<=b.length?b.subarray(off,off+size):null;
 }
 const entries=[];const d1=file('data_1');
 if(d1)for(let off=HEADER;off+256<=d1.length;off+=256){
  const keyLen=d1.readInt32LE(off+32);if(keyLen<=0||keyLen>65536)continue;
  const longKey=d1.readUInt32LE(off+36);
  const key=longKey?read(longKey,keyLen):d1.subarray(off+96,off+96+Math.min(keyLen,160));if(!key)continue;
  let url=key.toString('latin1');const m=/^(?:\d+\/\d+\/)?(https?:\/\/.*)$/s.exec(url);if(!m)continue;url=m[1];
  const t=d1.readBigInt64LE(off+24),created=t>0n?Number(t/1000n)-FILETIME_EPOCH:0;
  entries.push({url,created:created>1e12?created:0,sizes:[0,1,2,3].map(i=>d1.readInt32LE(off+40+i*4)),addrs:[0,1,2,3].map(i=>d1.readUInt32LE(off+56+i*4))});
 }
 function headers(e){const b=read(e.addrs[0],e.sizes[0]);return b?b.toString('latin1'):'';}
 function body(e,{max=8*MB}={}){
  if(e.sizes[1]<=0||e.sizes[1]>max)return null;
  const raw=read(e.addrs[1],e.sizes[1]);if(!raw)return null;
  const enc=(/content-encoding:\s*([^\x00\r\n]+)/i.exec(headers(e))?.[1]||'').trim().toLowerCase();
  try{return enc==='br'?zlib.brotliDecompressSync(raw,{maxOutputLength:max*4}):enc==='gzip'?zlib.gunzipSync(raw,{maxOutputLength:max*4}):enc==='deflate'?zlib.inflateSync(raw,{maxOutputLength:max*4}):Buffer.from(raw);}catch{return null;}
 }
 return {dir,entries,headers,body};
}
// Banner types from the history page bundle: `GACHA_TYPE={STANDARD:1,FRESH:2,UP_ROLE:11,…}` and the tab list
// `{gacha_type_1_text:"1",…,gacha_type_21_text_2:"21",…}`; CO_BRANDED types are served by getLdGachaLog.
function parsePageTypes(js){
 const out={};const text=String(js||'');
 for(const m of text.matchAll(/GACHA_TYPE\s*=\s*\{([^{}]{1,2000})\}/g))for(const p of m[1].matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*"?(\d{1,4})"?/g)){const t=String(Number(p[2]));out[t]={...out[t],name:p[1],ld:/CO_?BRANDED/.test(p[1])};}
 for(const m of text.matchAll(/gacha_type_(\d{1,4})_text[a-z0-9_]*\s*:\s*"(\d{1,4})"/g)){const t=String(Number(m[2]));out[t]={name:out[t]?.name||'',ld:!!out[t]?.ld,...out[t],tab:true};}
 return out;
}
const pct=v=>{const n=parseFloat(String(v||'').replace(',','.').replace('%',''));return Number.isFinite(n)?n/100:null;};
function bannerFrom(json){
 const j=json&&typeof json==='object'?json:{};
 const pick=list=>(Array.isArray(list)?list:[]).map(x=>({id:Number(x?.origin_item_id)>0?String(x.origin_item_id):'',name:String(x?.item_name||''),type:String(x?.item_type||''),star:Number(x?.star)||0,up:Number(x?.is_up)===1,image:/^https:\/\/[a-z0-9.-]+\.(hoyoverse|mihoyo)\.com\//.test(String(x?.image_url||''))?String(x.image_url):''}));
 const avatars5=pick(j.items_avatar_star_5),cones5=pick(j.items_light_cone_star_5);
 return {title:String(j.title||''),gachaType:String(Number(j.gacha_type)||''),
  up5:pick(j.items_up_star_5),up4:pick(j.items_up_star_4),
  standardCharacters:avatars5.filter(x=>!x.up&&x.id).map(x=>x.id),invitation:pick(j.items_replace_avatar_star_5).filter(x=>x.id).map(x=>x.id),
  featuredIds:avatars5.filter(x=>x.up&&x.id).map(x=>x.id),standardConeNames:cones5.filter(x=>!x.up).map(x=>x.name),featuredConeNames:cones5.filter(x=>x.up).map(x=>x.name),
  probs:{base5:pct(j.base_prob_star5),avg5:pct(j.general_prob_star5),base4:pct(j.base_prob_star4),avg4:pct(j.general_prob_star4),up:pct(j.up_prob)},version:String(j.version_switch||'')};
}
// readGameCache({dirs}) -> {pageTypes, banners, image(url) -> Buffer|null, dirs}
// dirs: Cache_Data folders, newest first. Banners: one per banner (hash), Russian text preferred, newest seen first.
function readGameCache({dirs=[],fs=nodeFs,path=nodePath,langs=['ru-ru','en-us']}={}){
 const caches=dirs.map(d=>{try{return openCache(d,{fs,path});}catch{return null;}}).filter(c=>c&&c.entries.length);
 let pageTypes={},pageSeen=0;const byHash=new Map();
 for(const c of caches){
  for(const e of c.entries){
   if(/\/hkrpg\/event\/[^/?]*gacha[^/?]*\/bundle_[^/?]+\.js(\?|$)/.test(e.url)&&e.created>=pageSeen){const js=c.body(e);if(js){const t=parsePageTypes(js.toString('utf8'));if(Object.keys(t).length){pageTypes=t;pageSeen=e.created;}}}
   const m=/^https:\/\/[a-z0-9.-]+\.(?:hoyoverse|mihoyo)\.com\/gacha_info\/hkrpg\/([a-z0-9_]+)\/([0-9a-f]{16,64})\/([a-z]{2}-[a-z]{2})\.json(\?|$)/.exec(e.url);
   if(m){
    const prev=byHash.get(m[2]),rank=l=>{const i=langs.indexOf(l);return i<0?99:i;};
    if(prev&&(rank(prev.lang)<rank(m[3])||(rank(prev.lang)===rank(m[3])&&prev.seenAt>=e.created))){prev.seenAt=Math.max(prev.seenAt,e.created);continue;}
    const b=c.body(e);let json=null;try{json=b?JSON.parse(b.toString('utf8')):null;}catch{}
    if(!json)continue;
    byHash.set(m[2],{...bannerFrom(json),key:m[2],server:m[1],lang:m[3],seenAt:Math.max(e.created,prev?.seenAt||0),cache:c});
   }
  }
 }
 const banners=[...byHash.values()].sort((a,b)=>b.seenAt-a.seenAt);
 function image(url){
  for(const c of caches)for(const e of c.entries)if(e.url===url){const b=c.body(e,{max:4*MB});if(b&&b.length>8&&b.readUInt32BE(0)===0x89504e47)return b;}
  return null;
 }
 return {pageTypes,banners:banners.map(({cache,...b})=>b),image,dirs:caches.map(c=>c.dir)};
}
// Cache_Data folders of one install: every webCaches/<version>/Cache/Cache_Data (and the old layout), newest first.
function cacheDirs(dataDir,{fs=nodeFs,path=nodePath}={}){
 const web=path.join(dataDir,'webCaches'),out=[];let names=[];
 try{names=fs.readdirSync(web,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);}catch{return out;}
 for(const n of ['Cache',...names]){const d=n==='Cache'?path.join(web,'Cache','Cache_Data'):path.join(web,n,'Cache','Cache_Data');try{const s=fs.statSync(path.join(d,'data_1'));out.push({dir:d,mtime:s.mtimeMs});}catch{}}
 return out.sort((a,b)=>b.mtime-a.mtime).map(x=>x.dir);
}
module.exports={openCache,readGameCache,parsePageTypes,bannerFrom,cacheDirs};
