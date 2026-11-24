/* «Коллекция»: every character and light cone ever pulled, with copies (eidolon / superimposition) and the date of the
   first copy. Big portraits; filters by type and rarity; sorting by copies, first date or name. Warps only. */
(function(){
 const U=window.UI,V=window.View,A=window.WarpsAnalysis,esc=U.esc;
 const K={kind:'all',rarity:'5',sort:'count'};
 let memo={vm:null,list:null};
 function list(vm){if(memo.vm!==vm)memo={vm,list:A.collection(vm.st).map(c=>({...c,art:V.art(null,c.itemId)}))};return memo.list;}
 function render(vm,ctx){
  const all=list(vm);
  const items=all.filter(c=>(K.kind==='all'||c.kind===K.kind)&&(K.rarity==='all'||String(c.rarity)===K.rarity)).sort(
   K.sort==='first'?(a,b)=>a.firstAt-b.firstAt:K.sort==='name'?(a,b)=>a.name.localeCompare(b.name,'ru'):(a,b)=>b.count-a.count||b.rarity-a.rarity||a.firstAt-b.firstAt);
  const n=(kind,r)=>all.filter(c=>c.kind===kind&&c.rarity===r).length;
  const seg=(key,opts)=>`<div class="seg">${opts.map(([v,t])=>`<button class="${K[key]===v?'on':''}" data-act="cset" data-k="${key}" data-v="${v}">${t}</button>`).join('')}</div>`;
  const cards=items.map(c=>U.card({...c,id:c.itemId,sub:`впервые ${V.day(c.first,true)}`,pity:null,
   extraHtml:`<div class="copies"><b>${esc(c.rankText)}</b><span>×${c.count} ${esc(window.WarpsCore.plural(c.count,['копия','копии','копий']))}</span></div>`},'card coll')).join('');
  return U.shell(vm,ctx,`
   <div class="page-head"><div><h1>Коллекция</h1><p class="muted">Всё, что выпало в прыжках: копии, эйдолоны (E) и наложения (S), дата первой копии. Персонажи и конусы из событий, магазина и выбора за 300 прыжков сюда не попадают.</p></div>
    <div class="row stats-row"><div class="mini-stat"><b>${n('character',5)}</b><span>5★ персонажей</span></div><div class="mini-stat"><b>${n('lightcone',5)}</b><span>5★ конусов</span></div><div class="mini-stat"><b>${n('character',4)}</b><span>4★ персонажей</span></div><div class="mini-stat"><b>${n('lightcone',4)}</b><span>4★ конусов</span></div></div></div>
   <div class="filters panel"><div class="f-row">${seg('kind',[['all','Все'],['character','Персонажи'],['lightcone','Конусы']])}${seg('rarity',[['5','5★'],['4','4★'],['3','3★'],['all','Все редкости']])}
    <label class="inline">Сортировка<select data-cs="sort"><option value="count" ${K.sort==='count'?'selected':''}>по числу копий</option><option value="first" ${K.sort==='first'?'selected':''}>по дате первой копии</option><option value="name" ${K.sort==='name'?'selected':''}>по имени</option></select></label></div></div>
   <section class="coll-grid">${cards||'<p class="muted">Ничего не подходит под фильтр.</p>'}</section>`,{tab:'collection'});
 }
 document.addEventListener('click',e=>{const el=e.target.closest('[data-act="cset"]');if(!el)return;K[el.dataset.k]=el.dataset.v;window.App.draw();});
 document.addEventListener('change',e=>{if(e.target.dataset?.cs){K[e.target.dataset.cs]=e.target.value;window.App.draw();}});
 window.Screens.collection=render;
})();
