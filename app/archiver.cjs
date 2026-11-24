'use strict';
// Optional: Stellar Jade and passes from a Reliquary Archiver scan (archiver_output.json, the file HSR Atelier also
// reads). Read only; only these numbers are taken: metadata.uid, gacha.stellar_jade, materials 101 (Star Rail Pass,
// standard banner) and 102 (Star Rail Special Pass, event banners).
const nodeFs=require('node:fs');
const MAX=80*1024*1024;
function readArchiver(file,{fs=nodeFs}={}){
 let stat;try{stat=fs.statSync(file);}catch{return {ok:false,reason:'Файл скана не найден.'};}
 if(!stat.isFile())return {ok:false,reason:'Это не файл.'};
 if(stat.size>MAX)return {ok:false,reason:'Файл скана больше 80 МБ — это не скан Archiver.'};
 let data;try{data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));}catch{return {ok:false,reason:'Файл скана не удалось прочитать как JSON.'};}
 if(!data||typeof data!=='object'||!data.gacha||typeof data.gacha!=='object')return {ok:false,reason:'В файле нет данных о звёздной яшме: нужен archiver_output.json от Reliquary Archiver.'};
 const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.floor(n):null;};
 const mat=id=>{const m=(Array.isArray(data.materials)?data.materials:[]).find(x=>String(x?.id)===id);return m?num(m.count)??0:0;};
 const jade=num(data.gacha.stellar_jade);
 if(jade===null)return {ok:false,reason:'В скане нет количества звёздной яшмы.'};
 return {ok:true,uid:String(data.metadata?.uid??''),jade,special:mat('102'),standard:mat('101'),scannedAt:stat.mtimeMs,source:String(data.source||''),build:String(data.build||'')};
}
module.exports={readArchiver};
