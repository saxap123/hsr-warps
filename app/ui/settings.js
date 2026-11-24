/* «Настройки»: account, local data and backups, SRGF / UIGF export and import, the Archiver scan, privacy, version. */
(function(){
 const U=window.UI,V=window.View,esc=U.esc;
 function render(vm,ctx){
  const S=window.AppState,acc=S.accounts.filter(a=>!a.broken),broken=S.accounts.filter(a=>a.broken);
  const set=S.settings||{},types=vm?vm.st.shown.map(b=>`${b.title}: ${V.num(b.total)}`).join(' · '):'';
  return U.shell(vm,ctx,`
   <div class="page-head"><div><h1>Настройки</h1><p class="muted">Всё хранится в папке userdata рядом с программой. В сеть уходят только запросы истории на официальный сервер HoYoverse и загрузка картинок героев и конусов из открытого репозитория StarRailRes на GitHub.</p></div></div>
   <div class="set-grid">
    <section class="panel"><h2>Аккаунт</h2>
     ${acc.length?`<div class="acc-list">${acc.map(a=>`<button class="acc${vm&&a.uid===vm.uid?' on':''}" data-act="sacc" data-uid="${esc(a.uid)}"><b>UID ${esc(a.uid)}</b><span>${V.num(a.total)} ${esc(window.WarpsCore.plural(a.total,['прыжок','прыжка','прыжков']))} · обновлено ${esc(V.when(a.updatedAt)||'—')}</span></button>`).join('')}</div>`:'<p class="muted">Сохранённой истории пока нет.</p>'}
     ${broken.length?`<p class="bad">Повреждённые файлы: ${broken.map(b=>'UID '+esc(b.uid)).join(', ')} — их копии не удаляются.</p>`:''}
     ${vm?`<p class="muted small">${esc(types)}</p>`:''}
     <div class="row"><button class="btn" data-act="sopen">Открыть папку с историей</button></div>
     <p class="muted small">История только дописывается: новые прыжки добавляются, старые никогда не удаляются. Перед каждой записью сохраняется резервная копия (последние 30 — в папке backups).</p></section>
    <section class="panel"><h2>Экспорт и импорт</h2>
     <p>Стандартные форматы трекеров круток. Ключ из ссылки в файлы не попадает никогда.</p>
     <div class="row"><button class="btn primary" data-act="sexp" data-f="srgf" ${vm?'':'disabled'}>Экспорт SRGF v1.0</button><button class="btn" data-act="sexp" data-f="uigf" ${vm?'':'disabled'}>Экспорт UIGF v4.2</button><button class="btn ghost" data-act="import">Импорт SRGF / UIGF…</button></div>
     <p class="muted small">SRGF v1.0 по своей схеме знает только 4 типа баннеров (1, 2, 11, 12): прыжки коллаборации туда не входят — для полной копии есть UIGF v4.2, его читают современные трекеры. Импорт принимает оба и сливает с сохранённым без потерь.</p></section>
    <section class="panel"><h2>Звёздная яшма из Reliquary Archiver</h2>
     <p>Планировщик может взять яшму и особые билеты из скана <b>archiver_output.json</b>. Скан только читается.</p>
     <p class="muted small">${set.archiverFile?'Файл: '+esc(set.archiverFile):'Файл скана ещё не выбран.'}</p>
     <div class="row"><button class="btn" data-act="sarch">Выбрать файл скана…</button></div></section>
    <section class="panel"><h2>Ссылка и приватность</h2>
     <ul class="plain"><li>Ссылка на историю ищется в кэше игры (только чтение файлов; память игры не трогается).</li><li>Ключ из ссылки живёт около суток и хранится только в памяти программы, пока она открыта: не пишется ни в историю, ни в лог, ни в экспорт.</li><li>Между запросами к серверу — пауза не меньше 0,3 с.</li><li>Арт баннеров берётся из кэша игры. Картинки героев и конусов в программу не встроены: они загружаются по игровому ID из открытого репозитория StarRailRes (github.com/Mar-7th/StarRailRes) только для того, что есть в твоей истории, и хранятся в userdata/art. Если картинки ещё нет — показываются инициалы, проверка повторяется через сутки.</li></ul></section>
    <section class="panel"><h2>О программе</h2><p>HSR Warp Tracker ${esc(S.version)} · личный трекер круток Honkai: Star Rail.</p>
     <p class="muted small">Не связана с HoYoverse / COGNOSPHERE. Honkai: Star Rail и игровые изображения принадлежат их правообладателям. Модель мягкого гаранта — оценка сообщества игроков; официальные только базовые шансы, гарант 90/80 и 50/50, 75/25. Картинки: StarRailRes (Mar-7th), загружаются при использовании.</p></section>
   </div>`,{tab:'settings'});
 }
 document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el||!document.querySelector('[data-screen="settings"]'))return;
  const S=window.AppState,a=el.dataset.act;
  if(a==='sopen')window.desktop.openData();
  else if(a==='sacc'){try{const h=await window.desktop.load(el.dataset.uid);if(h){S.history=h;window.App.rebuild();S.notice={kind:'good',text:'Открыт UID '+h.uid+'.'};window.App.draw();}}catch(err){S.error=String(err.message||err);window.App.draw();}}
  else if(a==='sexp'){if(!S.vm)return;let r;try{r=await window.desktop.exportFile(S.vm.uid,el.dataset.f);}catch(err){r={ok:false,reason:String(err.message||err)};}
   if(!r)return;S.notice=r.ok?{kind:'good',text:`Сохранено ${r.file}: ${V.num(r.count)} ${window.WarpsCore.plural(r.count,['прыжок','прыжка','прыжков'])}`+(r.skipped?`; ${r.skipped} прыжков коллаборации не входят в SRGF — для них экспортируй UIGF.`:'.')}:{kind:'bad',text:r.reason};window.App.draw();}
  else if(a==='sarch'){let r;try{r=await window.desktop.archiver(true);}catch(err){r={ok:false,reason:String(err.message||err)};}if(!r)return;
   S.settings=await window.desktop.settings({});if(r.ok&&window.PlanState){Object.assign(window.PlanState,{scan:r,scanError:'',jade:String(r.jade),passes:String(r.special)});}
   S.notice=r.ok?{kind:'good',text:`Скан Archiver прочитан: ${V.num(r.jade)} яшмы, ${r.special} особых билетов. Значения подставлены в планировщик.`}:{kind:'bad',text:r.reason};window.App.draw();}
 });
 window.Screens.settings=render;
})();
