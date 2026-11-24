// UI test in the real Electron app (production main process, preload and page; --test launch, temporary profile).
// No real network and no real game folder: a fake official API on 127.0.0.1 (HSRW_TEST_ORIGIN) and a fake game tree
// with Player.log and data_2 (HSRW_TEST_HOME); any request to HoYoverse / miHoYo hosts is cancelled and counted.
// Checks: start screen -> one click loads the synthetic history (928 pulls, pauses >= 300 ms), the authkey is never
// on the page nor in any file of the profile, every screen renders without console errors, the numbers on screen are
// the ones of the core (analysis / model), History filters / sorting / row details / jump from a 5★ card, Collection,
// Luck percentiles, Planner chance, Settings, a repeated «Обновить» adds nothing.
// Run: .build-tools\electron\electron.exe scripts\test_ui_electron.cjs
'use strict';
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hsrw-ui-')),profile=path.join(tmp,'profile'),home=path.join(tmp,'home');
process.env.HSRW_PROFILE=profile;process.argv.push('--test');
const Core=require('../app/core/warps-core.js'),A=require('../app/core/analysis.js'),M=require('../app/core/model.js'),catalog=require('../app/catalog.json');
const {makeWarpsItems,UID,AUTHKEY}=require('./fixtures/make_warps_history.cjs');
const game=path.join(home,'Games','StarRail_Data');
const write=(f,c)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c);};
const link='https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&lang=ru&authkey='+encodeURIComponent(AUTHKEY)+'&game_biz=hkrpg_global&page=1&size=5&gacha_type=11&end_id=0';
write(path.join(home,'AppData','LocalLow','Cognosphere','Star Rail','Player.log'),'Loading player data from '+game.split(path.sep).join('/')+'/data.unity3d\n');
write(path.join(game,'webCaches','2.54.0.0','Cache','Cache_Data','data_2'),Buffer.concat([Buffer.alloc(3000,7),Buffer.from('1/0/'+link+'\0','latin1'),Buffer.alloc(500,3)]));
const BIG=(a,b)=>{const x=BigInt(a),y=BigInt(b);return x<y?-1:x>y?1:0;};
const items=makeWarpsItems(),log=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),q=u.searchParams,e={at:performance.now(),type:q.get('gacha_type'),end:q.get('end_id'),size:+q.get('size'),key:q.get('authkey'),path:u.pathname};log.push(e);
 const send=b=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(b));};
 if(e.key!==AUTHKEY)return send({retcode:-100,message:'authkey error',data:null});
 const data={region:'prod_official_eur',region_time_zone:1,list:[]};
 if(u.pathname.endsWith('/getLdGachaLog')!==['21','22'].includes(e.type))return send({retcode:0,data});
 let list=(items[e.type]||[]).slice().sort((a,b)=>BIG(b.id,a.id));if(e.end!=='0')list=list.filter(x=>BIG(x.id,e.end)<0);data.list=list.slice(0,e.size);send({retcode:0,data});
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const check=(name,ok,detail)=>{assert(ok,name+(detail!==undefined?': '+JSON.stringify(detail).slice(0,600):''));checks.push(name);};
function cleanup(){try{server.close();}catch{}try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}
const timer=setTimeout(()=>{console.error('Timed out');cleanup();app.exit(1);},240000);
require('../app/main.cjs');
app.whenReady().then(async()=>{
 const blocked=[];session.defaultSession.webRequest.onBeforeRequest({urls:['*://*.hoyoverse.com/*','*://*.mihoyo.com/*']},(d,cb)=>{blocked.push(d.url);cb({cancel:true});});
 let win;for(let i=0;i<100&&!(win=BrowserWindow.getAllWindows()[0]);i++)await sleep(50);
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 const js=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(e){throw Error(e.message+'; script: '+code.slice(0,200));}};
 const waitFor=async(code,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await js(code)===true)return;await sleep(80);}throw Error('Timed out waiting for: '+code);};
 const click=sel=>js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;})()`).then(ok=>assert(ok,'No element '+sel));
 const text=sel=>js(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim()??null`);
 const tab=async t=>{await click(`[data-act="tab"][data-tab="${t}"]`);await sleep(150);};
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  process.env.HSRW_TEST_ORIGIN='http://127.0.0.1:'+server.address().port;process.env.HSRW_TEST_HOME=home;
  await waitFor(`!!(window.AppState&&AppState.ready)`);
  // 1. Start screen, then one click: find the link in the fake game tree and load the history.
  check('start screen: what to open in the game, one main button',(await text('[data-first]'))===Core.TEXTS.startFirst&&!!(await js(`!!document.querySelector('[data-act="refresh"]')`)));
  await click('[data-act="refresh"]');
  await waitFor(`!!AppState.history&&!AppState.busy`,90000);
  const pauses=log.slice(1).map((e,i)=>e.at-log[i].at);
  check('history loaded in one click: 928 pulls, ≥300 ms between requests',(await js('AppState.vm.total'))===928&&pauses.every(p=>p>=295),{total:await js('AppState.vm.total'),min:Math.min(...pauses)});
  check('notice: loaded',/Загружено: 928 прыжков/.test(await text('[data-notice]')||''),await text('[data-notice]'));
  const st=A.analyze(JSON.parse(fs.readFileSync(path.join(profile,'warps',UID+'.json'),'utf8')),{catalog});
  // 2. Main screen = core numbers.
  const hero=await js(`({pity:document.querySelector('.va-hero [data-pity] b').textContent,g:document.querySelector('.va-hero [data-guarantee] b')?.textContent,cards:[...document.querySelectorAll('.va-cards [data-five]')].map(e=>e.dataset.five),banners:[...document.querySelectorAll('.va-banner')].map(e=>[e.dataset.banner,e.querySelector('[data-pity] b').textContent])})`);
  const b11=st.byType['11'];
  check('main: character counter and guarantee from the core',hero.pity===String(b11.pity5)&&hero.g==='Гарант: не ясно',hero);
  check('main: latest 5★ cards in core order',JSON.stringify(hero.cards)===JSON.stringify(st.fives.slice(0,12).map(f=>f.id)),hero.cards);
  check('main: one card per other banner with its counter',JSON.stringify(hero.banners)===JSON.stringify(st.shown.filter(b=>b.type!=='11').map(b=>[b.type,b.finished?'✓':String(b.pity5)])),hero.banners);
  // 3. A 5★ card opens its row in History with the path.
  await click(`.va-cards [data-five="${st.fives[0].id}"]`);await sleep(300);
  const opened=await js(`({tab:AppState.tab,open:!!document.querySelector('#row-${st.fives[0].id}.open'),big:document.querySelector('.det-big b')?.textContent})`);
  const p0=A.pathTo(st,st.fives[0].id);
  check('card -> History row opened with the path (pulls since the previous 5★)',opened.tab==='history'&&opened.open&&opened.big===String(p0.pulls),opened);
  // 4. History filters, summary, sorting.
  const rowsShown=()=>js(`document.querySelectorAll('tr.hr').length`),found=()=>js(`document.querySelector('.sum b').textContent.replace(/\\s/g,'')`);
  await click('[data-act="hquick"][data-q="5"]');await sleep(150);
  check('quick filter 5★: 14 rows, summary 14',(await rowsShown())===14&&(await found())==='14');
  const avg5=await js(`document.querySelector('.sum div:nth-child(2) b').textContent`);check('summary: average 5★ pity of the filter',avg5.startsWith(String(A.summary(A.filterRows(st.rows,{rarity:[5]})).avg5).replace('.',',')),avg5);
  await js(`(()=>{const s=document.querySelector('[data-hf="type"]');s.value='12';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(150);
  check('banner filter: light cone 5★ = 3',(await rowsShown())===3);
  await click('[data-act="hreset"]');await sleep(150);
  await js(`(()=>{const s=document.querySelector('[data-hf="q"]');s.focus();s.value='фэйс';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(350);
  check('search by name keeps focus and finds 2',(await rowsShown())===2&&(await js(`document.activeElement?.dataset?.hf`))==='q');
  await click('[data-act="hreset"]');await sleep(150);
  await click('th[data-key="pity"]');await sleep(150);
  const firstPity=await js(`+document.querySelector('tr.hr .c-pity b,tr.hr .c-pity span').textContent.replace('≥','')`);
  check('sort by pity: the largest first',firstPity===Math.max(...st.rows.map(r=>r.pity)),firstPity);
  check('limit: 150 rows and «Показать ещё»',(await rowsShown())===150&&!!(await js(`!!document.querySelector('[data-act="hmore"]')`)));
  check('5★ timeline: one point per 5★',(await js(`document.querySelectorAll('.svg-chart .pt').length`))===14);
  await click(`.svg-chart .pt[data-id="${st.fives[3].id}"]`);await sleep(300);
  check('timeline point opens its row',await js(`!!document.querySelector('#row-${st.fives[3].id}.open')`));
  // 5. Collection.
  await tab('collection');
  const col=A.collection(st);
  check('collection: one card per 5★ item with copies',(await js(`document.querySelectorAll('.coll-grid .card').length`))===col.filter(c=>c.rarity===5).length&&(await js(`[...document.querySelectorAll('.coll-grid .card')].some(c=>/E1/.test(c.textContent)&&/Фэйсяо/.test(c.textContent))`)));
  // 6. Luck = model.
  await tab('luck');
  const L=M.luck(A.luckInput(st));
  const shown=await js(`[...document.querySelectorAll('.luck-tile .g-center b')].map(b=>b.textContent)`);
  check('luck: percentiles from the seeded model',JSON.stringify(shown)===JSON.stringify([Math.round(L.pity.luckierThan*100)+'%',Math.round(L.fifty.luckierThan*100)+'%']),{shown});
  check('luck: the model note says the soft pity is a community estimate',/оценка сообщества/.test(await text('.note')));
  // 7. Planner = model.
  await tab('plan');
  await js(`Object.assign(PlanState,{char:'11',charCopies:1,coneCopies:0,jade:'16000',passes:'3',extra:'0'});App.draw()`);await sleep(250);
  const need=M.need({model:'character',rate:0.5,pity:b11.pity5,guarantee:false,copies:1}),ch=M.chance([need],M.budget({jade:16000,passes:3}).pulls);
  check('planner: chance and worst case from the model (unknown guarantee -> no guarantee)',(await text('[data-chance]'))===Math.round(ch.chance*100)+'%'&&(await text('[data-worst]'))===String(ch.worst),{chance:await text('[data-chance]'),want:Math.round(ch.chance*100)});
  // 8. Settings.
  await tab('settings');
  check('settings: account, export, import',(await js(`!!document.querySelector('[data-act="sacc"][data-uid="${UID}"]')&&!!document.querySelector('[data-act="sexp"][data-f="srgf"]')&&!!document.querySelector('[data-act="import"]')`)));
  // 9. «Обновить» again: only the first page of every type, nothing added, backups untouched.
  const before=log.length;await tab('main');await click('[data-act="refresh"]');await waitFor(`!AppState.busy&&/Новых прыжков нет/.test(document.querySelector('[data-notice]')?.textContent||'')`,60000);
  check('second update asks one page per type and adds nothing',log.length-before===6,log.length-before);
  // 10. The authkey is nowhere: page, profile files, log.
  const page=await js(`document.documentElement.outerHTML+document.body.innerText`);
  check('authkey not on the page',![AUTHKEY,encodeURIComponent(AUTHKEY)].some(k=>page.includes(k)));
  const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(p);}};walk(profile);
  const leaks=files.filter(f=>{try{const s=fs.readFileSync(f,'latin1');return s.includes(AUTHKEY)||s.includes(encodeURIComponent(AUTHKEY));}catch{return false;}});
  check('authkey in no file of the profile (history, settings, log, Chromium storage)',leaks.length===0,leaks.map(f=>path.relative(profile,f)));
  check('app.log exists and masks the key',fs.existsSync(path.join(profile,'app.log')));
  check('no request to the real HoYoverse hosts',blocked.length===0,blocked);
  check('no console errors',errors.length===0,errors);
  console.log('PASS: ui — '+checks.length+' checks: '+checks.join('; '));
  clearTimeout(timer);cleanup();app.exit(0);
 }catch(e){console.error(e);clearTimeout(timer);cleanup();app.exit(1);}
});
