/* Three design variants of the main screen (banners + guarantee + latest 5★). Same data (View.build), different
   composition. After the choice only one stays.
   A «Витрина»: the current banner's art and the character-banner counter as a hero header, other banners as cards,
     the latest 5★ as a row of tall portrait cards.
   B «Панели»: left rail, one panel per banner with a 90-tick segmented pity scale, the latest 5★ as a feed on the right.
   C «Сцена»: banner tabs, a big radial counter of the chosen banner beside a gallery of its 5★, all latest 5★ below. */
(function(){
 const V=window.View,esc=V.esc;
 const NAV=[['main','Главная'],['history','История'],['collection','Коллекция'],['luck','Удача'],['plan','Планы']];
 const ICON={main:'◈',history:'☰',collection:'❖',luck:'✦',plan:'◎'};
 const fmt=n=>String(n).replace('.',',');
 const initials=name=>esc(String(name||'?').replace(/[«»"]/g,'').split(/[\s·:]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase());
 function chip(f,{long=false}={}){const o=f.outcomeView;if(!o)return '';return `<span class="chip ${o.cls}" title="${esc(f.outcomeText)}">${o.icon} ${esc(long?f.outcomeText:o.short)}</span>`;}
 function guaranteeHtml(b,size=''){const g=b.guaranteeView;if(!g)return `<div class="guarantee none ${size}"><span class="g-icon">★</span><div><b>${b.type==='1'?'Стандартный баннер':'Без 50/50'}</b><small>${b.type==='1'?'Любая 5★ из стандартного набора':'Гарант только на 5★'}</small></div></div>`;
  return `<div class="guarantee ${g.cls} ${size}" data-guarantee><span class="g-icon">${g.icon}</span><div><b>${esc(g.title)}</b><small>${esc(g.text)}</small></div></div>`;}
 function pityBar(b,{ticks=false}={}){
  if(!b.maxPity)return '';
  const soft=b.softFrom?(b.softFrom-1)/b.maxPity*100:null,fill=b.share*100;
  if(ticks){let t='';for(let i=1;i<=b.maxPity;i++)t+=`<i class="${i<=b.pity5?'on':''}${b.softFrom&&i>=b.softFrom?' soft':''}"></i>`;return `<div class="ticks" style="--n:${b.maxPity}" title="Мягкий гарант (оценка) — с ${b.softFrom}-го прыжка">${t}</div>`;}
  return `<div class="pitybar"><div class="pb-track">${soft!==null?`<span class="pb-soft" style="left:${soft}%"></span>`:''}<i style="width:${fill}%"></i></div><div class="pb-scale"><span>0</span>${soft!==null?`<span class="pb-soft-label" style="left:${soft}%">мягкий гарант ≈ ${b.softFrom}</span>`:''}<span>${b.maxPity}</span></div></div>`;
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
 function card(f,cls='card'){
  return `<article class="${cls} r${f.rarity}${f.kind==='lightcone'?' cone':''}" data-five="${esc(f.id)}" title="${esc(f.name+' — '+f.bannerTitle+', '+f.time)}">
   <div class="card-art">${img(f.art,f.name,'card-img')}</div>
   <span class="card-pity" title="на каком прыжке выпала">${f.exact?'':'≥'}${f.pity}</span>
   <div class="card-foot"><b>${esc(f.name)}</b><small>${esc(f.banner)} · ${esc(f.day)}</small><div class="card-bar"><i style="width:${Math.min(100,f.pity/f.maxPity*100)}%"></i></div>${chip(f)}</div></article>`;
 }
 function accountLine(vm){return `UID ${esc(vm.uid)} · обновлено ${esc(V.when(vm.updatedAt)||'—')}`;}
 const refreshBtn=busy=>`<button class="btn primary" data-act="refresh" ${busy?'disabled':''}>⟳ Обновить</button>`;
 function switcher(o){return `<div class="variant-switch" title="Вариант оформления (выбор на время согласования)">${o.variants.map(v=>`<button class="${v===o.variant?'on':''}" data-act="variant" data-v="${v}">${v}</button>`).join('')}</div>`;}
 const luckLine=vm=>{const l=vm.luck;const parts=[];if(l.pity)parts.push(`Скорость 5★: везучее ${Math.round(l.pity.luckierThan*100)}% игроков`);if(l.fifty)parts.push(`50/50: везучее ${Math.round(l.fifty.luckierThan*100)}%`);return parts;};
 const emptyRecent='<p class="muted">5★ в истории пока нет.</p>';

 // ---------- A «Витрина» ----------
 function A(vm,o){
  const main=vm.banners.find(b=>b.type==='11')||vm.banners[0],rest=vm.banners.filter(b=>b!==main);
  const hero=vm.header&&vm.header.type===main.type?vm.header:null;
  const art=main.current?.art||main.heroArt;
  return `<div class="va">
  <header class="va-top"><div class="brand"><span class="logo">✦</span><b>Трекер круток</b></div>
   <nav class="tabs">${NAV.map(([k,t])=>`<button class="${k==='main'?'on':''}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}</nav>
   <div class="top-right">${switcher(o)}<span class="muted small">${accountLine(vm)}</span>${refreshBtn(o.busy)}</div></header>
  ${o.status?`<div class="va-status">${o.status}</div>`:''}${o.notice?`<div class="va-status">${o.notice}</div>`:''}
  <section class="va-hero" data-banner="${esc(main.type)}">
   ${art?`<div class="va-hero-bg" style="background-image:url('${esc(art)}')"></div>`:''}
   <div class="va-hero-main">
    <p class="eyebrow">${main.current?`Сейчас в игре · «${esc(main.current.title)}»`:esc(main.title)}</p>
    <h1>${esc(main.title)}</h1>
    <div class="va-counter" data-pity><b>${esc(counterValue(main))}</b><span>/ ${main.maxPity||'?'}</span></div>
    <p class="va-label">прыжков с последней 5★</p><p class="va-left">${esc(leftText(main))}</p>
    ${pityBar(main)}
    ${guaranteeHtml(main,'big')}
    ${factsHtml(main,'facts row')}
   </div>
   ${art?`<img class="va-hero-art" src="${esc(art)}" alt="" draggable="false">`:''}
   ${main.current?`<div class="va-hero-tag"><small>Баннер сейчас</small><b>${esc(main.current.name)}</b></div>`:''}
  </section>
  <section class="va-banners">${rest.map(b=>`<article class="va-banner" data-banner="${esc(b.type)}">
    ${b.heroArt?`<img class="va-banner-art${b.kind==='lightcone'?' cone':''}" src="${esc(b.heroArt)}" alt="" draggable="false">`:''}
    <div class="va-banner-body"><h3>${esc(b.title)}</h3>${b.current?`<small class="muted">${esc(b.current.name||b.current.title)}</small>`:'<small class="muted">&nbsp;</small>'}
     <div class="va-num" data-pity><b>${esc(counterValue(b))}</b>${b.maxPity&&!b.finished?`<span>/ ${b.maxPity}</span>`:''}</div>
     ${pityBar(b)}${guaranteeHtml(b)}</div></article>`).join('')}</section>
  <section class="va-recent"><div class="section-head"><h2>Последние 5★</h2><span class="muted">${luckLine(vm).join(' · ')}</span></div>
   <div class="va-cards">${vm.recent.length?vm.recent.slice(0,10).map(f=>card(f)).join(''):emptyRecent}</div></section>
  </div>`;
 }

 // ---------- B «Панели» ----------
 function B(vm,o){
  const order=['11','21','12','22','1','2'],banners=vm.banners.slice().sort((a,b)=>(order.indexOf(a.type)+99)%99-(order.indexOf(b.type)+99)%99||a.type-b.type);
  const l=vm.luck;
  const rows=1+Math.ceil((banners.length-1)/2);
  const feed=`<section class="vb-feed" style="grid-row:1 / span ${rows}"><h2>Последние 5★</h2>${vm.recent.length?vm.recent.slice(0,4+rows*3).map(f=>`<article class="feed r${f.rarity}" data-five="${esc(f.id)}">
      <div class="feed-ring">${img(f.art,f.name,'feed-img'+(f.kind==='lightcone'?' cone':''))}</div>
      <div class="feed-text"><b>${esc(f.name)}</b><small>${esc(f.banner)} · ${esc(f.day)}</small>${chip(f,{long:true})}</div>
      <div class="feed-pity"><b>${f.exact?'':'≥'}${f.pity}</b><div class="card-bar"><i style="width:${Math.min(100,f.pity/f.maxPity*100)}%"></i></div></div></article>`).join(''):emptyRecent}</section>`;
  return `<div class="vb">
  <aside class="vb-rail"><div class="brand"><span class="logo">✦</span><b>Трекер<br>круток</b></div>
   <nav>${NAV.map(([k,t])=>`<button class="${k==='main'?'on':''}" data-act="tab" data-tab="${k}"><span>${ICON[k]}</span>${t}</button>`).join('')}</nav>
   <div class="vb-rail-foot">${refreshBtn(o.busy)}<small class="muted">${accountLine(vm)}</small>${switcher(o)}</div></aside>
  <main class="vb-main">
   <div class="vb-head"><div><h1>Гарант по баннерам</h1><p class="muted">Всего ${V.pulls(vm.total)} · ${V.num(vm.jade)} звёздной яшмы</p></div>
    <div class="vb-luck">${l.pity?`<div class="stat"><small>Скорость 5★</small><b>${Math.round(l.pity.luckierThan*100)}%</b><span>везучее игроков · в среднем ${fmt(l.pity.observed.toFixed(1))} при ожид. ${fmt(l.pity.expected.toFixed(1))}</span></div>`:''}${l.fifty?`<div class="stat"><small>50/50 и 75/25</small><b>${Math.round(l.fifty.luckierThan*100)}%</b><span>везучее игроков · выиграно ${l.fifty.won} из ${l.fifty.played}</span></div>`:''}</div></div>
   ${o.status?`<div class="vb-status">${o.status}</div>`:''}${o.notice}
   <div class="vb-bento">${banners.map((b,i)=>{const panel=`<article class="vb-panel${i===0?' first':''}" data-banner="${esc(b.type)}">
     ${i===0&&b.heroArt?`<div class="vb-art-wrap"><img class="vb-art${b.kind==='lightcone'?' cone':''}" src="${esc(b.heroArt)}" alt="" draggable="false"></div>`:''}
     <div class="vb-panel-body"><div class="vb-title">${i>0?`<span class="vb-avatar">${img(b.heroArt,b.heroName,b.kind==='lightcone'?'cone':'')}</span>`:''}<div class="vb-title-text"><h3>${esc(b.title)}</h3>${b.current?`<span class="pill">Сейчас: ${esc(b.current.name||b.current.title)}</span>`:''}</div></div>
      <div class="vb-num" data-pity><b>${esc(counterValue(b))}</b>${b.maxPity&&!b.finished?`<span>из ${b.maxPity}</span>`:''}<em>${esc(leftText(b))}</em></div>
      ${pityBar(b,{ticks:true})}${guaranteeHtml(b)}${factsHtml(b,'facts grid2')}</div></article>`;
     return i===0?panel+feed:panel;}).join('')}</div>
  </main></div>`;
 }

 // ---------- C «Сцена» ----------
 let chosen=null;
 function ring(b){
  const R=128,C=2*Math.PI*R,max=b.maxPity||90,share=b.finished?1:Math.min(1,b.pity5/max),soft=b.softFrom?(b.softFrom-1)/max:null;
  return `<svg class="ring" viewBox="0 0 320 320" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3A3"/><stop offset="1" stop-color="#E39B2E"/></linearGradient></defs>
   <circle cx="160" cy="160" r="${R}" class="ring-track"/>
   ${soft!==null?`<circle cx="160" cy="160" r="${R}" class="ring-soft" stroke-dasharray="${C*(1-soft)} ${C}" stroke-dashoffset="${-C*soft}" transform="rotate(-90 160 160)"/>`:''}
   <circle cx="160" cy="160" r="${R}" class="ring-fill" stroke-dasharray="${Math.max(0.001,C*share)} ${C}" transform="rotate(-90 160 160)"/></svg>`;
 }
 function Cv(vm,o){
  const order=['11','21','12','22','1','2'],banners=vm.banners.slice().sort((a,b)=>(order.indexOf(a.type)+99)%99-(order.indexOf(b.type)+99)%99);
  const b=banners.find(x=>x.type===chosen)||banners[0];
  const fives=b.fives.map(f=>vm.recent.find(r=>r.id===f.id)||{...f,art:V.art(null,f.itemId)||'',banner:b.short,bannerTitle:b.title,day:V.day(f.time),outcomeView:f.outcome?V.OUTCOME[f.outcome]:null,maxPity:b.maxPity||90});
  const stageArt=b.current?.art||b.heroArt;
  return `<div class="vc">
  <header class="vc-top"><div class="brand"><span class="logo">✦</span><b>Трекер круток</b></div>
   <nav class="pills">${NAV.map(([k,t])=>`<button class="${k==='main'?'on':''}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}</nav>
   <div class="top-right">${switcher(o)}${refreshBtn(o.busy)}</div></header>
  ${o.status?`<div class="vc-status">${o.status}</div>`:''}${o.notice?`<div class="vc-status">${o.notice}</div>`:''}
  <div class="vc-tabs">${banners.map(x=>`<button class="vc-tab${x===b?' on':''}" data-act="cbanner" data-type="${esc(x.type)}">
    ${img(x.heroArt,x.heroName,'vc-tab-img'+(x.kind==='lightcone'?' cone':''))}<span><small>${esc(x.title)}</small><b>${esc(counterValue(x))}${x.maxPity&&!x.finished?` <i>/ ${x.maxPity}</i>`:''}</b></span></button>`).join('')}</div>
  <section class="vc-stage" data-banner="${esc(b.type)}">
   ${stageArt?`<div class="vc-stage-bg" style="background-image:url('${esc(stageArt)}')"></div>`:''}
   <div class="vc-gauge">
    <div class="vc-ring">${ring(b)}<div class="vc-ring-center" data-pity><b>${esc(counterValue(b))}</b><span>${b.maxPity&&!b.finished?'из '+b.maxPity:''}</span><small>с последней 5★</small></div></div>
    <p class="vc-left">${esc(leftText(b))}</p>
    ${guaranteeHtml(b,'big')}
    ${factsHtml(b,'facts grid2')}
   </div>
   <div class="vc-gallery"><div class="section-head"><h2>5★ на баннере «${esc(b.short)}»</h2><span class="muted">${b.current?'сейчас: '+esc(b.current.title):''}</span></div>
    <div class="vc-grid">${fives.length?fives.slice(0,9).map(f=>card(f,'card big')).join(''):emptyRecent}</div></div>
  </section>
  <section class="vc-all"><div class="section-head"><h2>Последние 5★ на всех баннерах</h2><span class="muted">${luckLine(vm).join(' · ')}</span></div>
   <div class="vc-strip">${vm.recent.slice(0,12).map(f=>card(f,'card mini')).join('')}</div></section>
  <footer class="vc-foot muted">${accountLine(vm)} · всего ${V.pulls(vm.total)}</footer>
  </div>`;
 }
 document.addEventListener('click',e=>{const el=e.target.closest('[data-act="cbanner"]');if(!el)return;chosen=el.dataset.type;window.App?.draw();});
 window.Variants={A,B,C:Cv};
})();
