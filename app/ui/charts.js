/* Small hand-made SVG charts (no library): the 5★ timeline with portraits as points, the luck histogram and the
   planner's chance curve. Thin marks, recessive grid, every mark has a hover tooltip (data-tip, ui.js). */
(function(){
 const V=window.View,esc=V.esc;
 const MONTHS=['янв','февр','март','апр','май','июнь','июль','авг','сент','окт','нояб','дек'];
 const OUT={won:{c:'#5FD39A',t:'выигрыш'},lost:{c:'#FF6F7F',t:'проигрыш'},guaranteed:{c:'#E8B04A',t:'по гаранту'},uncertain:{c:'#A3AACB',t:'не ясно'},none:{c:'#DCE2FF',t:'стандартный / без 50/50'}};
 let uid=0;
 // points: [{id, at, pity, exact, name, art, outcome, bannerTitle, time}]
 function timeline(points,{width=1400,height=380}={}){
  if(!points.length)return '<p class="muted">5★ в истории пока нет.</p>';
  const pad={l:56,r:28,t:22,b:44},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const t0=Math.min(...points.map(p=>p.at)),t1=Math.max(...points.map(p=>p.at)),span=Math.max(86400000,t1-t0);
  const x=t=>pad.l+18+(t-t0)/span*(w-36),y=p=>pad.t+h-(Math.min(90,p)/90)*h;
  const id='tl'+(++uid);let g='';
  for(const v of [0,30,60,90])g+=`<line x1="${pad.l}" x2="${pad.l+w}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l-12}" y="${y(v)+5}" class="axis" text-anchor="end">${v}</text>`;
  g+=`<rect x="${pad.l}" y="${y(90)}" width="${w}" height="${y(74)-y(90)}" class="band"/>`;
  // month ticks
  const d=new Date(t0);d.setUTCDate(1);d.setUTCHours(0,0,0,0);
  for(let m=new Date(d);m.getTime()<=t1;m.setUTCMonth(m.getUTCMonth()+1)){const tx=x(m.getTime());if(tx<pad.l||tx>pad.l+w)continue;g+=`<line x1="${tx}" x2="${tx}" y1="${pad.t+h}" y2="${pad.t+h+6}" class="tick"/><text x="${tx}" y="${pad.t+h+26}" class="axis" text-anchor="middle">${MONTHS[m.getUTCMonth()]}${m.getUTCMonth()===0?' '+m.getUTCFullYear():''}</text>`;}
  g+=`<text x="${pad.l-44}" y="${pad.t+h/2}" class="axis" transform="rotate(-90 ${pad.l-44} ${pad.t+h/2})" text-anchor="middle">прыжков до 5★</text>`;
  let marks='';const r=17;
  for(const p of points.slice().sort((a,b)=>a.at-b.at)){
   const o=OUT[p.outcome]||OUT.none,cx=x(p.at),cy=y(p.pity),cid=id+'c'+p.id;
   const tipText=`<b>${esc(p.name)}</b><br>${esc(p.bannerTitle)} · ${esc(V.day(p.time,true))}<br>${p.exact===false?'не меньше ':''}${p.pity} ${esc(V.pulls(p.pity).split(' ')[1])} · ${esc(p.outcomeText||o.t)}<br><i>нажми — откроется в таблице</i>`;
   marks+=`<g class="pt" data-act="goto" data-id="${esc(p.id)}" data-tip="${esc(tipText)}"><circle cx="${cx}" cy="${cy}" r="${r+7}" class="hit"/>
    <clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r+3}" fill="#0b0f1d" stroke="${o.c}" stroke-width="3"/>
    ${p.art?`<image href="${esc(p.art)}" x="${cx-r*1.15}" y="${cy-r*0.9}" width="${r*2.3}" height="${r*3.1}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${cid})"/>`:`<text x="${cx}" y="${cy+6}" text-anchor="middle" class="pt-ph">${esc(String(p.name||'?')[0])}</text>`}</g>`;
  }
  const legend=Object.entries(OUT).map(([k,o])=>`<span class="lg"><i style="border-color:${o.c}"></i>${esc(o.t)}</span>`).join('')+'<span class="lg"><i class="band"></i>мягкий гарант персонажей (≈ 74–90, оценка)</span>';
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" class="svg-chart" role="img" aria-label="5★ по времени: на каком прыжке выпала каждая">${g}${marks}</svg><div class="legend">${legend}</div></div>`;
 }
 // Histogram of the simulated players' average pity, with the user's value and the expected one.
 function histogram(bins,{observed,expected,width=900,height=300}={}){
  const lo=Math.max(0,Math.floor(Math.min(observed,expected)-25)),hi=Math.min(90,Math.ceil(Math.max(observed,expected)+20));
  const pad={l:46,r:20,t:34,b:42},w=width-pad.l-pad.r,h=height-pad.t-pad.b,n=hi-lo+1,bw=w/n;
  const max=Math.max(...bins.slice(lo,hi+1),0.0001),x=v=>pad.l+(v-lo)*bw,y=v=>pad.t+h-v/max*h;
  let g='';for(const f of [0.5,1])g+=`<line x1="${pad.l}" x2="${pad.l+w}" y1="${y(max*f)}" y2="${y(max*f)}" class="grid"/>`;
  for(let v=lo;v<=hi;v++){const p=bins[v]||0,bx=x(v)+1,bh=Math.max(0,pad.t+h-y(p)),better=v>observed+0.5;
   g+=`<g data-tip="${esc(`У ${(p*100).toFixed(1).replace('.',',')}% игроков в среднем ${v} ${V.pulls(v).split(' ')[1]} на 5★${better?' — им повезло меньше, чем тебе':''}`)}"><rect x="${x(v)}" y="${pad.t}" width="${bw}" height="${h}" class="hit"/><rect x="${bx}" y="${y(p)}" width="${Math.max(1,bw-2)}" height="${bh}" rx="2" class="${better?'bar worse':'bar'}"/></g>`;}
  for(let v=Math.ceil(lo/10)*10;v<=hi;v+=10)g+=`<text x="${x(v)+bw/2}" y="${pad.t+h+24}" class="axis" text-anchor="middle">${v}</text>`;
  const mark=(v,label,cls)=>`<line x1="${x(v)+bw/2}" x2="${x(v)+bw/2}" y1="${pad.t-8}" y2="${pad.t+h}" class="${cls}"/><text x="${x(v)+bw/2}" y="${pad.t-14}" class="${cls}-t" text-anchor="middle">${esc(label)}</text>`;
  g+=mark(expected,'в среднем '+String(expected.toFixed(1)).replace('.',','),'mk-exp')+mark(observed,'ты '+String(observed.toFixed(1)).replace('.',','),'mk-you');
  return `<svg viewBox="0 0 ${width} ${height}" class="svg-chart" role="img" aria-label="Распределение средней крутки до 5★ у смоделированных игроков">${g}<text x="${pad.l+w/2}" y="${height-4}" class="axis" text-anchor="middle">средняя крутка до 5★ у игрока с таким же числом 5★</text></svg>`;
 }
 // Chance to reach the goal within n pulls, with the budget marker and a hover readout every pull.
 function chanceCurve(cdf,{budget=0,worst=0,width=640,height=300}={}){
  const N=Math.max(worst,budget,10),pad={l:56,r:24,t:24,b:44},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const x=n=>pad.l+n/N*w,y=p=>pad.t+h-p*h,at=n=>n<=0?0:n>=cdf.length?1:cdf[n];
  let g='';
  for(const p of [0,0.25,0.5,0.75,1])g+=`<line x1="${pad.l}" x2="${pad.l+w}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${pad.l-10}" y="${y(p)+5}" class="axis" text-anchor="end">${p*100}%</text>`;
  const step=N>400?50:N>200?25:10;for(let n=0;n<=N;n+=step)g+=`<text x="${x(n)}" y="${pad.t+h+24}" class="axis" text-anchor="middle">${n}</text>`;
  let d=`M${x(0)} ${y(0)}`;for(let n=1;n<=N;n++)d+=` L${x(n).toFixed(1)} ${y(at(n)).toFixed(1)}`;
  g+=`<path d="${d} L${x(N)} ${y(0)} Z" class="area"/><path d="${d}" class="line"/>`;
  const b=Math.min(budget,N),pb=at(b);
  g+=`<line x1="${x(b)}" x2="${x(b)}" y1="${pad.t}" y2="${pad.t+h}" class="mk-you"/><circle cx="${x(b)}" cy="${y(pb)}" r="7" class="dot"/><text x="${x(b)+10}" y="${Math.max(pad.t+14,y(pb)-12)}" class="mk-you-t">${esc('твой запас: '+b+' · '+Math.round(pb*100)+'%')}</text>`;
  const cw=w/N;let hits='';for(let n=0;n<=N;n++)hits+=`<rect x="${x(n)-cw/2}" y="${pad.t}" width="${Math.max(cw,1)}" height="${h}" class="hit" data-tip="${esc(`За ${V.pulls(n)} (${V.num(n*160)} яшмы) — шанс ${(at(n)*100).toFixed(1).replace('.',',')}%`)}"/>`;
  return `<svg viewBox="0 0 ${width} ${height}" class="svg-chart" role="img" aria-label="Шанс получить цель в зависимости от числа прыжков">${g}${hits}<text x="${pad.l+w/2}" y="${height-4}" class="axis" text-anchor="middle">прыжков</text></svg>`;
 }
 window.Charts={timeline,histogram,chanceCurve,OUT};
})();
