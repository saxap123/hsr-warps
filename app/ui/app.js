/* Page flow and router: open the saved history, «Обновить» (find the link in the game files, then load only new
   pulls), paste a link by hand, cancel, progress, notices; the screens (window.Screens: main, history, collection,
   luck, plan, settings) draw from one view model (View.build). Nothing runs in the background. */
(function(){
 const Core=window.WarpsCore,V=window.View,esc=V.esc,desktop=window.desktop;
 const S={ready:false,history:null,accounts:[],settings:{},cache:null,catalog:null,version:'',vm:null,
  busy:null,progress:null,cancelling:false,found:null,problem:null,paste:'',pasteError:null,notice:null,error:null,tab:'main'};
 window.AppState=S;
 const message=e=>String(e?.message||e||'Неизвестная ошибка').replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/,'');
 function rebuild(){S.vm=S.history?V.build(S.history,{catalog:S.catalog,cache:S.cache,now:Date.now()}):null;}
 // ---------- shared pieces ----------
 const stepsHtml=()=>`<ol class="steps">${Core.MANUAL_STEPS.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`;
 function pasteHtml(){
  return `<div class="paste"><label for="paste">Ссылка на историю прыжков</label>
   <textarea id="paste" data-paste rows="3" spellcheck="false" placeholder="${esc(Core.TEXTS.pastePlaceholder)}">${esc(S.paste)}</textarea>
   ${S.pasteError?`<p class="error" data-paste-error>${esc(S.pasteError)}</p>`:''}<p class="hint">${esc(Core.TEXTS.pasteHint)}</p>
   <div class="row"><button class="btn primary" data-act="paste" ${S.busy?'disabled':''}>Загрузить</button><button class="btn ghost" data-act="find" ${S.busy?'disabled':''}>Искать в файлах игры ещё раз</button></div></div>`;
 }
 function progressText(){
  const p=S.progress;if(S.cancelling)return 'Останавливаю загрузку…';
  if(S.busy==='find')return 'Ищу ссылку в файлах игры…';
  if(!p)return 'Связываюсь с сервером истории прыжков…';
  return `Загружаю «${p.title}»: страница ${p.page} · получено ${V.pulls(p.total)}`;
 }
 const share=()=>{const p=S.progress;if(!p||!p.count)return 3;return Math.max(3,Math.min(100,100*(p.index+(p.done?1:.5))/p.count));};
 function progressHtml(){
  return `<div class="progress-card" data-progress><div class="progress-line"><span class="spinner"></span><b data-progress-text>${esc(progressText())}</b></div>
   <div class="track"><i style="width:${share()}%"></i></div>
   <div class="row between"><small>Между запросами пауза 0,3 с, чтобы сервер не ограничил доступ.</small>${S.busy==='update'?`<button class="btn ghost" data-act="cancel" ${S.cancelling?'disabled':''}>Отмена</button>`:''}</div></div>`;
 }
 function linkAge(found){
  if(!found?.linkTime)return '';
  const hours=(Date.now()-found.linkTime)/3600000;
  return hours>20?`Ссылка из игры от ${V.when(found.linkTime)} — ей уже ${Math.floor(hours)} ч, а живёт она около суток. Если сервер скажет «устарела», открой историю прыжков в игре ещё раз.`:'';
 }
 function noticeHtml(){
  return (S.error?`<div class="notice bad" data-error>${esc(S.error)}</div>`:'')+(S.notice?`<div class="notice ${S.notice.kind}" data-notice>${esc(S.notice.text)}</div>`:'');
 }
 function problemHtml(){
  if(!S.problem)return '';
  return `<div class="problem" data-problem><h3>${esc(S.problem.title||'Ссылку не нашёл')}</h3><p class="reason" data-reason>${esc(S.problem.reason)}</p>${S.problem.steps?`<details open><summary>Как получить ссылку</summary>${stepsHtml()}</details>`:''}${pasteHtml()}</div>`;
 }
 const privacy='<p class="privacy">🔒 По ссылке видна твоя история прыжков — никому её не отправляй. Программа передаёт её только на официальный сервер HoYoverse и нигде не сохраняет, а историю хранит у тебя на компьютере.</p>';
 function startHtml(){
  let body;
  if(S.busy)body=progressHtml();
  else if(S.problem)body=problemHtml();
  else body=`<p class="lead" data-first><b>${esc(Core.TEXTS.startFirst)}</b></p><p>Игра сама сохраняет ссылку в своём кэше, когда ты открываешь историю прыжков. Программа только читает файлы игры — память игры не трогает и ничего в игре не меняет.</p>
   <div class="row"><button class="btn primary big" data-act="refresh">Найти ссылку и загрузить историю</button><button class="btn ghost" data-act="import">Импорт SRGF / UIGF / истории HSR Atelier</button></div>`;
 return `<div class="start"><div class="start-card"><h1>Трекер круток</h1><p class="sub">Гарант на каждом баннере, все 5★, удача и планы — по твоей истории прыжков.</p>${noticeHtml()}${body}${privacy}</div></div>`;
 }
 // The top block of every screen while busy / after a problem.
 function statusHtml(){
  if(S.busy)return progressHtml();
  if(S.problem)return `<div class="problem-wrap">${problemHtml()}</div>`;
  return '';
 }
 // The element being typed in is found again after a redraw (same data attributes), with its caret.
 function focusKey(el){if(!el||!el.dataset)return null;for(const k of ['hf','pb','pst','paste','cs'])if(k in el.dataset)return '[data-'+k+(el.dataset[k]?'="'+CSS.escape(el.dataset[k])+'"':'')+']'+(el.dataset.f?'[data-f="'+CSS.escape(el.dataset.f)+'"]':'');return null;}
 function draw(){
  const root=document.getElementById('app');
  const key=focusKey(document.activeElement),sel=key&&document.activeElement.selectionStart!==undefined?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
  if(!S.ready){root.innerHTML='<div class="start"><div class="start-card"><p>Открываю сохранённую историю…</p></div></div>';return;}
  const ctx={status:statusHtml(),notice:noticeHtml(),busy:!!S.busy};
  if(!S.history&&S.tab!=='settings'){root.innerHTML=startHtml();return;}
  const screen=window.Screens[S.tab]||window.Screens.main;
  root.innerHTML=screen(S.vm,ctx);
  if(key){const el=root.querySelector(key);if(el){el.focus();try{if(sel)el.setSelectionRange(sel[0],sel[1]);}catch{}}}
 }
 function drawProgress(){for(const box of document.querySelectorAll('[data-progress]')){const t=box.querySelector('[data-progress-text]');if(t)t.textContent=progressText();const bar=box.querySelector('.track i');if(bar)bar.style.width=share()+'%';}}
 // ---------- flow ----------
 async function init(){
  desktop.onProgress(p=>{S.progress=p;drawProgress();});
  try{
   const [state,catalog]=await Promise.all([desktop.state(),fetch('app://ui/catalog.json').then(r=>r.json())]);
   Object.assign(S,{history:state.history,accounts:state.accounts||[],settings:state.settings||{},cache:state.cache,version:state.version,catalog});
   if(state.error)S.error='Не получилось открыть сохранённую историю: '+state.error;
   rebuild();
  }catch(e){S.error=message(e);}
  S.ready=true;draw();
  window.dispatchEvent(new Event('hsrw-ready'));
  if(desktop.smoke)desktop.ready({screens:Object.keys(window.Screens),history:!!S.history,total:S.vm?.total||0,errors:[]});
 }
 async function find(){
  S.busy='find';S.problem=null;S.error=null;S.notice=null;S.pasteError=null;draw();
  let r;try{r=await desktop.find();}catch(e){r={ok:false,reason:message(e),steps:Core.MANUAL_STEPS};}
  S.busy=null;
  if(r.ok){S.found=r;if(r.cache){S.cache=r.cache;rebuild();}}
  else{S.found=null;S.problem={title:'Ссылку не нашёл',reason:r.reason,steps:true};}
  draw();return !!r.ok;
 }
 function addedText(r,first){
  if(r.notice)return r.notice;const n=r.addedTotal||0;
  if(first)return 'Загружено: '+V.pulls(n)+'.';
  return n?`Добавлено ${n} ${Core.plural(n,['новый прыжок','новых прыжка','новых прыжков'])}.`:'Новых прыжков нет — история уже свежая.';
 }
 async function load(options){
  const first=!S.history,pasted=!options.useFound;
  S.busy='update';S.progress=null;S.cancelling=false;S.error=null;S.notice=null;S.pasteError=null;if(!pasted)S.problem=null;draw();
  let r;try{r=await desktop.update(options);}catch(e){r={ok:false,code:'ERROR',reason:message(e)};}
  S.busy=null;S.progress=null;S.cancelling=false;
  if(r.history){S.history=r.history;try{S.accounts=(await desktop.state()).accounts||S.accounts;}catch{}rebuild();}
  const saved=!r.ok&&r.addedTotal?' Уже загруженное сохранено: '+V.pulls(r.addedTotal)+'.':'';
  if(r.ok){S.problem=null;S.paste='';S.notice={kind:'good',text:addedText(r,first)};}
  else if(r.code==='ABORTED')S.notice={kind:'warn',text:r.reason+saved};
  else if(r.code==='BAD_LINK'&&pasted){S.problem=S.problem||{reason:'Ссылка не подошла.',steps:true};S.pasteError=r.reason;}
  else if(['AUTHKEY','NO_LINK','BAD_LINK'].includes(r.code)){const age=linkAge(S.found);S.found=null;S.problem={title:r.code==='AUTHKEY'?'Ссылка устарела':'Ссылку не нашёл',reason:r.reason+(/[.!?]$/.test(r.reason)?'':'.')+saved+(age?' '+age:''),steps:true};}
  else S.error=r.reason+saved;
  draw();
 }
 function paste(){
  const text=S.paste.trim(),link=Core.parseLink(text);
  if(!link.ok){S.pasteError=link.reason;S.problem=S.problem||{reason:'Ссылка не подошла.',steps:true};draw();document.querySelector('[data-paste]')?.focus();return;}
  load({url:text});
 }
 async function importFile(){
  let r;try{r=await desktop.importFile();}catch(e){r={ok:false,reason:message(e)};}
  if(!r)return;
  if(!r.ok){S.error=r.reason;draw();return;}
  const st=await desktop.state();Object.assign(S,{history:st.history,accounts:st.accounts,settings:st.settings});rebuild();
  S.notice={kind:'good',text:`Импорт ${r.format}: `+r.result.map(x=>`UID ${x.uid} — добавлено ${V.pulls(x.added)}, всего ${V.pulls(x.total)}`).join('; ')+(r.warnings?.length?' '+r.warnings.join(' '):'')};draw();
 }
 document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
  const a=el.dataset.act;if(S.busy&&a!=='cancel')return;
  if(a==='find')find();
  else if(a==='refresh')find().then(ok=>{if(ok)return load({useFound:true});});
  else if(a==='paste')paste();
  else if(a==='cancel'){S.cancelling=true;drawProgress();desktop.cancel();}
  else if(a==='import')importFile();
  else if(a==='tab'){S.tab=el.dataset.tab;S.notice=S.busy?S.notice:null;draw();scrollTo(0,0);}
 });
 document.addEventListener('input',e=>{if(e.target.matches?.('[data-paste]'))S.paste=e.target.value;});
 window.App={state:S,draw,rebuild,find,load};
 init();
})();
