/* Shared pieces of the «Витрина» style: the top bar, portrait cards, round portraits, chips, the guarantee box,
   the pity bar, fact tiles and a tooltip for charts. Every screen is a function (vm, ctx) -> HTML in window.Screens. */
(function(){
 const V=window.View,esc=V.esc;
 const NAV=[['main','Главная'],['history','История'],['collection','Коллекция'],['luck','Удача'],['plan','Планировщик']];
 const fmt=n=>String(n).replace('.',',');
 const pct=x=>Math.round(x*100)+'%';
 const initials=name=>esc(String(name||'?').replace(/[«»"]/g,'').split(/[\s·:]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase());
 function chip(f,{long=false}={}){const o=f.outcomeView||(f.outcome?V.OUTCOME[f.outcome]:null);if(!o)return '';return `<span class="chip ${o.cls}" title="${esc(f.outcomeText||'')}">${o.icon} ${esc(long?f.outcomeText:o.short)}</span>`;}
 function guaranteeHtml(b,size=''){
  const g=b.guaranteeView;
  if(!g)return `<div class="guarantee none ${size}"><span class="g-icon">★</span><div><b>${b.type==='1'?'Стандартный баннер':'Без 50/50'}</b><small>${b.type==='1'?'Любая 5★ из стандартного набора':'Гарант только на 5★'}</small></div></div>`;
  return `<div class="guarantee ${g.cls} ${size}" data-guarantee><span class="g-icon">${g.icon}</span><div><b>${esc(g.title)}</b><small>${esc(g.text)}</small></div></div>`;
 }
 function pityBar(b,{label=true}={}){
  if(!b.maxPity)return '';
  const soft=b.softFrom?(b.softFrom-1)/b.maxPity*100:null,fill=b.share*100;
  return `<div class="pitybar"><div class="pb-track">${soft!==null?`<span class="pb-soft" style="left:${soft}%"></span>`:''}<i style="width:${fill}%"></i></div><div class="pb-scale"><span>0</span>${soft!==null&&label?`<span class="pb-soft-label" style="left:${soft}%">мягкий гарант ≈ ${b.softFrom}</span>`:''}<span>${b.maxPity}</span></div></div>`;
 }
 const counterValue=b=>b.finished?'✓':(b.pity5Exact?'':'≥')+b.pity5;
 function leftText(b){if(b.finished)return 'Новичковый баннер пройден';if(!b.maxPity)return 'Правила этого баннера неизвестны';return b.left>0?`Гарантированная 5★ — не позже чем через ${V.pulls(b.left)}`:'Гарантированная 5★ — на следующем прыжке';}
 function facts(b){
  const out=[];
  if(b.avgPity5!==null)out.push(['В среднем 5★ за',fmt(b.avgPity5),b.expected5?'ожидается '+fmt(b.expected5):'']);
  if(b.fifty){const p=b.fifty.won+b.fifty.lost;out.push(['Выиграно '+b.rateText,p?b.fifty.won+' из '+p:'—',b.fifty.uncertain?'ещё '+b.fifty.uncertain+' не ясно':'']);}
  out.push(['С последней 4★',b.pity4+' из 10',b.avgPity4!==null?'в среднем '+fmt(b.avgPity4):'']);
  out.push(['Всего прыжков',V.num(b.total),V.num(b.jade)+' яшмы']);
  return out;
 }
 const factsHtml=(b,cls='facts')=>`<dl class="${cls}">${facts(b).map(([k,v,s])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd>${s?`<small>${esc(s)}</small>`:''}</div>`).join('')}</dl>`;
 function img(src,name,cls){return src?`<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" draggable="false">`:`<span class="${cls} ph">${initials(name)}</span>`;}
 // Tall portrait card (5★ gold frame and glow, 4★ purple).
 function card(f,cls='card'){
  const max=f.maxPity||(f.rarity===4?10:90);
  return `<article class="${cls} r${f.rarity}${f.kind==='lightcone'?' cone':''}" data-five="${esc(f.id)}" data-act="goto" data-id="${esc(f.id)}" title="${esc(f.name+' — '+(f.bannerTitle||'')+', '+(f.time||''))}">
   <div class="card-art">${img(f.art,f.name,'card-img')}</div>
   ${f.pity!==undefined&&f.pity!==null?`<span class="card-pity" title="на каком прыжке выпала">${f.exact===false?'≥':''}${f.pity}</span>`:''}
   <div class="card-foot"><b>${esc(f.name)}</b>${f.sub!==undefined?`<small>${esc(f.sub)}</small>`:`<small>${esc(f.banner||'')} · ${esc(f.day||'')}</small><div class="card-bar"><i style="width:${Math.min(100,(f.pity||0)/max*100)}%"></i></div>`}${chip(f)}${f.extraHtml||''}</div></article>`;
 }
 // Round portrait with a rarity ring.
 const ring=(src,name,rarity,kind,size='')=>`<span class="ring-av r${rarity} ${size}">${img(src,name,'ring-img'+(kind==='lightcone'?' cone':''))}</span>`;
 const stars=n=>'★'.repeat(Math.max(1,Math.min(5,n)));
 function accountLine(vm){return vm?`UID ${esc(vm.uid)} · обновлено ${esc(V.when(vm.updatedAt)||'—')}`:'';}
 const refreshBtn=busy=>`<button class="btn primary" data-act="refresh" ${busy?'disabled':''}>⟳ Обновить</button>`;
 function shell(vm,ctx,inner,{tab='main',wide=false}={}){
  return `<div class="va${wide?' wide':''}" data-screen="${esc(tab)}">
  <header class="va-top"><div class="brand"><span class="logo">✦</span><b>Трекер круток</b></div>
   <nav class="tabs">${NAV.map(([k,t])=>`<button class="${k===tab?'on':''}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}</nav>
   <div class="top-right"><span class="art-status small" data-art-status>${esc(ctx.art||'')}</span><span class="muted small">${accountLine(vm)}</span>
    <button class="btn icon${tab==='settings'?' on':''}" data-act="tab" data-tab="settings" title="Настройки">⚙</button>${refreshBtn(ctx.busy)}</div></header>
  ${ctx.status?`<div class="va-status">${ctx.status}</div>`:''}${ctx.notice?`<div class="va-status">${ctx.notice}</div>`:''}
  ${inner}</div>`;
 }
 const empty=(title,text)=>`<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p></div>`;
 // Tooltip for charts: any element with data-tip shows it near the pointer.
 let tip=null;
 document.addEventListener('pointermove',e=>{
  const el=e.target.closest?.('[data-tip]');
  if(!tip){tip=document.createElement('div');tip.className='tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);}
  if(!el){tip.style.display='none';return;}
  tip.innerHTML=el.dataset.tip;tip.style.display='block';
  const w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+16,y=e.clientY+16;
  if(x+w>innerWidth-8)x=e.clientX-w-16;if(y+h>innerHeight-8)y=e.clientY-h-16;
  tip.style.transform=`translate(${x}px,${y}px)`;
 });
 window.UI={NAV,fmt,pct,esc,chip,guaranteeHtml,pityBar,counterValue,leftText,facts,factsHtml,img,card,ring,stars,accountLine,refreshBtn,shell,empty,initials};
 window.Screens=window.Screens||{};
})();
