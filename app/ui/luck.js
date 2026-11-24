/* «Удача»: your average pull to 5★ and the 50/50 win rate against the model of the game, as «luckier than X% of
   players» (a seeded simulation of 20 000 players with the same number of 5★ — computed once per history, well under
   a tenth of a second), the distribution chart, a per-banner table, and an honest note on the model. */
(function(){
 const U=window.UI,V=window.View,M=window.WarpsModel,C=window.Charts,esc=U.esc;
 function gauge(share,label){
  const R=80,Cc=2*Math.PI*R,s=Math.max(0,Math.min(1,share));
  return `<div class="gauge"><svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="lg-${label}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3A3"/><stop offset="1" stop-color="#E39B2E"/></linearGradient></defs>
   <circle cx="100" cy="100" r="${R}" class="g-track"/><circle cx="100" cy="100" r="${R}" class="g-fill" stroke="url(#lg-${label})" stroke-dasharray="${Math.max(.001,Cc*s)} ${Cc}" transform="rotate(-90 100 100)"/></svg>
   <div class="g-center"><b>${Math.round(s*100)}%</b><small>игроков</small></div></div>`;
 }
 function render(vm,ctx){
  const l=vm.luck,st=vm.st;
  const lower=st.fives.filter(f=>!f.exact).length;
  const tiles=[];
  if(l.pity)tiles.push(`<article class="luck-tile">${gauge(l.pity.luckierThan,'p')}<div><p class="eyebrow">Скорость 5★</p><h2>Ты везучее ${U.pct(l.pity.luckierThan)} игроков</h2>
   <p class="big-line">В среднем 5★ за <b>${U.fmt(l.pity.observed.toFixed(1))}</b> прыжка, по модели игры — <b>${U.fmt(l.pity.expected.toFixed(1))}</b></p>
   <p class="muted">По ${l.pity.count} ${esc(window.WarpsCore.plural(l.pity.count,['пятизвёздочной','пятизвёздочным','пятизвёздочным']))} с точным счётчиком на баннерах персонажей, конусов и стандартном.${lower?` Ещё ${lower} — в начале сохранённой истории, где счётчик известен лишь снизу: они не учтены.`:''}</p></div></article>`);
  if(l.fifty)tiles.push(`<article class="luck-tile">${gauge(l.fifty.luckierThan,'f')}<div><p class="eyebrow">50/50 и 75/25</p><h2>Ты везучее ${U.pct(l.fifty.luckierThan)} игроков</h2>
   <p class="big-line">Выиграно <b>${l.fifty.won} из ${l.fifty.played}</b> (${U.pct(l.fifty.rate)}), ожидается ${U.fmt(l.fifty.expected.toFixed(1))} (${U.pct(l.fifty.expectedRate)})</p>
   <p class="muted">Считаются только исходы, которые точно известны. Неясные (герой из «Приглашения небожителя» без подсказки по баннеру) и выпавшие по гаранту не входят.</p></div></article>`);
  const rows=st.shown.filter(b=>b.info.model).map(b=>{const f=b.fifty;return `<tr><td><b>${esc(b.title)}</b></td><td>${b.fiveCount}${b.avgPity5Count<b.fiveCount?` <small class="muted">(${b.avgPity5Count} точно)</small>`:''}</td>
   <td><b>${b.avgPity5!==null?U.fmt(b.avgPity5):'—'}</b></td><td>${b.expected5!==null&&b.type!=='2'?U.fmt(b.expected5):'—'}</td>
   <td>${b.avgPity5!==null&&b.expected5&&b.type!=='2'?`<span class="${b.avgPity5<=b.expected5?'good':'bad'}">${b.avgPity5<=b.expected5?'▼ ':'▲ '}${U.fmt(Math.abs(b.avgPity5-b.expected5).toFixed(1))}</span>`:'—'}</td>
   <td>${f?`${f.won} / ${f.lost}${f.uncertain?` <small class="muted">+${f.uncertain} ?</small>`:''}${f.guaranteed?` <small class="muted">· гарант ${f.guaranteed}</small>`:''}`:'—'}</td>
   <td>${b.avgPity4!==null?U.fmt(b.avgPity4):'—'} <small class="muted">/ ${U.fmt(b.expected4)}</small></td></tr>`;}).join('');
  return U.shell(vm,ctx,`
   <div class="page-head"><div><h1>Удача</h1><p class="muted">Сравнение с моделью игры: моделирование ${V.num(l.players)} игроков с тем же числом 5★ и тех же 50/50.</p></div></div>
   <section class="luck-tiles">${tiles.join('')||U.empty('Пока нечего сравнивать','Нужна хотя бы одна 5★ с точным счётчиком.')}</section>
   ${l.pity?`<section class="panel"><div class="section-head"><div><h2>Где ты среди игроков</h2><p class="muted">Средняя крутка до 5★ у смоделированных игроков. Золотые столбики — те, кому повезло меньше, чем тебе.</p></div></div>${C.histogram(l.pity.histogram,{observed:l.pity.observed,expected:l.pity.expected,width:1400,height:320})}</section>`:''}
   <section class="panel"><div class="section-head"><h2>По баннерам</h2></div>
    <div class="table-wrap"><table class="ltable"><thead><tr><th>Баннер</th><th>5★</th><th>Твоя средняя</th><th>Ожидается</th><th>Разница</th><th>50/50: выигрыши / проигрыши</th><th>Средняя до 4★ / ожид.</th></tr></thead><tbody>${rows}</tbody></table></div></section>
   <section class="panel note"><h3>Как считается</h3><ul>
    <li>Официально (страница баннера в игре): базовый шанс 5★ — 0,6% у персонажей и стандартного, 0,8% у конусов; в среднем с учётом гаранта — 1,6% и 1,87%; жёсткий гарант 90 и 80 прыжков; 50/50 у персонажей, 75/25 у конусов.</li>
    <li><b>Мягкий гарант — оценка сообщества игроков</b>, HoYoverse его не публикует: с 74-го прыжка у персонажей и с 66-го у конусов шанс растёт на 6 и 7 процентных пунктов за прыжок. С ним модель даёт ровно официальные средние 1,6% и 1,87%.</li>
    <li>Процентиль — моделирование ${V.num(l.players)} игроков с тем же числом 5★ на тех же типах баннеров (результат одинаков при каждом открытии). Новичковый баннер и счётчики «не меньше N» в сравнение не входят.</li></ul></section>`,{tab:'luck'});
 }
 window.Screens.luck=render;
})();
