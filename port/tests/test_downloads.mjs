import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {gamePaths,loadHostedGameFiles,assetCacheName} from '../web/downloads.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function memoryCache(){
 const entries=new Map(),url=key=>key.url||String(key);
 return{entries,async open(name){assert.equal(name,assetCacheName);return{
  async match(key){return entries.get(url(key))?.clone();},
  async put(key,response){entries.set(url(key),new Response(await response.arrayBuffer()));},
  async delete(key){return entries.delete(url(key));},
  async keys(key){const path=new URL(url(key));return [...entries.keys()].filter(k=>{const u=new URL(k);return u.origin===path.origin&&u.pathname===path.pathname;}).map(k=>new Request(k));},
 };}};
}
async function scenario(mode){
 const payloads=gamePaths.map((_,i)=>Buffer.from(('Synthetic game payload '+i+'\n').repeat(200)));
 const specs=gamePaths.map((path,i)=>({path:path.slice(1),size:payloads[i].length,sha256:hash(payloads[i])}));
 const requests=[],progress=[],storage=memoryCache();
 const server=http.createServer((req,res)=>{
  requests.push(req.url);const pathname=new URL(req.url,'http://localhost').pathname,prefix='/orderup/';
  if(pathname===prefix+'game/manifest.json'){
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({files:mode==='invalid-manifest'?[]:specs}));return;
  }
  const index=gamePaths.indexOf('/'+pathname.slice(prefix.length));
  if(!pathname.startsWith(prefix)||index<0){res.writeHead(404);res.end();return;}
  if(mode==='missing'&&index===0){res.writeHead(404);res.end();return;}
  let data=payloads[index];
  if(index===0){
   if(mode==='truncated')data=data.subarray(0,data.length-1);
   if(mode==='too-large')data=Buffer.concat([data,Buffer.of(1)]);
   if(mode==='corrupt'){data=Buffer.from(data);data[0]^=255;}
  }
  const zipped=gzipSync(data);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',zipped.length);res.end(zipped);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const baseURL='http://127.0.0.1:'+server.address().port+'/orderup/';
 const load=async(cacheStorage=storage,base=baseURL)=>{
  requests.length=0;progress.length=0;
  const data=await loadHostedGameFiles({baseURL:base,cacheStorage,onProgress:value=>progress.push({...value})});
  for(let i=0;i<data.length;i++)assert.deepEqual(Buffer.from(data[i]),payloads[i]);
  assert(progress.every((p,i)=>p.loaded<=p.total&&(!i||p.loaded>=progress[i-1].loaded)));
  return progress.at(-1);
 };
 try{
  if(mode==='valid'){
   const total=payloads.reduce((sum,bytes)=>sum+bytes.length,0);
   assert.deepEqual(await load(),{loaded:total,total,files:6,downloaded:total,cached:0,cacheAvailable:true});
   assert.equal(requests.length,7);assert.equal(storage.entries.size,6);assert(requests.every(url=>url.startsWith('/orderup/')));
   assert.deepEqual(await load(),{loaded:total,total,files:6,downloaded:0,cached:total,cacheAvailable:true});
   assert.deepEqual(requests,['/orderup/game/manifest.json'],'Warm load may only request the small manifest');
   await load(storage,baseURL+'?v=new-player-build');assert.equal(requests.length,1,'Player update must not invalidate game data');
   const key=[...storage.entries.keys()].find(key=>key.includes('libOrderUp.so'));
   storage.entries.set(key,new Response(new Uint8Array(specs[0].size)));
   const repaired=await load();assert.equal(requests.length,2);assert.equal(repaired.downloaded,specs[0].size);assert.equal(repaired.cached,total-specs[0].size);
   const oldKey=[...storage.entries.keys()].find(key=>key.includes('orderup.apk'));
   payloads[1]=Buffer.from(payloads[1]);payloads[1][0]^=1;specs[1].sha256=hash(payloads[1]);
   const updated=await load();assert.equal(requests.length,2);assert.equal(updated.downloaded,specs[1].size);assert.equal(storage.entries.has(oldKey),false,'Obsolete version removed');assert.equal(storage.entries.size,6);
   await load();assert.equal(requests.length,1);
   storage.entries.delete([...storage.entries.keys()].find(key=>key.includes('chefdata.wad')));
   const evicted=await load();assert.equal(requests.length,2);assert.equal(evicted.downloaded,specs[4].size);
   for(const unavailable of [null,{open:async()=>{throw Error('Storage denied');}}]){
    const fallback=await load(unavailable);assert.equal(requests.length,7);assert.equal(fallback.cacheAvailable,false);
   }
   const quota=memoryCache(),quotaCache=await quota.open(assetCacheName);quotaCache.put=async()=>{throw Error('QuotaExceededError');};
   const fallback=await load({open:async()=>quotaCache});assert.equal(fallback.cacheAvailable,false);assert.equal(fallback.downloaded,total);assert.equal(quota.entries.size,0);
   const broken=memoryCache(),brokenCache=await broken.open(assetCacheName);brokenCache.match=async()=>{throw Error('Cache read failed');};
   assert.equal((await load({open:async()=>brokenCache})).downloaded,total);
  }else{
   const messages={missing:/Could not download.*404/,truncated:/incomplete/,corrupt:/verification/,'too-large':/exceeded/,'invalid-manifest':/Invalid game download manifest/};
   await assert.rejects(load(),messages[mode]);
   assert(![...storage.entries.keys()].some(key=>key.includes('libOrderUp.so')),'Failed verification must not populate cache');
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
for(const mode of ['valid','missing','truncated','corrupt','too-large','invalid-manifest'])await scenario(mode);
console.log('Verified downloads and cache: warm reads, player updates, changed/corrupt/evicted files, denied storage, quota failures, gzip and integrity failures.');
