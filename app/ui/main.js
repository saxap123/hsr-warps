/* «Главная» («Витрина»): the character banner as a hero with the current banner art and the big pity
   counter, the other banners as cards, the latest 5★ as tall portrait cards (click: the pull in «История»). */
(function(){
 const U=window.UI,V=window.View,esc=U.esc;
 function bannerCard(b){
  return `<article class="va-banner" data-banner="${esc(b.type)}">
   ${b.heroArt?`<img class="va-banner-art${b.kind==='lightcone'?' cone':''}" src="${esc(b.heroArt)}" alt="" draggable="false">`:''}
   <div class="va-banner-body"><h3>${esc(b.title)}</h3><small class="muted sub">${esc(b.current?(b.current.name||b.current.title):b.lastFive?'последняя 5★: '+b.lastFive.name:' ')}</small>
    <div class="va-num" data-pity><b>${esc(U.counterValue(b))}</b>${b.maxPity&&!b.finished?`<span>/ ${b.maxPity}</span>`:''}</div>
    ${b.finished?'<p class="muted done">Все 50 прыжков сделаны</p>':U.pityBar(b,{label:false})}${U.guaranteeHtml(b)}</div></article>`;
 }
 function render(vm,ctx){
  const main=vm.banners.find(b=>b.type==='11')||vm.banners[0];
  if(!main)return U.shell(vm,ctx,U.empty('Прыжков пока нет','Нажми «Обновить», когда откроешь историю прыжков в игре.'),{tab:'main'});
  const rest=vm.banners.filter(b=>b!==main),art=main.current?.art||main.heroArt,l=vm.luck;
  const luck=[l.pity?`<button class="stat-pill" data-act="tab" data-tab="luck"><b>${U.pct(l.pity.luckierThan)}</b><span>скорость 5★: везучее игроков</span></button>`:'',
   l.fifty?`<button class="stat-pill" data-act="tab" data-tab="luck"><b>${U.pct(l.fifty.luckierThan)}</b><span>50/50: везучее игроков</span></button>`:''].join('');
  return U.shell(vm,ctx,`
  <section class="va-hero" data-banner="${esc(main.type)}">
   ${art?`<div class="va-hero-bg" style="background-image:url('${esc(art)}')"></div>`:''}
   <div class="va-hero-main">
    <p class="eyebrow">${main.current?`Сейчас в игре · «${esc(main.current.title)}»`:main.lastFive?`Последняя 5★ · ${esc(main.lastFive.name)} · ${esc(V.day(main.lastFive.time))}`:esc(main.title)}</p>
    <h1>${esc(main.title)}</h1>
    <div class="va-counter" data-pity><b>${esc(U.counterValue(main))}</b><span>/ ${main.maxPity||'?'}</span></div>
    <p class="va-label">прыжков с последней 5★</p><p class="va-left">${esc(U.leftText(main))}</p>
    ${U.pityBar(main)}
    ${U.guaranteeHtml(main,'big')}
    ${U.factsHtml(main,'facts row')}
   </div>
   ${art?`<img class="va-hero-art" src="${esc(art)}" alt="" draggable="false">`:''}
   ${main.current?`<div class="va-hero-tag"><small>Баннер сейчас</small><b>${esc(main.current.name)}</b></div>`:''}
  </section>
  <section class="va-banners">${rest.map(bannerCard).join('')}</section>
  <section class="panel va-recent"><div class="section-head"><div><h2>Последние 5★</h2><p class="muted">Нажми на карточку — откроется этот прыжок в истории</p></div><div class="row">${luck}</div></div>
   <div class="va-cards">${vm.recent.length?vm.recent.slice(0,12).map(f=>U.card(f)).join(''):'<p class="muted">5★ в истории пока нет.</p>'}</div></section>`,{tab:'main'});
 }
 window.Screens.main=render;
})();
