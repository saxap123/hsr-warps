/* View model shared by every screen: banners with their pity, guarantee and art, the
   latest 5★ with portraits, a short luck line. All numbers come from WarpsAnalysis / WarpsModel. */
(function(){
 const A=window.WarpsAnalysis,M=window.WarpsModel,Core=window.WarpsCore;
 const MONTHS=['янв.','февр.','марта','апр.','мая','июня','июля','авг.','сент.','окт.','нояб.','дек.'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pulls=n=>n+' '+Core.plural(n,['прыжок','прыжка','прыжков']);
 const num=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
 // Server time «2026-11-21 00:19:46» as «21 нояб.» (+ year when not this year).
 function day(time,withYear){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(time||''));if(!m)return '';const y=+m[1],now=new Date().getFullYear();return (+m[3])+' '+MONTHS[+m[2]-1]+(withYear||y!==now?' '+y:'');}
 function when(ms){const d=new Date(ms);if(!Number.isFinite(d.getTime()))return '';return d.toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});}
 // Art of an item: downloaded on demand from StarRailRes by game id (main: art.cjs); '' until it is there (initials).
 function art(_unused,id){return window.AppState?.artUrls?.[String(id||'')]||'';}
 const GUARANTEE={
  yes:(b)=>({cls:'yes',icon:'🔒',title:'Гарант есть',text:'Следующая 5★ — точно '+(b.kind==='lightcone'?'конус':'персонаж')+' баннера'}),
  no:(b)=>({cls:'no',icon:'½',title:'Без гаранта · '+b.rateText,text:'Следующая 5★ — '+(b.kind==='lightcone'?'конус':'персонаж')+' баннера с шансом '+(b.rate===0.75?'75%':'50%')}),
  unknown:(b)=>({cls:'unknown',icon:'?',title:'Гарант: не ясно',text:b.fiveCount?'Последнюю 5★ нельзя точно отнести к выигрышу или проигрышу':'В истории ещё нет 5★ на этом баннере'})};
 const OUTCOME={won:{cls:'won',icon:'✓',short:'выиграл'},lost:{cls:'lost',icon:'✕',short:'проиграл'},guaranteed:{cls:'guar',icon:'🔒',short:'гарант'},uncertain:{cls:'unk',icon:'?',short:'не ясно'}};
 function build(history,{cache=null,now=Date.now()}={}){
  const fc=A.fromGameCache(cache?.banners||[],{history});
  const st=A.analyze(history,{now,pools:fc.pools,discovered:cache?.pageTypes||null});
  const luck=M.luck(A.luckInput(st));
  const banners=st.shown.map(b=>{
   const cur=fc.current[b.type]||null,feat=cur?.featured?.[0]||null;
   const last=b.fives[0]||null;
   const heroId=feat?.id||last?.itemId;
   const g=b.event?GUARANTEE[b.guarantee===true?'yes':b.guarantee===false?'no':'unknown'](b):null;
   const model=b.info.model&&M.MODELS[b.info.model];
   return {...b,current:cur?{title:cur.title,name:feat?.name||'',id:feat?.id||'',art:feat?.id?art(null,feat.id):'',strip:cur.image||'',seenAt:cur.seenAt}:null,
    heroArt:art(null,heroId),heroName:feat?.name||last?.name||'',strip:cur?.image||'',guaranteeView:g,
    softFrom:model?.soft5||null,share:b.maxPity?Math.min(1,b.pity5/b.maxPity):0,
    lastFive:last?{...last,art:art(null,last.itemId)}:null};
  });
  const recent=st.fives.slice(0,14).map(f=>({...f,art:art(null,f.itemId),banner:st.byType[f.type]?.short||'',bannerTitle:st.byType[f.type]?.title||'',day:day(f.time),outcomeView:f.outcome?OUTCOME[f.outcome]:null,maxPity:st.byType[f.type]?.maxPity||90}));
  const header=fc.current['11']||fc.current['21']||null;
  return {st,banners,recent,luck,cache:fc,uid:st.uid,total:st.total,jade:st.jade,complete:st.complete,updatedAt:history?.updatedAt||'',
   header:header?{title:header.title,name:header.featured?.[0]?.name||'',art:art(null,header.featured?.[0]?.id),strip:header.image||'',type:header.type}:null};
 }
 window.View={build,esc,pulls,num,day,when,art,OUTCOME};
})();
