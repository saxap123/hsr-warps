'use strict';
// Art of pulled characters and light cones, downloaded on demand from the open StarRailRes repository
// (github.com/Mar-7th/StarRailRes) directly by the game id of the item — no page parsing, nothing guessed:
//   character   image/character_preview/<id>.png   (376 × 512)
//   light cone  image/light_cone_preview/<id>.png  (348 × 408)
// Nothing is bundled with the app. Images are cached in <dir> (userdata/art) with index.json; an id the repository
// does not have yet (404: a brand-new release) is retried once a day; a network error is not recorded (next launch
// tries again). One request at a time with a short pause. fetch / sleep / now are injectable for tests.
const nodeFs=require('node:fs'),nodePath=require('node:path');
const BASE='https://raw.githubusercontent.com/Mar-7th/StarRailRes/master';
const DAY=86400000,MAX=4*1024*1024;
const kindOf=id=>/^\d{5}$/.test(id)?'lightcone':/^\d{4}$/.test(id)?'character':null;
const remotePath=(id,kind)=>kind==='lightcone'?`image/light_cone_preview/${id}.png`:`image/character_preview/${id}.png`;
const isPng=b=>b&&b.length>8&&b.readUInt32BE(0)===0x89504e47&&b.readUInt32BE(4)===0x0d0a1a0a;
function createArtResolver({dir,fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),fs=nodeFs,path=nodePath,log=()=>{},pauseMs=150}={}){
 if(!dir)throw new TypeError('dir is required');
 const file=path.join(dir,'index.json');
 let index=null,busy=null;
 function load(){if(index)return index;try{index=JSON.parse(fs.readFileSync(file,'utf8'));}catch{index=null;}if(!index||index.schema!==2)index={schema:2,source:BASE,items:{},misses:{}};return index;}
 function save(){fs.mkdirSync(dir,{recursive:true});const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(index),'utf8');fs.renameSync(t,file);}
 // id -> app:// url of every image already on disk.
 function urls(){const ix=load(),out={};for(const [id,x] of Object.entries(ix.items))if(x.file&&fs.existsSync(path.join(dir,x.file)))out[id]='app://art/'+x.file;return out;}
 // ids: game ids of items to show. Returns {resolved, missed (404), failed (network), urls}.
 function resolve(ids,{onProgress=()=>{}}={}){
  if(busy)return busy;
  busy=(async()=>{
   const ix=load(),t=now(),resolved=[],missed=[],failed=[];
   const todo=[...new Set((ids||[]).map(String))].filter(id=>kindOf(id)&&!(ix.items[id]&&fs.existsSync(path.join(dir,ix.items[id].file)))&&!(ix.misses[id]&&t-ix.misses[id]<DAY));
   if(!todo.length)return {resolved,missed,failed,urls:urls()};
   log('art: downloading',todo.length,'from StarRailRes');
   let stop=false;
   for(const [i,id] of todo.entries()){
    if(stop){failed.push(id);continue;}
    try{onProgress({done:i,total:todo.length});}catch{}
    if(i)await sleep(pauseMs);
    const rel=remotePath(id,kindOf(id));
    try{
     const r=await fetch(BASE+'/'+rel,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store'});
     if(r&&r.status===404){missed.push(id);ix.misses[id]=t;continue;}
     if(!r||!r.ok)throw Error('HTTP '+(r?.status||0));
     const b=Buffer.from(await r.arrayBuffer());
     if(b.length>MAX||!isPng(b)){missed.push(id);ix.misses[id]=t;log('art: not a PNG',id);continue;}
     fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.png'),b);
     ix.items[id]={file:id+'.png',path:rel,at:t};delete ix.misses[id];resolved.push(id);
    }catch(e){
     // A network failure is not a miss: nothing is recorded, the next launch tries again. Stop after it.
     log('art: network',id,e.message);failed.push(id);stop=true;
    }
   }
   try{onProgress({done:todo.length,total:todo.length});}catch{}
   save();log('art: done',{resolved:resolved.length,missed,failed:failed.length});
   return {resolved,missed,failed,urls:urls()};
  })().finally(()=>{busy=null;});
  return busy;
 }
 return {resolve,urls,load};
}
module.exports={createArtResolver,remotePath,kindOf,BASE};
