/* Probability model of HSR warps: no DOM, no fs; node and renderer.
   Official numbers (shown in the game's banner details): 5★ base 0.6% (characters, standard) / 0.8% (light cones),
   consolidated 1.6% / 1.87%, hard pity 90 / 80, featured 5★ 50% / 75%, 4★ consolidated 13% / 14.8%.
   The soft pity is NOT published: the community estimate is used — from pull 74 (characters) / 66 (light cones) the
   5★ chance grows by 6 / 7 percentage points per pull. It reproduces the official consolidated rates
   (1.605% and 1.872%), but it is an estimate, and every text that relies on it says so.
   Everything here is cheap: distributions are exact (≤ 90 values), the percentile is a seeded Monte Carlo of
   20 000 virtual players (well under 100 ms), the planner is an exact dynamic programme. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WarpsModel=factory();})(globalThis,function(){
 'use strict';
 const MODELS={
  character:{key:'character',base5:0.006,soft5:74,step5:0.06,hard5:90,official5:0.016,official4:0.13,title:'баннер персонажей'},
  lightcone:{key:'lightcone',base5:0.008,soft5:66,step5:0.07,hard5:80,official5:0.0187,official4:0.148,title:'баннер конусов'},
  // Departure: 5★ guaranteed within 50 pulls; its soft pity is unknown, so it never enters the luck comparison.
  departure:{key:'departure',base5:0.006,soft5:null,step5:0,hard5:50,official5:null,official4:0.13,title:'новичковый баннер'}};
 const SOURCE_NOTE='Мягкий гарант (рост шанса после 73-го прыжка у персонажей и 65-го у конусов) — оценка сообщества игроков: HoYoverse его не публикует. Базовые шансы, жёсткий гарант 90/80 и 50/50, 75/25 — официальные.';
 const cache=new Map();
 // Chance of a 5★ on the n-th pull since the last one (n = 1..hard).
 function rate5(m,n){if(n>=m.hard5)return 1;if(m.soft5&&n>=m.soft5)return Math.min(1,m.base5+m.step5*(n-m.soft5+1));return m.base5;}
 // pmf[n] = P(next 5★ exactly on pull n | pity 0); cdf[n] = P(≤ n). Index 0 unused.
 function dist(key){
  if(cache.has(key))return cache.get(key);
  const m=MODELS[key];if(!m)throw Error('Unknown model '+key);
  const pmf=[0],cdf=[0];let alive=1;
  for(let n=1;n<=m.hard5;n++){const q=rate5(m,n);pmf.push(alive*q);alive*=1-q;cdf.push(1-alive);}
  cdf[m.hard5]=1;
  const mean=pmf.reduce((s,p,n)=>s+p*n,0);
  const d={key,model:m,pmf,cdf,mean,sd:Math.sqrt(pmf.reduce((s,p,n)=>s+p*(n-mean)**2,0)),avg4:1/m.official4};
  cache.set(key,d);return d;
 }
 // Seeded PRNG (mulberry32): the same history always gives the same percentile.
 function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 function draw(d,u){let lo=1,hi=d.model.hard5;while(lo<hi){const mid=(lo+hi)>>1;if(d.cdf[mid]>=u)hi=mid;else lo=mid+1;}return lo;}
 // luck({pities:{character:[..], lightcone:[..]}, fifty:{'0.5':{won,played}, '0.75':{won,played}}, players, seed})
 // -> {pity:{observed, expected, count, luckierThan (0..1), histogram}, fifty:{won, played, expected, luckierThan}, note}
 // luckierThan = share of simulated players who did worse (+ half of the ties): «ты везучее X% игроков».
 function luck({pities={},fifty={},players=20000,seed=20240426}={}){
  const groups=Object.entries(pities).filter(([k,list])=>MODELS[k]&&k!=='departure'&&Array.isArray(list)&&list.length).map(([k,list])=>({d:dist(k),list:list.map(Number).filter(Number.isFinite)}));
  const count=groups.reduce((s,g)=>s+g.list.length,0);
  const sum=groups.reduce((s,g)=>s+g.list.reduce((a,b)=>a+b,0),0);
  const out={note:SOURCE_NOTE,players};
  const random=rng(seed);
  if(count){
   const observed=sum/count,expected=groups.reduce((s,g)=>s+g.d.mean*g.list.length,0)/count;
   let worse=0,ties=0;const bins=new Array(91).fill(0);
   for(let p=0;p<players;p++){
    let s=0;for(const g of groups)for(let i=0;i<g.list.length;i++)s+=draw(g.d,random());
    const mean=s/count;
    if(mean>observed+1e-9)worse++;else if(Math.abs(mean-observed)<=1e-9)ties++;
    bins[Math.min(90,Math.max(0,Math.round(mean)))]++;
   }
   out.pity={observed,expected,count,luckierThan:(worse+ties/2)/players,histogram:bins.map(n=>n/players)};
  }
  const rates=Object.entries(fifty).map(([r,v])=>({rate:Number(r),won:Number(v?.won)||0,played:Number(v?.played)||0})).filter(x=>x.played>0&&x.rate>0&&x.rate<1);
  const played=rates.reduce((s,x)=>s+x.played,0);
  if(played){
   const won=rates.reduce((s,x)=>s+x.won,0),expected=rates.reduce((s,x)=>s+x.rate*x.played,0);
   let worse=0,ties=0;
   for(let p=0;p<players;p++){let w=0;for(const x of rates)for(let i=0;i<x.played;i++)if(random()<x.rate)w++;if(w<won)worse++;else if(w===won)ties++;}
   out.fifty={won,played,expected,rate:won/played,expectedRate:expected/played,luckierThan:(worse+ties/2)/players};
  }
  return out;
 }
 // Exact distribution of the number of pulls needed to get `copies` featured 5★ on one pity pool.
 // State: pity (pulls since the last 5★), guarantee, copies still missing. guarantee null = unknown: the caller
 // asks twice (with and without). Returns {pmf, cdf, worst, mean, median, p90}; pmf[t] = P(goal reached on pull t).
 function need({model='character',rate=0.5,pity=0,guarantee=false,copies=1}={}){
  const d=dist(model),m=d.model,H=m.hard5,k=Math.max(0,Math.min(H-1,Math.floor(Number(pity)||0))),c0=Math.max(1,Math.min(10,Math.floor(Number(copies)||1)));
  const worst=(H-k)+(guarantee?0:H)+(c0-1)*2*H;
  // cur[c][g][j]: probability of having c copies missing, guarantee g, pity j, before the next pull.
  let cur=Array.from({length:c0+1},()=>[new Float64Array(H),new Float64Array(H)]);
  cur[c0][guarantee?1:0][k]=1;
  const pmf=[0],cdf=[0];let done=0;
  for(let t=1;t<=worst;t++){
   const next=Array.from({length:c0+1},()=>[new Float64Array(H),new Float64Array(H)]);let hit=0;
   for(let c=1;c<=c0;c++)for(let g=0;g<2;g++){const row=cur[c][g];for(let j=0;j<H;j++){const p=row[j];if(!p)continue;
    const q=rate5(m,j+1),miss=p*(1-q),five=p*q;
    if(miss&&j+1<H)next[c][g][j+1]+=miss;
    if(five){
     const win=g?five:five*rate,lose=five-win;
     if(win){if(c-1===0)hit+=win;else next[c-1][0][0]+=win;}
     if(lose)next[c][1][0]+=lose;
    }}}
   done+=hit;pmf.push(hit);cdf.push(Math.min(1,done));cur=next;
   if(done>1-1e-12){cdf[t]=1;break;}
  }
  const mean=pmf.reduce((s,p,t)=>s+p*t,0),q=x=>cdf.findIndex(v=>v>=x-1e-12);
  return {pmf,cdf,worst,mean,median:q(0.5),p90:q(0.9),copies:c0,pity:k,guarantee:!!guarantee,model,rate};
 }
 // P(goal reached within `budget` pulls) for one or more goals done one after another (character first, then cone):
 // the pull counts of different pools are independent, so the total is their convolution.
 function chance(goals,budget){
  const list=(Array.isArray(goals)?goals:[goals]).filter(Boolean);if(!list.length)return null;
  let pmf=[1];
  for(const g of list){const out=new Array(pmf.length+g.pmf.length-1).fill(0);for(let i=0;i<pmf.length;i++){if(!pmf[i])continue;for(let j=1;j<g.pmf.length;j++)if(g.pmf[j])out[i+j]+=pmf[i]*g.pmf[j];}pmf=out;}
  const b=Math.max(0,Math.floor(Number(budget)||0));let s=0;for(let t=0;t<=Math.min(b,pmf.length-1);t++)s+=pmf[t];
  const cdf=[];let acc=0;for(const p of pmf){acc+=p;cdf.push(acc);}
  const q=x=>cdf.findIndex(v=>v>=x-1e-12);
  // The worst case is the sum of the exact worst cases (the pmf tail below 1e-12 is cut off).
  const worst=list.reduce((w,g)=>w+(g.worst||g.pmf.length-1),0);
  return {chance:b>=worst?1:Math.min(1,s),worst,mean:pmf.reduce((a,p,t)=>a+p*t,0),median:q(0.5),p90:q(0.9),cdf};
 }
 // Pulls available: jade / 160 (whole pulls) + special passes (event banners) + extra pulls typed by hand.
 function budget({jade=0,passes=0,extra=0}={}){const j=Math.max(0,Math.floor(Number(jade)||0)),p=Math.max(0,Math.floor(Number(passes)||0)),e=Math.max(0,Math.floor(Number(extra)||0));return {pulls:Math.floor(j/160)+p+e,fromJade:Math.floor(j/160),jadeLeft:j%160,passes:p,extra:e};}
 return {MODELS,SOURCE_NOTE,JADE_PER_PULL:160,dist,rate5,luck,need,chance,budget,rng};
});
