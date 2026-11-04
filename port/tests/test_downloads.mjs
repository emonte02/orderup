import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {gamePaths,loadHostedGameFiles} from '../web/downloads.mjs';
const payloads=gamePaths.map((_,i)=>Buffer.from(('Synthetic game payload '+i+'\n').repeat(200)));
const specs=gamePaths.map((path,i)=>({path:path.slice(1),size:payloads[i].length,sha256:crypto.createHash('sha256').update(payloads[i]).digest('hex')}));
async function scenario(mode){
 const requests=[],progress=[];
 const server=http.createServer((req,res)=>{
  requests.push(req.url);const prefix='/orderup/';
  if(req.url===prefix+'game/manifest.json'){
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({files:mode==='invalid-manifest'?[]:specs}));return;
  }
  const index=gamePaths.indexOf('/'+req.url.slice(prefix.length));
  if(!req.url.startsWith(prefix)||index<0){res.writeHead(404);res.end();return;}
  if(mode==='missing'&&index===0){res.writeHead(404);res.end();return;}
  let data=payloads[index];
  if(index===0){
   if(mode==='truncated')data=data.subarray(0,data.length-1);
   if(mode==='too-large')data=Buffer.concat([data,Buffer.of(1)]);
   if(mode==='corrupt'){data=Buffer.from(data);data[0]^=255;}
  }
  // Emulate Pages/CDN compression: transfer length differs from decoded length.
  const zipped=gzipSync(data);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',zipped.length);res.end(zipped);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const download=loadHostedGameFiles({baseURL:'http://127.0.0.1:'+server.address().port+'/orderup/',onProgress:value=>progress.push({...value})});
  if(mode==='valid'){
   const data=await download;for(let i=0;i<data.length;i++)assert.deepEqual(Buffer.from(data[i]),payloads[i]);
   const total=payloads.reduce((sum,bytes)=>sum+bytes.length,0);
   assert.deepEqual(progress.at(-1),{loaded:total,total,files:6});
   assert(progress.every((p,i)=>p.loaded<=p.total&&(!i||p.loaded>=progress[i-1].loaded)));
   assert(requests.every(url=>url.startsWith('/orderup/')));
  }else{
   const messages={missing:/Could not download.*404/,truncated:/incomplete/,corrupt:/verification/, 'too-large':/exceeded/,'invalid-manifest':/Invalid game download manifest/};
   await assert.rejects(download,messages[mode]);
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
for(const mode of ['valid','missing','truncated','corrupt','too-large','invalid-manifest'])await scenario(mode);
console.log('Automatic downloads: project-relative URLs, gzip progress, integrity, missing/truncated/oversized files, and manifest errors checked.');
