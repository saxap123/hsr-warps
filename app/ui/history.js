/* «История»: every pull. Quick filters (Все / 5★ / 4★ / 3★), banner, type, period and name search; sorting by any
   column; a row opens the path to that 5★/4★ (pulls since the previous one, what dropped in between, banner run,
   jade). Above the table: a summary of the filtered rows and the 5★ timeline (a point opens its row). */
(function(){
 const U=window.UI,V=window.View,A=window.WarpsAnalysis,C=window.Charts,esc=U.esc;
 const H={quick:'all',type:'',kind:'',from:'',to:'',q:'',sort:{key:'time',dir:-1},open:new Set(),limit:150,flash:''};
 window.HistoryState=H;
 const COLS=[['time','Дата и время'],['banner','Баннер'],['name','Предмет'],['kind','Тип'],['rarity','Редкость'],['pity','Крутка'],['outcome','50/50']];
 const OUT_ORDER={won:1,guaranteed:2,uncertain:3,lost:4};
 let cache={vm:null,rows:null};
 function rowsOf(vm){
  if(cache.vm===vm)return cache.rows;
  const rows=vm.st.rows.map(r=>({...r,art:V.art(null,r.itemId),bannerTitle:vm.st.byType[r.type]?.title||r.type,bannerShort:vm.st.byType[r.type]?.short||r.type,maxPity:r.rarity===4?10:(vm.st.byType[r.type]?.maxPity||90),
   outcomeView:r.outcome?V.OUTCOME[r.outcome]:null,day:V.day(r.time),lname:String(r.name).toLowerCase()}));
  cache={vm,rows};return rows;
 }
 function filtered(vm,{ignoreRarity=false}={}){
  const f={rarity:ignoreRarity||H.quick==='all'?null:[Number(H.quick)],types:H.type?[H.type]:null,kind:H.kind||null,from:H.from||null,to:H.to||null,q:H.q};
  return A.filterRows(rowsOf(vm),f);
 }
 function sortRows(list){
  const {key,dir}=H.sort,val={time:r=>r.at,banner:r=>r.bannerTitle,name:r=>r.lname,kind:r=>r.kind||'',rarity:r=>r.rarity,pity:r=>r.pity,outcome:r=>OUT_ORDER[r.outcome]||9}[key]||(r=>r.at);
  return list.slice().sort((a,b)=>{const x=val(a),y=val(b);const c=typeof x==='string'?x.localeCompare(y,'ru'):x-y;return c*dir||(a.at-b.at)*-1;});
 }
 const kindText=k=>k==='lightcone'?'Конус':k==='character'?'Персонаж':'—';
 function details(vm,r){
  const p=A.pathTo(vm.st,r.id);if(!p)return '';
  const run=p.run,b=p.banner,rows=rowsOf(vm),byId=new Map(rows.map(x=>[x.id,x]));
  const runLine=`${esc(b.title)} · запуск №${esc(run.gachaId)}${run.featured?` — баннер «${esc(run.featured.name)}»${run.heroRun>1?`, ${run.heroRun}-й запуск этого героя в твоей истории`:''}`:''} · твои прыжки на нём: ${esc(V.day(run.first,true))} — ${esc(V.day(run.last,true))}, ${V.pulls(run.count)}`;
  if(r.rarity===3)return `<div class="det"><div class="det-grid"><div><dt>Баннер</dt><dd>${runLine}</dd></div><div><dt>Счётчики на этом прыжке</dt><dd>до 5★: ${r.pity5} · до 4★: ${r.pity4}</dd></div></div></div>`;
  const what=r.rarity===5?'5★':'4★',prev=p.prev?byId.get(p.prev.id):null;
  const between=p.between.map(x=>byId.get(x.id)).filter(Boolean);
  return `<div class="det">
   <div class="det-path"><div class="det-big"><b>${p.exact?'':'≥'}${p.pulls}</b><span>${esc(V.pulls(p.pulls).split(' ')[1])} с прошлой ${what}</span></div>
    <div class="det-chain">${prev?`<span class="det-node">${U.ring(prev.art,prev.name,prev.rarity,prev.kind,'sm')}<small>${esc(prev.name)}<br>${esc(V.day(prev.time,true))}</small></span>`:`<span class="det-node start"><small>${p.exact?'начало истории':'раньше — за пределами сохранённой истории'}</small></span>`}
     <span class="det-line"><i>${between.length?between.map(x=>U.ring(x.art,x.name,x.rarity,x.kind,'xs')).join(''):''}${p.threes?`<em>+ ${p.threes} × 3★</em>`:''}</i></span>
     <span class="det-node">${U.ring(r.art,r.name,r.rarity,r.kind,'sm')}<small>${esc(r.name)}<br>${esc(V.day(r.time,true))}</small></span></div></div>
   <div class="det-grid">
    <div><dt>Что выпало между ними</dt><dd>${between.length?between.map(x=>`<span class="det-item r${x.rarity}">${U.stars(x.rarity)} ${esc(x.name)}</span>`).join(' '):'ничего выше 3★'}${p.threes?` и ${p.threes} × 3★`:''}</dd></div>
    <div><dt>Баннер и запуск</dt><dd>${runLine}</dd></div>
    <div><dt>Ушло звёздной яшмы</dt><dd>${V.num(p.jade)} (${V.pulls(p.pulls)} × 160)${p.exact?'':' — не меньше'}</dd></div>
    ${r.outcome?`<div><dt>50/50</dt><dd>${U.chip(r,{long:true})}${r.byRun?' <small class="muted">— на этом запуске главный герой другой</small>':''}</dd></div>`:''}
   </div></div>`;
 }
 function summaryHtml(list){
  const s=A.summary(list);
  return `<div class="sum">
   <div><small>Найдено</small><b>${V.num(s.count)}</b><span>${esc(Core().plural(s.count,['прыжок','прыжка','прыжков']))}</span></div>
   <div><small>Средняя крутка</small>${s.avg5!==null?`<b>${U.fmt(s.avg5)}<em>до 5★</em></b>`:s.avg4!==null?`<b>${U.fmt(s.avg4)}<em>до 4★</em></b>`:'<b>—</b>'}<span>${[s.avg5!==null?'5★: по '+s.n5:'',s.avg4!==null?'4★: '+U.fmt(s.avg4)+' по '+s.n4:''].filter(Boolean).join(' · ')||'в выборке нет 4★ и 5★'}</span></div>
   <div><small>Самый ранний</small><b class="sm">${s.first?esc(V.day(s.first.time,true)):'—'}</b><span>${s.first?esc(s.first.name):''}</span></div>
   <div><small>Самый поздний</small><b class="sm">${s.last?esc(V.day(s.last.time,true)):'—'}</b><span>${s.last?esc(s.last.name):''}</span></div></div>`;
 }
 const Core=()=>window.WarpsCore;
 function tableHtml(vm,list){
  const sorted=sortRows(list),shown=sorted.slice(0,H.limit);
  const head=COLS.map(([k,t])=>`<th data-act="hsort" data-key="${k}" class="${H.sort.key===k?'on':''}">${t}${H.sort.key===k?(H.sort.dir<0?' ▾':' ▴'):''}</th>`).join('');
  const body=shown.map(r=>{const open=H.open.has(r.id);
   return `<tr class="hr r${r.rarity}${open?' open':''}${H.flash===r.id?' flash':''}" data-act="hrow" data-id="${esc(r.id)}" id="row-${esc(r.id)}">
    <td class="c-time">${esc(V.day(r.time,true))}<small>${esc(r.time.slice(11,16))}</small></td>
    <td class="c-banner">${esc(r.bannerShort)}<small>№${esc(r.gachaId)}</small></td>
    <td class="c-name">${U.ring(r.art,r.name,r.rarity,r.kind,r.rarity===3?'xs':'sm')}<b>${esc(r.name)}</b></td>
    <td>${kindText(r.kind)}</td><td class="c-rar"><span class="rar r${r.rarity}">${U.stars(r.rarity)}</span></td>
    <td class="c-pity">${r.rarity===3?`<span class="muted">${r.pity}</span>`:`<b>${r.exact?'':'≥'}${r.pity}</b>`}<div class="mini-bar"><i style="width:${Math.min(100,r.pity/r.maxPity*100)}%"></i></div></td>
    <td>${U.chip(r)}</td></tr>${open?`<tr class="hd"><td colspan="7">${details(vm,r)}</td></tr>`:''}`;}).join('');
  const more=sorted.length>H.limit?`<div class="more"><span class="muted">Показано ${shown.length} из ${V.num(sorted.length)}</span><button class="btn" data-act="hmore">Показать ещё 300</button><button class="btn ghost" data-act="hall">Показать все</button></div>`:'';
  return `<div class="table-wrap"><table class="htable"><thead><tr>${head}</tr></thead><tbody>${body||`<tr><td colspan="7" class="muted center">Под эти фильтры ничего не подходит.</td></tr>`}</tbody></table></div>${more}`;
 }
 function bodyHtml(vm){
  const list=filtered(vm),fives=filtered(vm,{ignoreRarity:true}).filter(r=>r.rarity===5);
  return `${summaryHtml(list)}
   <section class="panel"><div class="section-head"><div><h2>5★ по времени</h2><p class="muted">Высота — на каком прыжке выпала. Нажми на портрет — откроется строка в таблице.</p></div></div>${C.timeline(fives)}</section>
   <section class="panel">${tableHtml(vm,list)}</section>`;
 }
 function render(vm,ctx){
  const types=vm.st.shown.map(b=>`<option value="${esc(b.type)}" ${H.type===b.type?'selected':''}>${esc(b.title)}</option>`).join('');
  const quick=[['all','Все'],['5','Только 5★'],['4','Только 4★'],['3','Только 3★']].map(([k,t])=>`<button class="qf q${k}${H.quick===k?' on':''}" data-act="hquick" data-q="${k}">${t}</button>`).join('');
  return U.shell(vm,ctx,`
   <div class="page-head"><div><h1>История прыжков</h1><p class="muted">${V.num(vm.total)} ${esc(Core().plural(vm.total,['прыжок','прыжка','прыжков']))} с ${esc(V.day(vm.st.firstTime,true))} по ${esc(V.day(vm.st.lastTime,true))} · все копии и эйдолоны — во вкладке <button class="link" data-act="tab" data-tab="collection">Коллекция</button></p></div></div>
   <div class="filters panel">
    <div class="qf-row">${quick}</div>
    <div class="f-row">
     <label>Баннер<select data-hf="type"><option value="">Все баннеры</option>${types}</select></label>
     <label>Тип<select data-hf="kind"><option value="">Персонажи и конусы</option><option value="character" ${H.kind==='character'?'selected':''}>Только персонажи</option><option value="lightcone" ${H.kind==='lightcone'?'selected':''}>Только конусы</option></select></label>
     <label>С даты<input type="date" data-hf="from" value="${esc(H.from)}"></label>
     <label>По дату<input type="date" data-hf="to" value="${esc(H.to)}"></label>
     <label class="grow">Поиск по имени<input type="search" data-hf="q" placeholder="Например, Блэйд" value="${esc(H.q)}"></label>
     <button class="btn ghost" data-act="hreset">Сбросить</button></div></div>
   <div id="h-body">${bodyHtml(vm)}</div>`,{tab:'history'});
 }
 function redraw(){const vm=window.AppState.vm,box=document.getElementById('h-body');if(vm&&box)box.innerHTML=bodyHtml(vm);}
 // Open one pull: filters are relaxed if they hide it, the row is opened, scrolled to and flashed.
 function goto(id){
  const S=window.AppState,vm=S.vm;if(!vm)return;
  const r=rowsOf(vm).find(x=>x.id===String(id));if(!r)return;
  if(!filtered(vm).some(x=>x.id===r.id)){Object.assign(H,{quick:'all',type:'',kind:'',from:'',to:'',q:''});}
  H.open.add(r.id);H.flash=r.id;
  const idx=sortRows(filtered(vm)).findIndex(x=>x.id===r.id);if(idx>=H.limit)H.limit=idx+50;
  if(S.tab!=='history'){S.tab='history';window.App.draw();}else redraw();
  requestAnimationFrame(()=>{const el=document.getElementById('row-'+r.id);if(el)el.scrollIntoView({block:'center'});setTimeout(()=>{H.flash='';el?.classList.remove('flash');},2200);});
 }
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  if(a==='goto'){e.preventDefault();goto(el.dataset.id);return;}
  if(!document.querySelector('[data-screen="history"]'))return;
  if(a==='hquick'){H.quick=el.dataset.q;H.limit=150;document.querySelectorAll('.qf').forEach(b=>b.classList.toggle('on',b.dataset.q===H.quick));redraw();}
  else if(a==='hsort'){const k=el.dataset.key;H.sort=H.sort.key===k?{key:k,dir:-H.sort.dir}:{key:k,dir:k==='name'||k==='banner'||k==='kind'?1:-1};redraw();}
  else if(a==='hrow'){const id=el.dataset.id;if(H.open.has(id))H.open.delete(id);else H.open.add(id);redraw();}
  else if(a==='hmore'){H.limit+=300;redraw();}
  else if(a==='hall'){H.limit=1e9;redraw();}
  else if(a==='hreset'){Object.assign(H,{quick:'all',type:'',kind:'',from:'',to:'',q:'',limit:150});window.App.draw();}
 });
 let t=null;
 document.addEventListener('input',e=>{const f=e.target.dataset?.hf;if(!f)return;H[f]=e.target.value;H.limit=150;clearTimeout(t);t=setTimeout(redraw,f==='q'?180:0);});
 window.Screens.history=render;
 window.History={goto,state:H,rows:rowsOf,filtered};
})();
