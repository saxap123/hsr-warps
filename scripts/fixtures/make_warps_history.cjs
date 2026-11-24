// Synthetic warp history for «Крутки» (deterministic). Items look like the official getGachaLog answer: all values
// are strings, 19-digit ids above 2^53 (adjacent ids collide as Numbers), ten-pulls share one time.
// Story, oldest first (pity = pulls the 5★ took within its banner type):
//  departure  Gepard at 43, +7 pulls (50, banner finished)
//  standard   Bronya at 85
//  character  Himeko at 76 on 2001: lost 50/50
//  light cone Sleep Like the Dead at 66 on 3001: lost 75/25
//  character  Feixiao at 80 on 2002: guaranteed (guarantee carried over to the next banner), Feixiao at 30: won
//  light cone I Shall Be My Own Sword at 70 on 3002: guaranteed, again at 10: won
//  standard   Night on the Milky Way at 90
//  character  Blade at 74 on 2003 (Celestial Invitation: ambiguous), Welt at 90: lost, so Blade was a win
//  collab     Clara at 50 on 2101: lost, +40 pulls: next collab 5★ is guaranteed (counter independent from 11)
//  character  Seele at 12 on 2004: ambiguous hero under a guarantee, so guaranteed
//  light cone +5 pulls; standard +12 pulls
//  character  Fu Xuan at 65 on 2005 without guarantee and nothing after: uncertain; +23 pulls
// node scripts/fixtures/make_warps_history.cjs <out.json>  writes a store-format history (<uid>.json for createStore).
const fs=require('node:fs');
const UID='800123456',AUTHKEY='Ab+cd/EF==x9';
const NAMES={
 '1003':['Himeko','Character'],'1004':['Welt','Character'],'1101':['Bronya','Character'],'1104':['Gepard','Character'],'1107':['Clara','Character'],
 '1102':['Seele','Character'],'1205':['Blade','Character'],'1208':['Fu Xuan','Character'],'1220':['Feixiao','Character'],
 '1001':['March 7th','Character'],'1002':['Dan Heng','Character'],'1103':['Serval','Character'],'1105':['Natasha','Character'],'1106':['Pela','Character'],
 '21000':['Post-Op Conversation','Light Cone'],'21001':['Good Night and Sleep Well','Light Cone'],'21002':['Day One of My New Life','Light Cone'],
 '20000':['Arrows','Light Cone'],'20001':['Cornucopia','Light Cone'],
 '23000':['Night on the Milky Way','Light Cone'],'23012':['Sleep Like the Dead','Light Cone'],'23014':['I Shall Be My Own Sword','Light Cone']};
const FOURS=['1001','1002','1103','1105','1106','21000','21001','21002'],THREES=['20000','20001'];
const SEGMENTS=[
 ['2','4001',[['1104',43]],7],
 ['1','1001',[['1101',85]],0],
 ['11','2001',[['1003',76]],0],
 ['12','3001',[['23012',66]],0],
 ['11','2002',[['1220',80],['1220',30]],0],
 ['12','3002',[['23014',70],['23014',10]],0],
 ['1','1001',[['23000',90]],0],
 ['11','2003',[['1205',74],['1004',90]],0],
 ['21','2101',[['1107',50]],40],
 ['11','2004',[['1102',12]],0],
 ['12','3002',[],5],
 ['1','1001',[],12],
 ['11','2005',[['1208',65]],23]];
// {type: [items oldest first]} as the server would return them (before sorting newest first).
function makeWarpsItems(){
 const byType={'11':[],'12':[],'1':[],'2':[],'21':[],'22':[]},since4={};
 let seq=0n,clock=Date.UTC(2026,4,1,10,0,0),rnd=12345;
 const base=1714500000000000000n,lcg=()=>(rnd=(rnd*1103515245+12345)%2147483648)/2147483648;
 for(const [type,gacha,fives,tail] of SEGMENTS){
  let n=0;
  const push=(itemId,rank)=>{const [name,kind]=NAMES[itemId];byType[type].push({uid:UID,gacha_id:gacha,gacha_type:type,item_id:itemId,count:'1',time:new Date(clock+Math.floor(n/10)*60000).toISOString().slice(0,19).replace('T',' '),name,lang:'en-us',item_type:kind,rank_type:String(rank),id:(base+seq).toString()});seq+=1n;n++;};
  const fill=()=>{const c=since4[type]||0,four=c>=9||lcg()<0.06;since4[type]=four?0:c+1;const pool=four?FOURS:THREES;push(pool[Math.floor(lcg()*pool.length)],four?4:3);};
  for(const [itemId,pity] of fives){for(let i=1;i<pity;i++)fill();since4[type]=(since4[type]||0)+1;push(itemId,5);}
  for(let i=0;i<tail;i++)fill();
  clock+=3*86400000;seq+=1000n;
 }
 return byType;
}
// Store-format history (schema 1), as createStore().save would write it.
function makeWarpsHistory(){
 const byType=makeWarpsItems();
 return {schema:1,uid:UID,region:'global',serverRegion:'prod_official_eur',timeZone:1,lang:'en-us',updatedAt:'2026-06-16T09:00:00.000Z',
  byType:Object.fromEntries(Object.entries(byType).map(([t,list])=>[t,list.map(({count,...it})=>it)]))};
}
module.exports={makeWarpsItems,makeWarpsHistory,UID,AUTHKEY};
if(require.main===module){
 const out=process.argv[2];
 if(!out){console.error('usage: node scripts/fixtures/make_warps_history.cjs <out.json>');process.exit(2);}
 fs.writeFileSync(out,JSON.stringify(makeWarpsHistory()),'utf8');
 console.log('wrote',out);
}
