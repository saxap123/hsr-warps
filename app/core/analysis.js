/* Warp history analysis: per-banner pity, guarantee, 50/50, every pull as a table row, the collection.
   Pure (no DOM, no fs); node and renderer. Uses WarpsCore (types, ids) and WarpsModel (expected values).

   History start. The server only returns the last stretch of pulls (about a year), so for a long-time player the
   oldest stored pull is not their first one: the first 5★ of each banner may have had more pulls before it, and a
   guarantee may already have been carried in. The history counts as complete only when the departure banner (the
   very first one of every account) is in it. Otherwise the first 5★ of each banner has a lower-bound pity («≥ N»,
   left out of averages and the luck comparison) and the guarantee at the start is unknown.

   Guarantee and 50/50. Every 5★ of an event banner is classified: featured (won or by guarantee), off-banner
   (a certain loss: standard pool), or ambiguous (Celestial Invitation heroes: a rerun win or a chosen loss).
   All sequences of hidden states consistent with the pulls are tracked (forward-backward over 2 states), so a pull is
   labelled only with what is certain; otherwise it is «uncertain» with its possible outcomes. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./warps-core.js'),require('./model.js'));else root.WarpsAnalysis=factory(root.WarpsCore,root.WarpsModel);})(globalThis,function(Core,Model){
 'use strict';
 const arr=v=>Array.isArray(v)?v:[];
 const str=v=>v===undefined||v===null?'':String(v);
 const JADE=160;
 const pulls=n=>n+' '+Core.plural(n,['прыжок','прыжка','прыжков']);
 const OUTCOME={won:'выигрыш',lost:'проигрыш',guaranteed:'по гаранту',uncertain:'не ясно'};

 // ---------- names ----------
 const indexCache=new WeakMap();
 function catalogIndex(catalog){
  if(!catalog||typeof catalog!=='object')return new Map();
  if(!indexCache.has(catalog)){const m=new Map();for(const x of [...arr(catalog.items),...arr(catalog.characters),...arr(catalog.lightCones)])if(x&&x.id!==undefined)m.set(String(x.id),x);indexCache.set(catalog,m);}
  return indexCache.get(catalog);
 }
 // Server name when the game is in Russian, then the catalog Russian name, then as sent, then the English catalog name.
 function displayName(item,names){const e=names.get(str(item.item_id));return (/^ru/i.test(item.lang)&&item.name)||(e?.ru&&e.ru!==e.name?e.ru:'')||item.name||e?.ru||e?.name||str(item.item_id);}
 const kindOf=item=>/^\d{5}$/.test(item.item_id)?'lightcone':/^\d{4}$/.test(item.item_id)?'character':/cone|конус/i.test(item.item_type)?'lightcone':item.item_type?'character':null;

 // ---------- pools ----------
 // pools from the game's banner details (game cache): {standardCharacters, invitation, standardCones} add to the defaults.
 function poolSets(pools){
  const p=pools||{};
  return {std:new Set([...Core.STANDARD_CHARACTERS,...arr(p.standardCharacters).map(String)]),inv:new Set([...Core.INVITATION_EXTRA,...arr(p.invitation).map(String)]),cones:new Set([...Core.STANDARD_LIGHT_CONES,...arr(p.standardCones).map(String)])};
 }
 function classify(item,sets){
  const id=str(item.itemId??item.item_id);
  if(item.kind==='lightcone')return sets.cones.has(id)?'off':'featured';
  // Invitation wins over the standard list: a hero added to the invitation pool may also be on a rerun banner.
  return sets.inv.has(id)?'maybe':sets.std.has(id)?'off':'featured';
 }
 // ---------- guarantee state machine (forward-backward over {no guarantee, guarantee}) ----------
 function steps(state,cls){
  if(cls==='featured')return [{label:state?'guaranteed':'won',next:false}];
  if(cls==='off')return state?[]:[{label:'lost',next:true}];
  return state?[{label:'guaranteed',next:false}]:[{label:'won',next:false},{label:'lost',next:true}];
 }
 // fives: [{cls}] oldest first; start: [false] (complete history) or [false,true] (unknown start).
 // Returns {labels:[Set], final:true|false|null, gaps:[index]}. A certain off-banner pull under a certain guarantee is
 // impossible unless pulls are missing: it is labelled a loss, marked as a gap, and the analysis restarts after it.
 function resolve(fives,start){
  const labels=fives.map(()=>new Set()),gaps=[];let begin=0,init=start.slice(),final=null;
  while(begin<=fives.length){
   const fwd=[new Set(init)];let stop=fives.length;
   for(let i=begin;i<fives.length;i++){const next=new Set();for(const s of fwd[i-begin])for(const t of steps(s,fives[i].cls))next.add(t.next);if(!next.size){stop=i;break;}fwd.push(next);}
   const n=stop-begin,bwd=new Array(n+1);bwd[n]=new Set([false,true]);
   for(let i=n-1;i>=0;i--){bwd[i]=new Set();for(const s of [false,true])if(steps(s,fives[begin+i].cls).some(t=>bwd[i+1].has(t.next)))bwd[i].add(s);}
   for(let i=0;i<n;i++)for(const s of fwd[i])if(bwd[i].has(s))for(const t of steps(s,fives[begin+i].cls))if(bwd[i+1].has(t.next))labels[begin+i].add(t.label);
   if(stop===fives.length){const f=fwd[n];final=f.size===1?[...f][0]:null;break;}
   labels[stop].add('lost');gaps.push(stop);begin=stop+1;init=[true];
   if(begin===fives.length){final=true;break;}
  }
  return {labels,final,gaps};
 }
 function outcomeOf(set){if(!set||!set.size)return null;if(set.size===1)return [...set][0];return 'uncertain';}
 function outcomeText(f,rateText){
  if(!f.outcome)return '';
  if(f.outcome==='won')return 'выигрыш '+rateText;
  if(f.outcome==='lost')return 'проигрыш '+rateText;
  if(f.outcome==='guaranteed')return 'по гаранту';
  const o=f.options||[];
  if(o.includes('won')&&o.includes('guaranteed')&&!o.includes('lost'))return 'выигрыш '+rateText+' или гарант — не ясно';
  if(o.includes('lost')&&o.includes('guaranteed')&&!o.includes('won'))return 'проигрыш '+rateText+' или гарант — не ясно';
  return 'не ясно: выигрыш или проигрыш '+rateText;
 }
 const rateText=info=>info.rate===0.75?'75/25':'50/50';

 function serverMs(time,tz){const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(str(time));return m?Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6])-tz*3600000:NaN;}
 const avg=list=>list.length?Math.round(list.reduce((s,x)=>s+x,0)/list.length*10)/10:null;

 // analyze(history, {catalog, now, pools, discovered}) -> see the bottom of the function.
 function analyze(history,{catalog=null,now=null,pools=null,discovered=null}={}){
  const h=history&&typeof history==='object'?history:Core.emptyHistory('');
  const names=catalogIndex(catalog),sets=poolSets(pools);
  const tzRaw=h.timeZone===null||h.timeZone===undefined||h.timeZone===''?NaN:Number(h.timeZone),tz=Number.isFinite(tzRaw)?tzRaw:h.region==='cn'?8:0;
  const complete=arr(h.byType?.['2']).length>0;
  const types=Core.resolveTypes({discovered,stored:h}).types;
  const banners=[],rows=[];
  for(const t of types){
   const info=Core.typeInfo(t,discovered);
   const seen=new Set(),items=[];
   for(const raw of arr(h.byType?.[t])){const it=Core.normalizeItem(raw,t);if(it&&!seen.has(it.id)){seen.add(it.id);items.push(it);}}
   items.sort((a,b)=>Core.compareId(a.id,b.id));
   let pity5=0,pity4=0,seen5=complete,seen4=complete;
   const fives=[],fours=[],runs=new Map(),own=[];
   items.forEach((it,i)=>{
    pity5++;pity4++;
    const kind=kindOf(it),rarity=Number(it.rank_type)||3,at=serverMs(it.time,tz);
    const row={id:it.id,time:it.time,at,type:t,gachaId:it.gacha_id,itemId:it.item_id,name:displayName(it,names),kind,rarity,idx:i+1,pity5,pity4,
     pity:rarity===4?pity4:pity5,exact:rarity===4?seen4:seen5,outcome:null};
    const run=runs.get(it.gacha_id)||{gachaId:it.gacha_id,first:it.time,last:it.time,firstAt:at,count:0,fives:[],featured:null};
    run.count++;run.last=it.time;runs.set(it.gacha_id,run);row.run=run;
    if(rarity===5){fives.push(row);run.fives.push(row);pity5=0;seen5=true;}
    else if(rarity===4){fours.push(row);pity4=0;seen4=true;}
    own.push(row);
   });
   // Outcomes on event banners.
   let guarantee=null,gaps=[];
   if(info.event){
    for(const f of fives)f.cls=classify(f,sets);
    // A featured-class 5★ (not in any loss pool) names the featured hero of its banner run (gacha_id). An ambiguous
    // invitation hero pulled on a run with another known featured hero was not that run's hero: a certain loss.
    const featuredOn=new Map();
    for(const f of fives)if(f.cls==='featured'){const s=featuredOn.get(f.gachaId)||new Set();s.add(f.itemId);featuredOn.set(f.gachaId,s);}
    for(const f of fives)if(f.cls==='maybe'){const s=featuredOn.get(f.gachaId);if(s&&s.size===1&&!s.has(f.itemId)){f.cls='off';f.byRun=true;}}
    const r=resolve(fives,complete?[false]:[false,true]);
    fives.forEach((f,i)=>{f.outcome=outcomeOf(r.labels[i]);f.options=[...r.labels[i]];if(r.gaps.includes(i))f.gap=true;});
    guarantee=r.final;gaps=r.gaps;
   }
   for(const f of fives)f.outcomeText=outcomeText(f,rateText(info));
   // The featured 5★ of each banner run: a won/guaranteed (or featured-class) 5★ pulled on it.
   for(const run of runs.values()){const f=run.fives.find(x=>x.outcome==='won'||x.outcome==='guaranteed')||run.fives.find(x=>x.cls==='featured');run.featured=f?{itemId:f.itemId,name:f.name}:null;}
   // Run number: the n-th run in the history with the same featured 5★ (reruns), else the n-th run of this type.
   const order=[...runs.values()].sort((a,b)=>Core.compareId(a.gachaId,b.gachaId)||a.firstAt-b.firstAt),perHero=new Map();
   order.forEach((run,i)=>{run.index=i+1;if(run.featured){const n=(perHero.get(run.featured.itemId)||0)+1;perHero.set(run.featured.itemId,n);run.heroRun=n;}});
   const exactFives=fives.filter(f=>f.exact),count=o=>fives.filter(f=>f.outcome===o).length;
   const last=items[items.length-1];
   const b={type:t,info,title:info.title,short:info.short,kind:info.kind,event:!!info.event,rate:info.rate,rateText:info.event?rateText(info):null,maxPity:info.maxPity,
    total:items.length,empty:!items.length,pity5,pity5Exact:seen5,pity4,left:info.maxPity?Math.max(0,info.maxPity-pity5):null,
    guarantee:info.event?guarantee:null,gaps:gaps.length,
    fifty:info.event?{won:count('won'),lost:count('lost'),uncertain:count('uncertain'),guaranteed:count('guaranteed')}:null,
    fiveCount:fives.length,fourCount:fours.length,
    avgPity5:avg(exactFives.map(f=>f.pity)),avgPity5Count:exactFives.length,avgPity4:avg(fours.filter(f=>f.exact).map(f=>f.pity)),
    expected5:info.model&&Model.MODELS[info.model]?Math.round(Model.dist(info.model).mean*10)/10:null,
    expected4:info.model&&Model.MODELS[info.model]?Math.round(10/Model.MODELS[info.model].official4)/10:null,
    jade:items.length*(t==='2'?128:JADE),
    fives:fives.slice().reverse(),runs:order,
    firstTime:items[0]?.time||'',lastTime:last?.time||'',lastAt:last?serverMs(last.time,tz):null,
    finished:t==='2'?items.length>=50:false};
   if(t==='1'&&complete)b.selector={pulls:Math.min(items.length,300),need:300,done:items.length>=300};
   b.texts=describe(b);
   banners.push(b);rows.push(...own);
  }
  rows.sort((a,b)=>(a.at-b.at)||Core.compareId(a.id,b.id));
  const fives=rows.filter(r=>r.rarity===5).slice().reverse();
  for(const f of fives)f.daysAgo=now!==null&&Number.isFinite(f.at)?Math.max(0,Math.floor((Number(now)-f.at)/86400000)):null;
  const shown=banners.filter(b=>!b.empty);
  return {uid:str(h.uid),updatedAt:str(h.updatedAt),complete,timeZone:tz,total:rows.length,jade:banners.reduce((s,b)=>s+b.jade,0),
   fiveCount:fives.length,banners,shown,byType:Object.fromEntries(banners.map(b=>[b.type,b])),rows,fives,recentFives:fives.slice(0,8),
   firstTime:rows[0]?.time||'',lastTime:rows[rows.length-1]?.time||''};
 }
 // Plain-Russian lines of one banner card.
 function describe(b){
  const t={title:b.title,total:'Всего: '+pulls(b.total)};
  if(b.empty){t.empty='Прыжков пока нет.';return t;}
  const ge=b.pity5Exact?'':'не меньше ';
  if(b.type==='2'&&b.finished)t.left='Все 50 прыжков новичкового баннера сделаны';
  else if(b.maxPity){
   t.pity5='С последней 5★: '+ge+b.pity5+' из '+b.maxPity;
   t.left=b.left>0?(b.pity5Exact?'Гарантированная 5★ — не позже чем через '+pulls(b.left):'Гарантированная 5★ — не позже чем через '+pulls(b.left)+' (может быть раньше: начало истории неизвестно)'):'Гарантированная 5★ — на следующем прыжке';
  }else t.pity5='С последней 5★: '+ge+pulls(b.pity5);
  t.pity4='С последней 4★: '+b.pity4+' из 10';
  if(b.avgPity5!==null)t.avg='В среднем 5★ за '+String(b.avgPity5).replace('.',',')+' '+(Number.isInteger(b.avgPity5)?Core.plural(b.avgPity5,['прыжок','прыжка','прыжков']):'прыжка');
  if(b.event){
   const what=b.kind==='lightcone'?'конус':'персонаж',whom=b.kind==='lightcone'?'конусом':'персонажем',chance=b.rate===0.75?'75%':'50%';
   t.guarantee=b.guarantee===true?'Гарант есть: следующая 5★ — точно '+what+' баннера'
    :b.guarantee===false?'Гаранта нет: следующая 5★ будет '+whom+' баннера с шансом '+chance
    :b.fiveCount?'Не ясно, есть ли гарант: последнюю 5★ нельзя точно отнести к выигрышу или проигрышу':'Не ясно, есть ли гарант: в сохранённой истории ещё нет 5★ на этом баннере';
   const f=b.fifty,played=f.won+f.lost;
   t.fifty=played||f.uncertain?'Выиграно '+b.rateText+': '+f.won+' из '+played+(f.uncertain?' (ещё '+f.uncertain+' — не ясно)':''):'Ещё не было 5★ с шансом '+b.rateText;
   if(f.guaranteed)t.byGuarantee='По гаранту: '+f.guaranteed;
  }
  if(b.selector)t.selector=b.selector.done?'300 прыжков набрано: можно выбрать персонажа стандартного баннера (если ещё не выбран)':'До выбора персонажа за 300 прыжков: '+b.selector.pulls+' из 300';
  return t;
 }
 // Everything for the expanded row: the path from the previous pull of the same rarity (5★: since the last 5★,
 // 4★: since the last 4★) to this one — how many pulls, what dropped in between, the banner run and the jade spent.
 function pathTo(result,id){
  const row=result.rows.find(r=>r.id===String(id));if(!row)return null;
  const own=result.rows.filter(r=>r.type===row.type).sort((a,b)=>Core.compareId(a.id,b.id));
  const i=own.findIndex(r=>r.id===row.id);let j=i-1;
  const same=row.rarity===5?r=>r.rarity===5:row.rarity===4?r=>r.rarity===4:()=>false;
  while(j>=0&&!same(own[j]))j--;
  const between=own.slice(j+1,i),prev=j>=0?own[j]:null;
  const notable=between.filter(r=>r.rarity>=4);
  return {row,prev,pulls:row.rarity>=4?row.pity:null,exact:row.exact,between:notable,threes:between.filter(r=>r.rarity===3).length,
   jade:(row.rarity>=4?row.pity:0)*(row.type==='2'?128:JADE),run:row.run,banner:result.byType[row.type]};
 }
 // Collection: every character / light cone ever pulled (warps only), copies, eidolon / superimposition, first date.
 function collection(result){
  const map=new Map();
  for(const r of result.rows){
   const c=map.get(r.itemId)||{itemId:r.itemId,name:r.name,kind:r.kind,rarity:r.rarity,count:0,first:r.time,firstAt:r.at,last:r.time,types:new Set()};
   c.count++;c.last=r.time;c.types.add(r.type);if(r.at<c.firstAt){c.firstAt=r.at;c.first=r.time;}map.set(r.itemId,c);
  }
  const out=[...map.values()].map(c=>{const extra=c.kind==='character'?Math.max(0,c.count-7):Math.max(0,c.count-5);
   const rank=c.kind==='character'?'E'+Math.min(6,c.count-1):'S'+Math.min(5,c.count);
   return {...c,types:[...c.types],rank,extra,rankText:rank+(extra?' +'+extra:'')};});
  out.sort((a,b)=>b.rarity-a.rarity||(a.kind===b.kind?0:a.kind==='character'?-1:1)||b.count-a.count||a.firstAt-b.firstAt);
  return out;
 }
 // Inputs for WarpsModel.luck: exact 5★ pities per model (departure and lower bounds left out), certain 50/50 outcomes.
 function luckInput(result){
  const pities={character:[],lightcone:[]},fifty={};
  for(const b of result.banners){
   const m=b.info.model;
   if(m==='character'||m==='lightcone')for(const f of b.fives)if(f.exact)pities[m].push(f.pity);
   if(b.event&&b.fifty){const k=String(b.rate);fifty[k]=fifty[k]||{won:0,played:0};fifty[k].won+=b.fifty.won;fifty[k].played+=b.fifty.won+b.fifty.lost;}
  }
  return {pities,fifty};
 }
 // Filter for the history table: {rarity:[5,4,3], types:[..], kind:'character'|'lightcone', from:'YYYY-MM-DD', to, q}.
 function filterRows(rows,f={}){
  const q=str(f.q).trim().toLowerCase(),rar=f.rarity&&f.rarity.length?new Set(f.rarity.map(Number)):null,types=f.types&&f.types.length?new Set(f.types.map(String)):null;
  return rows.filter(r=>(!rar||rar.has(r.rarity))&&(!types||types.has(r.type))&&(!f.kind||r.kind===f.kind)&&(!f.from||r.time.slice(0,10)>=f.from)&&(!f.to||r.time.slice(0,10)<=f.to)&&(!q||r.name.toLowerCase().includes(q)));
 }
 // Summary over the filtered rows: found, average pity (5★/4★ rows with an exact pity), earliest and latest.
 function summary(rows){
  const withPity=rows.filter(r=>r.rarity>=4&&r.exact),five=withPity.filter(r=>r.rarity===5),four=withPity.filter(r=>r.rarity===4);
  return {count:rows.length,avgPity:avg(withPity.map(r=>r.pity)),avgCount:withPity.length,avg5:avg(five.map(r=>r.pity)),n5:five.length,avg4:avg(four.map(r=>r.pity)),n4:four.length,first:rows.reduce((m,r)=>!m||r.at<m.at?r:m,null),last:rows.reduce((m,r)=>!m||r.at>m.at?r:m,null)};
 }
 // Banner details read from the game cache (game-cache.cjs) -> loss pools for classify() and the latest banner per type.
 // Light cones come without ids: they are matched by name (catalog Russian / English names, names in the history).
 function fromGameCache(banners,{catalog=null,history=null}={}){
  const byName=new Map(),norm=s=>String(s||'').toLowerCase().replace(/[«»"'’.,:!?]/g,'').replace(/\s+/g,' ').trim();
  for(const x of catalogIndex(catalog).values())for(const n of [x.ru,x.name])if(n)byName.set(norm(n),String(x.id));
  for(const list of Object.values(history?.byType||{}))for(const it of arr(list))if(it?.name&&it?.item_id)byName.set(norm(it.name),String(it.item_id));
  const idOf=item=>item.id||byName.get(norm(item.name))||'';
  const pools={standardCharacters:new Set(),invitation:new Set(),standardCones:new Set()},current={};
  for(const b of arr(banners)){
   for(const id of arr(b.standardCharacters))pools.standardCharacters.add(String(id));
   for(const id of arr(b.invitation))pools.invitation.add(String(id));
   for(const n of arr(b.standardConeNames)){const id=byName.get(norm(n));if(id)pools.standardCones.add(id);}
   const t=String(b.gachaType||'');if(!t||current[t])continue;   // banners come newest first
   const featured=arr(b.up5).map(x=>({...x,id:idOf(x)||(b.featuredIds?.length===1?String(b.featuredIds[0]):'')}));
   current[t]={title:b.title,type:t,seenAt:b.seenAt,featured,fours:arr(b.up4).map(x=>({...x,id:idOf(x)})),probs:b.probs,image:featured[0]?.image||''};
  }
  return {pools:{standardCharacters:[...pools.standardCharacters],invitation:[...pools.invitation],standardCones:[...pools.standardCones]},current};
 }
 return {analyze,describe,pathTo,collection,luckInput,filterRows,summary,fromGameCache,resolve,classify,poolSets,displayName,serverMs,OUTCOME,JADE};
});
