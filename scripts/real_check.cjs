// Real-data check (run by hand): finds the history link in the game files (read only), fetches the FULL history from
// the official HoYoverse server (pauses ≥ 300 ms, nothing else is contacted) into a fresh store in .realdata/warps,
// compares it with an earlier store file (optional argument, read only), prints the numbers. The authkey is never
// printed or written: only the masked link is shown, and every file written is scanned for it at the end.
// Usage: node scripts/real_check.cjs [earlier-store-file.json]
'use strict';
const fs=require('node:fs'),path=require('node:path');
const C=require('../app/core/warps-core.js'),A=require('../app/core/analysis.js'),M=require('../app/core/model.js');
const W=require('../app/warps.cjs'),G=require('../app/game-cache.cjs'),catalog=require('../app/catalog.json');
const root=path.join(__dirname,'..','.realdata'),dir=path.join(root,'warps');
(async()=>{
 const found=W.findLink({});
 if(!found.ok){console.log('link not found:',found.code,found.reason);process.exit(1);}
 const key=C.parseLink(found.url).params.authkey;
 console.log('link:',C.maskUrl(found.url),'| cache file time',new Date(found.mtime).toISOString());
 const cache=G.readGameCache({dirs:G.cacheDirs(found.installDir)});
 console.log('history page types:',JSON.stringify(cache.pageTypes));
 fs.rmSync(dir,{recursive:true,force:true});
 const log=W.createLog({file:path.join(root,'real-check.log')});
 const svc=W.createWarpsService({dir,log});
 const t0=Date.now();let last=0;
 const r=await svc.update({url:found.url,discovered:cache.pageTypes,onProgress:p=>{if(Date.now()-last>3000){last=Date.now();console.log('  …',p.title,'page',p.page,'total',p.total);}}});
 console.log('fetch:',JSON.stringify({ok:r.ok,code:r.code||'',uid:r.uid,requests:r.requests,added:r.addedTotal,types:r.types,seconds:Math.round((Date.now()-t0)/1000)}));
 if(!r.ok&&!r.history){process.exit(1);}
 const h=svc.load(r.uid);
 for(const [t,l] of Object.entries(h.byType))console.log('  type',t,'pulls',l.length,l.length?l[0].time+' … '+l[l.length-1].time:'');
 const earlier=process.argv[2];
 if(earlier&&fs.existsSync(earlier)){
  const e=JSON.parse(fs.readFileSync(earlier,'utf8'));
  for(const t of new Set([...Object.keys(e.byType||{}),...Object.keys(h.byType)])){
   const a=new Map((e.byType?.[t]||[]).map(x=>[x.id,x])),b=new Map((h.byType[t]||[]).map(x=>[x.id,x]));
   const onlyOld=[...a.keys()].filter(id=>!b.has(id)).length,onlyNew=[...b.keys()].filter(id=>!a.has(id)).length;
   const diff=[...a.keys()].filter(id=>b.has(id)&&['item_id','rank_type','time','gacha_id'].some(k=>a.get(id)[k]!==b.get(id)[k])).length;
   console.log('  compare type',t,'earlier',a.size,'now',b.size,'only earlier',onlyOld,'only now',onlyNew,'field differences',diff);
  }
 }
 const fc=A.fromGameCache(cache.banners,{catalog,history:h});
 const st=A.analyze(h,{catalog,now:Date.now(),pools:fc.pools,discovered:cache.pageTypes});
 console.log('complete history:',st.complete,'total',st.total,'5★',st.fiveCount,'jade',st.jade);
 for(const b of st.shown)console.log(' ',b.title,'| pulls',b.total,'| pity',(b.pity5Exact?'':'≥')+b.pity5+'/'+b.maxPity,'| guarantee',b.guarantee,'| 50/50',JSON.stringify(b.fifty),'| avg5',b.avgPity5,'('+b.avgPity5Count+') exp',b.expected5,'| avg4',b.avgPity4,'exp',b.expected4);
 const L=M.luck(A.luckInput(st));
 console.log('luck pity:',JSON.stringify({observed:+L.pity.observed.toFixed(1),expected:+L.pity.expected.toFixed(1),count:L.pity.count,luckierThan:+(L.pity.luckierThan*100).toFixed(1)}));
 console.log('luck 50/50:',JSON.stringify({won:L.fifty.won,played:L.fifty.played,rate:+(L.fifty.rate*100).toFixed(1),expected:+(L.fifty.expectedRate*100).toFixed(1),luckierThan:+(L.fifty.luckierThan*100).toFixed(1)}));
 console.log('current banners (game cache):',Object.values(fc.current).map(c=>c.type+': '+c.title+' / '+c.featured.map(f=>f.name+(f.id?'#'+f.id:'')).join(',')).join(' | '));
 // The authkey must be in no file written here.
 const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(p);}};walk(root);
 const leaks=files.filter(f=>{const s=fs.readFileSync(f,'latin1');return [key,encodeURIComponent(key)].some(k=>k&&s.includes(k));});
 console.log('files written',files.length,'| authkey found in files:',leaks.length);
 if(leaks.length)process.exitCode=2;
})().catch(e=>{console.error('error',W.maskSecrets(e.stack||e));process.exitCode=1;});
