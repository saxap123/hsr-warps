// Art of pulled items from the StarRailRes repository (app/art.cjs) against a fake raw.githubusercontent.com:
// the exact path by game id (character / light cone preview), PNG check, cache in index.json, nothing requested again
// for a cached id, a 404 (an id the repository does not have yet) is a miss retried once a day, a network error is
// not recorded and stops the run, one request at a time with a pause, ids that are not game ids are ignored.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Art=require('../app/art.cjs');
const temps=[],tempDir=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'hsrw-art-'));temps.push(d);return d;};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
function repo({has=['1205','1511','23000'],down=()=>false,html=[]}={}){
 const log=[];
 const fetch=async url=>{
  const u=new URL(url);log.push(u.host+u.pathname);
  if(down(u))throw new TypeError('fetch failed');
  const m=/^\/Mar-7th\/StarRailRes\/master\/image\/(character|light_cone)_preview\/(\d+)\.png$/.exec(u.pathname);
  const ok=b=>({ok:true,status:200,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)});
  if(u.host==='raw.githubusercontent.com'&&m&&has.includes(m[2]))return ok(html.includes(m[2])?Buffer.from('<html>rate limited</html>'):PNG);
  return {ok:false,status:404,arrayBuffer:async()=>new ArrayBuffer(0)};
 };
 return {fetch,log};
}
function clock(){let t=Date.UTC(2026,10,24);const sleeps=[];return {now:()=>t,sleep:async ms=>{sleeps.push(ms);t+=ms;},sleeps,advance:ms=>{t+=ms;}};}
async function main(){
 assert.equal(Art.remotePath('1511','character'),'image/character_preview/1511.png');assert.equal(Art.remotePath('23000','lightcone'),'image/light_cone_preview/23000.png');
 assert.equal(Art.kindOf('1205'),'character');assert.equal(Art.kindOf('23000'),'lightcone');assert.equal(Art.kindOf('12'),null);
 assert.equal(Art.BASE,'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master');
 // Download by id, exact paths, cache.
 {
  const dir=tempDir(),r=repo(),c=clock(),art=Art.createArtResolver({dir,fetch:r.fetch,sleep:c.sleep,now:c.now});
  const res=await art.resolve(['1205','23000','1511','1205','abc','12']);
  assert.deepEqual(res.resolved,['1205','23000','1511']);assert.deepEqual(res.missed,[]);
  assert.deepEqual(r.log,['raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/character_preview/1205.png','raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/light_cone_preview/23000.png','raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/character_preview/1511.png'],'one request per id, by id, nothing else');
  assert.deepEqual(c.sleeps,[150,150],'one at a time with a pause');
  assert.deepEqual(res.urls,{'1205':'app://art/1205.png','23000':'app://art/23000.png','1511':'app://art/1511.png'});
  assert(fs.readFileSync(path.join(dir,'1511.png')).equals(PNG));
  const n=r.log.length;const again=await art.resolve(['1205','23000']);assert.equal(r.log.length,n,'cached: no request');assert.deepEqual(again.resolved,[]);
  assert.deepEqual(Object.keys(Art.createArtResolver({dir,fetch:r.fetch}).urls()).sort(),['1205','1511','23000'],'index survives a restart');
 }
 // Not in the repository yet: initials (no url), retried once a day, nothing guessed.
 {
  const dir=tempDir(),r=repo({has:[]}),c=clock(),art=Art.createArtResolver({dir,fetch:r.fetch,sleep:c.sleep,now:c.now});
  const res=await art.resolve(['1599']);assert.deepEqual(res.missed,['1599']);assert.deepEqual(res.urls,{});assert.equal(r.log.length,1);
  await art.resolve(['1599']);assert.equal(r.log.length,1,'not again the same day');
  c.advance(25*3600000);r.log.length=0;
  const later=repo({has:['1599']});const art2=Art.createArtResolver({dir,fetch:later.fetch,sleep:c.sleep,now:c.now});
  const res2=await art2.resolve(['1599']);assert.deepEqual(res2.resolved,['1599'],'found the next day once the repository has it');
 }
 // Network error: not recorded, the run stops, the next run tries again. Not a PNG: a miss.
 {
  const dir=tempDir(),c=clock();let off=true;
  const r=repo({down:()=>off});const art=Art.createArtResolver({dir,fetch:r.fetch,sleep:c.sleep,now:c.now});
  const res=await art.resolve(['1205','23000']);assert.deepEqual(res.failed,['1205','23000']);assert.equal(r.log.length,1,'stops after the first failure');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8')).misses,{},'a network error is not a miss');
  off=false;const res2=await art.resolve(['1205','23000']);assert.deepEqual(res2.resolved,['1205','23000']);
  const bad=repo({html:['1205']});const res3=await Art.createArtResolver({dir:tempDir(),fetch:bad.fetch,sleep:c.sleep,now:c.now}).resolve(['1205']);
  assert.deepEqual(res3.missed,['1205'],'a page instead of a PNG is refused');
 }
 console.log('PASS: art — StarRailRes previews by game id (exact paths), PNG check, cache and index, daily retry of ids the repository lacks, network errors not recorded, one request at a time');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const d of temps)fs.rmSync(d,{recursive:true,force:true});});
