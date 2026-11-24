/* HSR Warp Tracker core (from HSR Atelier «Крутки»): pure logic, no DOM, no fs, no network; node and renderer.
   Link parsing (only the two official API hosts receive the authkey), link extraction from the game web cache,
   banner types (known ones + types read from the official history page), history merge (dedupe by 19-digit string id).
   Ids exceed 2^53: they are compared as digit strings (length, then lexicographic) and never go through Number.
   Statistics live in analysis.js, the probability model in model.js. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WarpsCore=factory();})(globalThis,function(){
 'use strict';
 const API_HOSTS={global:'public-operation-hkrpg-sg.hoyoverse.com',cn:'public-operation-hkrpg.mihoyo.com'};
 const API_PATH='/common/hkrpg_gacha_record/api/getGachaLog',LD_PATH='/common/hkrpg_gacha_record/api/getLdGachaLog';
 // Default fetch order. Not a closed list: types read from the official history page (game cache), types already in
 // the stored history and imported types are added (resolveTypes); collaboration types use getLdGachaLog.
 const TYPE_ORDER=['11','12','1','2','21','22'],LD_TYPES=['21','22'];
 // Real cached calls also page upward with begin_id; all paging is set by the fetcher.
 const PAGING=new Set(['gacha_type','page','size','end_id','begin_id']);
 const GACHA_APP='webview_gacha';
 // Printable ASCII without " ' < > \ ^ ` { | } and without spaces: works on a latin1 view of a binary cache file.
 const URL_CLASS='[\\x21\\x23-\\x26\\x28-\\x3b\\x3d\\x3f-\\x5b\\x5d\\x5f\\x61-\\x7a\\x7e]',URL_SOURCE='https?:\\/\\/'+URL_CLASS+'+';
 // Rules per pity pool. model: which probability model applies (model.js); rate: chance that a 5★ is the featured one.
 const KNOWN_TYPES={
  '11':{title:'Ивент: персонажи',short:'Персонажи',kind:'character',maxPity:90,event:true,rate:0.5,model:'character',official:'UP_ROLE'},
  '12':{title:'Ивент: конусы',short:'Конусы',kind:'lightcone',maxPity:80,event:true,rate:0.75,model:'lightcone',official:'UP_WEAPON'},
  '21':{title:'Коллаборация: персонажи',short:'Коллаб: персонажи',kind:'character',maxPity:90,event:true,rate:0.5,model:'character',ld:true,official:'CO_BRANDED_ROLE'},
  '22':{title:'Коллаборация: конусы',short:'Коллаб: конусы',kind:'lightcone',maxPity:80,event:true,rate:0.75,model:'lightcone',ld:true,official:'CO_BRANDED_WEAPON'},
  '1':{title:'Стандартный',short:'Стандартный',kind:null,maxPity:90,event:false,rate:null,model:'character',official:'STANDARD'},
  '2':{title:'Новичковый',short:'Новичковый',kind:null,maxPity:50,event:false,rate:null,model:'departure',official:'FRESH'}};
 const TYPE_TITLES=Object.fromEntries(Object.entries(KNOWN_TYPES).map(([t,d])=>[t,d.title]));
 // A type the app does not know: rules from its official constant name when the history page gave one
 // (…ROLE = like the character banner, …WEAPON = like the light cone banner, CO_BRANDED… = getLdGachaLog), else none.
 function typeInfo(type,discovered){
  const t=typeKey(type);if(KNOWN_TYPES[t])return {type:t,known:true,...KNOWN_TYPES[t]};
  const name=str(discovered?.[t]?.name||discovered?.[t]||'').toUpperCase(),ld=/CO_?BRANDED/.test(name);
  const base={type:t,known:false,official:name||null,ld};
  if(/ROLE|AVATAR|CHARACTER/.test(name))return {...base,title:'Новый баннер персонажей (тип '+t+')',short:'Тип '+t,kind:'character',maxPity:90,event:true,rate:0.5,model:'character',guess:true};
  if(/WEAPON|EQUIP|CONE/.test(name))return {...base,title:'Новый баннер конусов (тип '+t+')',short:'Тип '+t,kind:'lightcone',maxPity:80,event:true,rate:0.75,model:'lightcone',guess:true};
  return {...base,title:'Другой баннер (тип '+t+')',short:'Тип '+t,kind:null,maxPity:null,event:false,rate:null,model:null};
 }
 // Types to fetch, in order: the default list, then new ones (by number). discovered: {type:{name, ld}} from the history page.
 function resolveTypes({discovered=null,stored=null,extra=[]}={}){
  const set=new Set(TYPE_ORDER);
  for(const t of [...Object.keys(discovered||{}),...Object.keys(stored?.byType||{}),...extra].map(typeKey))if(t)set.add(t);
  const types=[...set].sort((a,b)=>{const i=TYPE_ORDER.indexOf(a),j=TYPE_ORDER.indexOf(b);return (i<0?99:i)-(j<0?99:j)||Number(a)-Number(b);});
  const ld=types.filter(t=>LD_TYPES.includes(t)||discovered?.[t]?.ld===true||typeInfo(t,discovered).ld);
  return {types,ld};
 }
 // Off-banner 5★ pools. Standard seven: never featured on event banners, so pulling one there is a certain loss.
 const STANDARD_CHARACTERS=['1003','1004','1101','1104','1107','1209','1211'];
 // Celestial Invitation additions (3.2: Seele, Blade, Fu Xuan; 4.2: Silver Wolf, Yunli, Argenti): a pull can be the
 // featured hero of a rerun (win) or the chosen non-featured hero (loss), so it is ambiguous without a banner map.
 const INVITATION_EXTRA=['1102','1205','1208','1006','1221','1302'];
 const STANDARD_LIGHT_CONES=['23000','23002','23003','23004','23005','23012','23013'];
 const REASONS={
  empty:'Вставь ссылку на историю прыжков.',
  notUrl:'Это не похоже на ссылку: она должна начинаться с https://',
  foreign:'Это ссылка не на сервер HoYoverse. Подходит только ссылка на историю прыжков из игры — на другие сайты ключ не отправляем.',
  notHsr:'Это ссылка не от Honkai: Star Rail (возможно, от другой игры HoYoverse).',
  notHistory:'Это ссылка на другую страницу игры (событие, новости), а нужна ссылка на историю прыжков.',
  noKey:'В ссылке нет ключа доступа (authkey). Открой в игре историю прыжков и возьми ссылку заново.',
  expired:'Ссылка устарела: открой в игре историю прыжков и повтори'};
 const MANUAL_STEPS=[
  'Запусти Honkai: Star Rail на этом компьютере и войди в аккаунт.',
  'В игре открой прыжки и нажми кнопку истории прыжков. Подожди, пока список загрузится.',
  'Вернись в приложение и снова запусти поиск ссылки.',
  'Если ссылка всё равно не находится, вставь её вручную в поле ниже. Её умеет доставать короткая команда для PowerShell с сайтов-трекеров круток (например, stardb.gg/warp). Перед запуском чужой команды PowerShell прочитай, что она делает: она только ищет ссылку в файлах игры.',
  'Ссылка работает примерно сутки. Не отправляй её другим людям: по ней видна твоя история прыжков.'];
 const TEXTS={
  tab:'Крутки',
  pastePlaceholder:'https://public-operation-hkrpg-sg.hoyoverse.com/…',
  pasteHint:'Вставь ссылку на историю прыжков. Приложение отправит её только на официальный сервер HoYoverse и сохранит историю у тебя на компьютере.',
  uncertainHint:'С версии 3.2 при проигрыше 50/50 могут выпасть и некоторые персонажи, у которых раньше были свои баннеры. Если такой персонаж выпал без гаранта, по одной истории не видно, был ли это его баннер (выигрыш) или проигрыш.',
  historyHint:'Сервер игры отдаёт историю прыжков только за ограниченный срок (сейчас — примерно последний год). Программа копит её у себя и ничего не удаляет, поэтому обновляй историю хотя бы раз в несколько месяцев.',
  empty:'Прыжков пока нет.',
  // The first line of the start screen, before the first search.
  startFirst:'Открой в игре Прыжки → История прыжков, потом нажми «Найти ссылку в файлах игры».',
  // A departure banner with all its pulls done: the card shows this instead of the pity counter and bar.
  finished:'Пройден',
  manualSteps:MANUAL_STEPS};
 const OUTCOME_TEXTS={won:'выигрыш',lost:'проигрыш',guaranteed:'по гаранту',uncertain:'не ясно: выигрыш или проигрыш'};

 const arr=v=>Array.isArray(v)?v:[];
 const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const str=v=>v===undefined||v===null?'':String(v);

 // Ids: digit strings without leading zeros. A Number above 2^53 has already lost digits, so it is refused.
 function idString(v){
  if(typeof v==='bigint')return v>=0n?v.toString():'';
  if(typeof v==='number')return Number.isSafeInteger(v)&&v>=0?String(v):'';
  const s=str(v).trim();if(!/^\d{1,40}$/.test(s))return '';
  return s.replace(/^0+(?=\d)/,'');
 }
 function compareId(a,b){
  const x=idString(a),y=idString(b);
  if(x&&y)return x.length!==y.length?(x.length<y.length?-1:1):x<y?-1:x>y?1:0;
  const p=str(a),q=str(b);return p<q?-1:p>q?1:0;
 }

 // ---------- links ----------
 function decode(s){try{return decodeURIComponent(s);}catch{return s;}}
 const strictEncode=v=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 // Query pairs read by hand: URLSearchParams would turn a literal '+' of the base64 authkey into a space.
 function queryPairs(href){
  const hashAt=href.indexOf('#'),main=hashAt<0?href:href.slice(0,hashAt),hash=hashAt<0?'':href.slice(hashAt+1),parts=[];
  const q=main.indexOf('?');if(q>=0)parts.push(main.slice(q+1));
  const hq=hash.indexOf('?');if(hq>=0)parts.push(hash.slice(hq+1));
  const pairs=[];
  for(const part of parts)for(const piece of part.split('&')){if(!piece)continue;const eq=piece.indexOf('=');pairs.push([decode(eq<0?piece:piece.slice(0,eq)),eq<0?'':decode(piece.slice(eq+1))]);}
  return pairs;
 }
 const cleanKey=v=>str(v).trim().replace(/[^A-Za-z0-9+/=_\-.%].*$/s,'');
 const fail=reason=>({ok:false,reason});
 function parseOne(candidate){
  let u;try{u=new URL(candidate);}catch{return fail(REASONS.notUrl);}
  if(u.protocol!=='https:'&&u.protocol!=='http:')return fail(REASONS.notUrl);
  if(u.username||u.password||(u.port&&u.port!=='443'))return fail(REASONS.foreign);
  const host=u.hostname.toLowerCase(),params={},order=[];
  for(const [k,v] of queryPairs(candidate))if(k&&k!=='__proto__'&&!has(params,k)){params[k]=v;order.push(k);}
  const biz=str(params.game_biz),appid=str(params.auth_appid);
  let region=Object.keys(API_HOSTS).find(r=>API_HOSTS[r]===host),source='api';
  // Other webviews of the game (events, version pages) carry their own authkey with their own auth_appid: it does not open the history.
  if(appid&&appid!==GACHA_APP)return fail(region||/(^|\.)(hoyoverse|mihoyo)\.com$/.test(host)?REASONS.notHistory:REASONS.foreign);
  if(region){if(biz&&!/^hkrpg_/i.test(biz))return fail(REASONS.notHsr);}
  else{
   // Web page of the history (gs.hoyoverse.com, webstatic.mihoyo.com …) carries the same authkey: rebuilt on the API host.
   if(!/(^|\.)(hoyoverse|mihoyo)\.com$/.test(host))return fail(REASONS.foreign);
   if(!/^hkrpg_/i.test(biz))return fail(REASONS.notHsr);
   if(appid!==GACHA_APP&&!/gacha/i.test(u.pathname))return fail(REASONS.notHistory);
   region=/^hkrpg_cn/i.test(biz)?'cn':'global';source='page';
  }
  const authkey=cleanKey(params.authkey);if(!authkey)return fail(REASONS.noKey);
  params.authkey=authkey;
  const fixed={game_biz:region==='cn'?'hkrpg_cn':'hkrpg_global'},defaults={authkey_ver:'1',sign_type:'2',auth_appid:GACHA_APP,lang:region==='cn'?'zh-cn':'en'};
  // Everything the game sent is kept except paging; game_biz goes last so the link never ends in punctuation of a value.
  const query=[],seen=new Set(['game_biz']);
  const add=(k,v)=>{seen.add(k);query.push(strictEncode(k)+'='+strictEncode(v));};
  for(const k of order){if(PAGING.has(k)||k==='game_biz')continue;add(k,k==='authkey'?authkey:params[k]);}
  for(const [k,v] of Object.entries(defaults))if(!seen.has(k))add(k,v);
  add('game_biz',fixed.game_biz);
  const ts=str(params.timestamp);
  return {ok:true,url:'https://'+API_HOSTS[region]+API_PATH+'?'+query.join('&'),host:API_HOSTS[region],region,params,source,timestamp:/^\d{1,13}$/.test(ts)?Number(ts):null};
 }
 // Punctuation that closes a sentence or brackets around a pasted link; a ')' or ']' that belongs to the link stays.
 function trimUrl(s){
  const count=(c)=>s.split(c).length-1;
  for(;;){const c=s.slice(-1);
   if(c===')'&&count('(')<count(')')||c===']'&&count('[')<count(']')||c&&'.,;!'.includes(c))s=s.slice(0,-1);else return s;}
 }
 // A console wraps a long link: a line made only of URL characters (not a new https://) continues the link above it.
 const URL_CHARS=new RegExp('^'+URL_CLASS+'+$');
 function joinWrapped(s){
  const lines=s.split(/\r?\n/);let out=lines[0],inUrl=/https?:\/\/\S*$/i.test(lines[0].trimEnd());
  for(let i=1;i<lines.length;i++){
   const line=lines[i].trim();
   if(inUrl&&line&&URL_CHARS.test(line)&&!/^https?:\/\//i.test(line)){out=out.trimEnd()+line;continue;}
   out+='\n'+lines[i];inUrl=/https?:\/\/\S*$/i.test(lines[i].trimEnd());
  }
  return out;
 }
 // Pasted text: the last valid link wins; wrapped lines are joined first, then the text is tried as it is.
 function parseLink(text){
  const s=str(text).trim();if(!s)return fail(REASONS.empty);
  const tryAll=t=>{let first=null;const found=t.match(new RegExp(URL_SOURCE,'gi'))||[];for(let i=found.length-1;i>=0;i--){const r=parseOne(trimUrl(found[i]));if(r.ok)return r;first=first||r;}return first;};
  const joined=joinWrapped(s);
  if(joined!==s){const r=tryAll(joined);if(r?.ok)return r;}
  return tryAll(s)||fail(REASONS.notUrl);
 }
 function latin1(input){
  if(typeof input==='string')return input;
  if(typeof Buffer!=='undefined'&&Buffer.isBuffer(input))return input.toString('latin1');
  const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
  if(!bytes)return '';
  let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return out;
 }
 // All valid history links of a cache file (Buffer, bytes or latin1 string), one per authkey, newest last:
 // by the link's timestamp when every link has one, otherwise by position in the file.
 function extractLinks(input){
  const text=latin1(input),re=new RegExp(URL_SOURCE,'gi'),byKey=new Map();let m;
  while((m=re.exec(text))){
   if(m[0].indexOf('authkey=')<0)continue;
   const r=parseOne(trimUrl(m[0]));if(!r.ok)continue;
   const key=r.region+'|'+r.params.authkey,prev=byKey.get(key);
   const timestamp=prev&&prev.timestamp!==null&&(r.timestamp===null||prev.timestamp>r.timestamp)?prev.timestamp:r.timestamp;
   byKey.delete(key);byKey.set(key,{...r,timestamp,position:m.index});
  }
  const list=[...byKey.values()];
  if(list.length&&list.every(x=>x.timestamp!==null))list.sort((a,b)=>a.timestamp-b.timestamp||a.position-b.position);
  else list.sort((a,b)=>a.position-b.position);
  return list;
 }
 function pageUrl(base,type,page,size,endId,ld){
  const t=str(type),url=(ld===undefined?LD_TYPES.includes(t)||typeInfo(t).ld:ld)?base.replace(API_PATH,LD_PATH):base;
  return url+'&gacha_type='+encodeURIComponent(t)+'&page='+page+'&size='+size+'&end_id='+encodeURIComponent(str(endId)||'0');
 }
 // For display: host and path only, the key is hidden.
 function maskUrl(url){try{const u=new URL(url);return u.origin+u.pathname+'?authkey=•••';}catch{return '';}}

 // ---------- history ----------
 function typeKey(t){return /^\d{1,4}$/.test(str(t))?str(Number(t)):'';}
 function normalizeItem(raw,type){
  if(!raw||typeof raw!=='object')return null;
  const id=idString(raw.id);if(!id)return null;
  return {id,uid:str(raw.uid),gacha_type:typeKey(raw.gacha_type)||typeKey(type),gacha_id:str(raw.gacha_id),item_id:str(raw.item_id),name:str(raw.name),item_type:str(raw.item_type),rank_type:str(raw.rank_type),time:str(raw.time),lang:str(raw.lang)};
 }
 function emptyHistory(uid){return {schema:1,uid:str(uid),region:'',serverRegion:'',timeZone:null,lang:'',updatedAt:'',byType:Object.fromEntries(TYPE_ORDER.map(t=>[t,[]]))};}
 const mismatch=(a,b)=>Object.assign(Error('В истории оказались данные разных аккаунтов (UID '+a+' и '+b+')'),{code:'UID_MISMATCH'});
 const META=['region','serverRegion','timeZone','lang','updatedAt'];
 // Accepts a fetch result ({uid, byType, …}), a stored history or a plain {type: items} map.
 function mergeHistory(stored,fetched){
  const base=stored&&typeof stored==='object'?stored:{};
  const src=fetched&&typeof fetched==='object'?(fetched.byType&&typeof fetched.byType==='object'?fetched:{byType:fetched}):{byType:{}};
  const out=emptyHistory(str(base.uid));
  for(const k of META)if(base[k]!==undefined&&base[k]!==null&&base[k]!=='')out[k]=base[k];
  let uid=out.uid;
  const own=v=>{const u=str(v);if(!u)return;if(!uid)uid=u;else if(u!==uid)throw mismatch(uid,u);};
  own(src.uid);
  const types=[...new Set([...TYPE_ORDER,...Object.keys(base.byType||{}),...Object.keys(src.byType||{})].map(typeKey).filter(Boolean))];
  const added={};let addedTotal=0;
  for(const t of types){
   const map=new Map();
   for(const raw of arr(base.byType?.[t])){const it=normalizeItem(raw,t);if(!it||map.has(it.id))continue;own(it.uid);map.set(it.id,it);}
   let n=0;
   for(const raw of arr(src.byType?.[t])){const it=normalizeItem(raw,t);if(!it)continue;own(it.uid);if(map.has(it.id))continue;map.set(it.id,it);n++;}
   out.byType[t]=[...map.values()].sort((a,b)=>compareId(a.id,b.id));
   if(n){added[t]=n;addedTotal+=n;}
  }
  for(const list of Object.values(out.byType))for(const it of list)if(!it.uid)it.uid=uid;
  out.uid=uid;
  for(const k of ['region','serverRegion','timeZone','lang'])if(src[k]!==undefined&&src[k]!==null&&src[k]!=='')out[k]=src[k];
  return {history:out,added,addedTotal};
 }
 function lastIds(history){const out={};for(const [t,list] of Object.entries(history?.byType||{})){let max='';for(const it of arr(list)){const id=idString(it?.id);if(id&&(!max||compareId(id,max)>0))max=id;}if(max)out[typeKey(t)||t]=max;}return out;}

 const plural=(n,forms)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?forms[2]:b===1?forms[0]:b>=2&&b<=4?forms[1]:forms[2];};
 return {API_HOSTS,API_PATH,LD_PATH,TYPE_ORDER,LD_TYPES,KNOWN_TYPES,TYPE_TITLES,STANDARD_CHARACTERS,INVITATION_EXTRA,STANDARD_LIGHT_CONES,
  REASONS,MANUAL_STEPS,TEXTS,typeInfo,resolveTypes,typeKey,
  parseLink,extractLinks,pageUrl,maskUrl,idString,compareId,normalizeItem,emptyHistory,mergeHistory,lastIds,plural};
});
