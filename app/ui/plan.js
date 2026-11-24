/* «Планировщик»: how many pulls to the featured character / light cone with the current counter and guarantee, and
   the chance to get them with your Stellar Jade. Exact (WarpsModel.need / chance): computed only when a field changes,
   a few tens of milliseconds. Jade can come from a Reliquary Archiver scan. */
(function(){
 const U=window.UI,V=window.View,M=window.WarpsModel,C=window.Charts,esc=U.esc;
 const P={char:'11',charCopies:1,cone:'12',coneCopies:0,jade:'',passes:'',extra:'',over:{},scan:null,scanError:'',loaded:false};
 window.PlanState=P;
 const Core=()=>window.WarpsCore;
 function load(settings){if(P.loaded)return;P.loaded=true;const s=settings?.planner||{};for(const k of ['char','charCopies','cone','coneCopies','over'])if(s[k]!==undefined)P[k]=s[k];
  if(settings?.jade!==undefined)P.jade=String(settings.jade);if(settings?.passes!==undefined)P.passes=String(settings.passes);if(settings?.extra!==undefined)P.extra=String(settings.extra);}
 let saveTimer=null;
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{window.desktop?.settings({planner:{char:P.char,charCopies:P.charCopies,cone:P.cone,coneCopies:P.coneCopies,over:P.over},jade:+P.jade||0,passes:+P.passes||0,extra:+P.extra||0}).catch(()=>{});},400);}
 // Current counter and guarantee of a pool: from the history unless typed by hand.
 function stateOf(vm,type){
  const b=vm.st.byType[type],o=P.over[type]||{};
  const pity=o.pity!==undefined&&o.pity!==''?Math.max(0,Math.min((b?.maxPity||90)-1,Math.floor(+o.pity)||0)):(b?Math.min(b.pity5,(b.maxPity||90)-1):0);
  const g=o.g||(b?(b.guarantee===true?'yes':b.guarantee===false?'no':'unknown'):'no');
  return {b,pity,g,manual:o.pity!==undefined&&o.pity!==''||!!o.g,exact:b?b.pity5Exact:true};
 }
 const kindOf=t=>Core().typeInfo(t).kind;
 function compute(vm){
  const goals=[];const parts=[];
  for(const [type,copies,model,rate] of [[P.char,+P.charCopies,'character',0.5],[P.cone,+P.coneCopies,'lightcone',0.75]]){
   if(!copies)continue;const s=stateOf(vm,type);
   const pess=M.need({model,rate,pity:s.pity,guarantee:s.g==='yes',copies}),opt=s.g==='unknown'?M.need({model,rate,pity:s.pity,guarantee:true,copies}):null;
   goals.push({pess,opt});parts.push({type,copies,model,s,pess,opt});
  }
  const budget=M.budget({jade:P.jade,passes:P.passes,extra:P.extra});
  if(!goals.length)return {parts,budget,res:null};
  const res=M.chance(goals.map(g=>g.pess),budget.pulls),best=goals.some(g=>g.opt)?M.chance(goals.map(g=>g.opt||g.pess),budget.pulls):null;
  return {parts,budget,res,best};
 }
 function poolTabs(vm,kind,selected,act){
  const types=Core().resolveTypes({discovered:window.AppState.cache?.pageTypes,stored:vm.st}).types.filter(t=>kindOf(t)===kind&&Core().typeInfo(t,window.AppState.cache?.pageTypes).event);
  return `<div class="pool-tabs">${types.map(t=>{const b=vm.banners.find(x=>x.type===t),s=stateOf(vm,t),cur=b?.current;
   return `<button class="pool${t===selected?' on':''}" data-act="${act}" data-type="${t}">${U.img(b?.current?.art||b?.heroArt||'',cur?.name||Core().typeInfo(t).title,'pool-img'+(kind==='lightcone'?' cone':''))}
    <span><small>${esc(Core().typeInfo(t).title)}</small><b>${esc(cur?.name||'—')}</b><em>счётчик ${s.exact?'':'≥'}${s.pity} · ${s.g==='yes'?'гарант есть':s.g==='no'?'без гаранта':'гарант не ясен'}</em></span></button>`;}).join('')}</div>`;
 }
 function stateEditor(vm,type){
  const s=stateOf(vm,type),max=(s.b?.maxPity||90)-1;
  return `<div class="state-ed"><label>Прыжков с последней 5★<input type="number" min="0" max="${max}" data-pst="${type}" data-f="pity" value="${s.pity}"></label>
   <label>Гарант<select data-pst="${type}" data-f="g"><option value="no" ${s.g==='no'?'selected':''}>нет (50/50)</option><option value="yes" ${s.g==='yes'?'selected':''}>есть</option><option value="unknown" ${s.g==='unknown'?'selected':''}>не ясно — посчитать оба</option></select></label>
   ${s.manual?`<button class="btn ghost sm" data-act="preset" data-type="${type}">Взять из истории</button>`:`<span class="muted small">из истории${s.exact?'':' (не меньше)'}</span>`}</div>`;
 }
 const seg=(key,opts)=>`<div class="seg">${opts.map(([v,t])=>`<button class="${String(P[key])===String(v)?'on':''}" data-act="pset" data-k="${key}" data-v="${v}">${t}</button>`).join('')}</div>`;
 function results(vm,c){
  if(!c.res)return `<div class="panel">${U.empty('Выбери цель','Отметь, сколько копий персонажа или конуса нужно.')}</div>`;
  const r=c.res,b=c.budget,short=Math.max(0,r.worst-b.pulls),sh=Math.max(0,r.p90-b.pulls);
  const names=c.parts.map(p=>{const cur=vm.banners.find(x=>x.type===p.type)?.current;return (cur?.name||Core().typeInfo(p.type).title)+' '+(p.model==='character'?'E'+(p.copies-1):'S'+p.copies);}).join(' + ');
  const R=80,Cc=2*Math.PI*R;
  return `<section class="panel plan-res">
   <div class="plan-gauge"><div class="gauge"><svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="lg-plan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3A3"/><stop offset="1" stop-color="#E39B2E"/></linearGradient></defs><circle cx="100" cy="100" r="${R}" class="g-track"/><circle cx="100" cy="100" r="${R}" class="g-fill" stroke="url(#lg-plan)" stroke-dasharray="${Math.max(.001,Cc*r.chance)} ${Cc}" transform="rotate(-90 100 100)"/></svg><div class="g-center"><b data-chance>${Math.round(r.chance*100)}%</b><small>шанс</small></div></div>
    <p class="muted center">${esc(names)}<br>с запасом ${V.pulls(b.pulls)}${c.best?`<br>если гарант есть: ${Math.round(c.best.chance*100)}%`:''}</p></div>
   <dl class="facts grid2 plan-facts">
    <div><dt>Точно хватит (худший случай)</dt><dd data-worst>${V.num(r.worst)}</dd><small>${V.num(r.worst*160)} яшмы${c.best?` · с гарантом ${V.num(c.best.worst)}`:''}</small></div>
    <div><dt>Половине игроков хватит</dt><dd>${V.num(r.median)}</dd><small>${V.num(r.median*160)} яшмы</small></div>
    <div><dt>9 из 10 игроков хватит</dt><dd>${V.num(r.p90)}</dd><small>${V.num(r.p90*160)} яшмы</small></div>
    <div><dt>${short?'Не хватает до худшего случая':'Запаса хватает даже в худшем случае'}</dt><dd class="${short?'':'good'}">${short?V.num(short):'✓'}</dd><small>${short?V.num(short*160)+' яшмы'+(sh?` · до «9 из 10» — ${V.pulls(sh)}`:' · до «9 из 10» хватает'):'можно крутить спокойно'}</small></div></dl>
   <div class="plan-chart">${C.chanceCurve(r.cdf,{budget:b.pulls,worst:r.worst})}</div></section>`;
 }
 function render(vm,ctx){
  load(window.AppState.settings);
  const c=compute(vm),b=c.budget,scan=P.scan;
  return U.shell(vm,ctx,`
   <div class="page-head"><div><h1>Планировщик</h1><p class="muted">Сколько прыжков нужно до нужного персонажа или конуса с твоим текущим счётчиком и гарантом, и какой шанс при твоём запасе. Считается точно по модели игры (мягкий гарант — оценка сообщества).</p></div></div>
   <div class="plan-cols"><div class="plan-left">
    <section class="panel"><div class="section-head"><h2>Персонаж</h2>${seg('charCopies',[[0,'Не нужен'],[1,'E0'],[2,'E1'],[3,'E2'],[4,'E3'],[5,'E4'],[6,'E5'],[7,'E6']])}</div>
     ${+P.charCopies?poolTabs(vm,'character',P.char,'pchar')+stateEditor(vm,P.char):''}</section>
    <section class="panel"><div class="section-head"><h2>Световой конус</h2>${seg('coneCopies',[[0,'Не нужен'],[1,'S1'],[2,'S2'],[3,'S3'],[4,'S4'],[5,'S5']])}</div>
     ${+P.coneCopies?poolTabs(vm,'lightcone',P.cone,'pcone')+stateEditor(vm,P.cone):''}</section>
    <section class="panel"><div class="section-head"><h2>Запас</h2><span class="muted">${V.pulls(b.pulls)}${b.jadeLeft?` · ещё ${b.jadeLeft} яшмы в остатке`:''}</span></div>
     <div class="budget"><label>Звёздная яшма<input type="number" min="0" data-pb="jade" value="${esc(P.jade)}" placeholder="0"></label>
      <label>Особые билеты<input type="number" min="0" data-pb="passes" value="${esc(P.passes)}" placeholder="0"></label>
      <label>Ещё прыжков<input type="number" min="0" data-pb="extra" value="${esc(P.extra)}" placeholder="0"></label></div>
     <div class="row scan-row"><button class="btn" data-act="pscan">Взять из скана Archiver</button><button class="btn ghost" data-act="pscan-choose">Выбрать файл скана…</button>
      ${scan?`<span class="muted small">Скан от ${esc(V.when(scan.scannedAt))}: ${V.num(scan.jade)} яшмы, ${scan.special} особых билетов${scan.uid&&scan.uid!==vm.uid?` · <b class="bad">UID скана ${esc(scan.uid)} не совпадает</b>`:''}</span>`:P.scanError?`<span class="bad small">${esc(P.scanError)}</span>`:'<span class="muted small">Необязательно: archiver_output.json от Reliquary Archiver</span>'}</div></section>
   </div><div class="plan-right">${results(vm,c)}</div></div>`,{tab:'plan'});
 }
 let t=null;const redraw=()=>{clearTimeout(t);t=setTimeout(()=>{const y=scrollY;window.App.draw();scrollTo(0,y);},180);};
 document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el||!document.querySelector('[data-screen="plan"]'))return;const a=el.dataset.act;
  if(a==='pset'){P[el.dataset.k]=+el.dataset.v;save();window.App.draw();}
  else if(a==='pchar'){P.char=el.dataset.type;save();window.App.draw();}
  else if(a==='pcone'){P.cone=el.dataset.type;save();window.App.draw();}
  else if(a==='preset'){delete P.over[el.dataset.type];save();window.App.draw();}
  else if(a==='pscan'||a==='pscan-choose'){
   let r;try{r=await window.desktop.archiver(a==='pscan-choose');}catch(err){r={ok:false,reason:String(err.message||err)};}
   if(!r)return;
   if(r.ok){P.scan=r;P.scanError='';P.jade=String(r.jade);P.passes=String(r.special);save();}else{P.scanError=r.reason;}
   try{window.AppState.settings=await window.desktop.settings({});}catch{}
   window.App.draw();
  }
 });
 document.addEventListener('input',e=>{
  const d=e.target.dataset||{};
  if(d.pb){P[d.pb]=e.target.value.replace(/[^\d]/g,'');save();redraw();}
  else if(d.pst){P.over[d.pst]={...(P.over[d.pst]||{}),[d.f]:e.target.value};save();redraw();}
 });
 window.Screens.plan=render;
 window.Planner={state:P,compute};
})();
