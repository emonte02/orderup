import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {loadingArt} from './loading_art.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function createGameServer(){
 let artwork;
 const routes=new Map([
  ['/', ['port/web/index.html','text/html']],['/app.mjs',['port/web/app.mjs','text/javascript']],['/mouse.mjs',['port/web/mouse.mjs','text/javascript']],['/loop.mjs',['port/web/loop.mjs','text/javascript']],
  ['/store.mjs',['port/web/store.mjs','text/javascript']],
  ['/fullscreen.mjs',['port/web/fullscreen.mjs','text/javascript']],
  ['/loading.css',['port/web/loading.css','text/css']],
  ['/downloads.mjs',['port/web/downloads.mjs','text/javascript']],
  ['/game/manifest.json',['port/game-data.json','application/json']],
  ['/unicorn.js',['port/build/unicorn-arm.js','text/javascript']],['/game/libOrderUp.so',['analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','application/octet-stream']],
  ['/save/chefdata.wad',['analysis/game-apk/assets/chefdata.png','application/octet-stream']],['/save/chefmisc.wad',['analysis/game-apk/assets/chefmisc.png','application/octet-stream']],
  ['/game/ui.json',['analysis/game-platform-ui.json','application/json']],
  ['/game/orderup.apk',['originals/orderup-1.65.apk','application/octet-stream']],['/game/main.13.com.svsgames.orderup.obb',['originals/main.13.com.svsgames.orderup.obb','application/octet-stream']],['/game/patch.13.com.svsgames.orderup.obb',['originals/patch.13.com.svsgames.orderup.obb','application/octet-stream']],
 ]);
 for(const name of ['elf','memory','runtime','libc','threads','jni','graphics','graphics_batch','audio','persistence','optimizations','fullscreen'])routes.set('/runtime/'+name+'.mjs',['port/runtime/'+name+'.mjs','text/javascript']);
 return http.createServer((req,res)=>{
  const artName=new URL(req.url,'http://localhost').pathname.match(/^\/art\/(logo|inspector)\.png$/)?.[1];
  if(artName){
   try{artwork??=loadingArt(fs.readFileSync(path.join(root,'originals/main.13.com.svsgames.orderup.obb')));const bytes=artwork.get(artName+'.png');res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);}
   catch(error){res.writeHead(500);res.end('Loading artwork is unavailable.');console.error(error);}
   return;
  }
  const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/health.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({application:'orderup-browser',version:1}));return;}const entry=routes.get(pathname);if(!entry){res.writeHead(404);res.end();return;}
  const p=path.join(root,entry[0]);if(!fs.existsSync(p)){res.writeHead(404);res.end('Required local build or game file is missing.');return;}
  res.setHeader('Content-Type',entry[1]+(entry[1].startsWith('text/')?'; charset=utf-8':''));res.setHeader('Content-Length',fs.statSync(p).size);res.setHeader('Cache-Control','no-store');fs.createReadStream(p).pipe(res);
 });
}
if(typeof process!=='undefined'&&process.argv[1]===fileURLToPath(import.meta.url)){
 const server=createGameServer(),port=Number(process.env.OU_PORT||8147);server.listen(port,'127.0.0.1',()=>console.log('Original game development build: http://127.0.0.1:'+port));
}
