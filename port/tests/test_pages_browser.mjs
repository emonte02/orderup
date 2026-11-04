/** Run after packaging, or set OU_PAGES_URL. No local original game files required. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {gamePaths} from '../web/downloads.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),site=path.join(root,'_site');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'port/game-data.json')));
const expectedBytes=manifest.files.filter(spec=>gamePaths.includes('/'+spec.path)).reduce((sum,spec)=>sum+spec.size,0);
let server,browser;
try{
 let url=process.env.OU_PAGES_URL;
 if(!url){
  server=http.createServer((req,res)=>{
   const name=new URL(req.url,'http://localhost').pathname;
   if(!name.startsWith('/orderup/')){res.writeHead(404);res.end();return;}
   const file=path.resolve(site,name.slice('/orderup/'.length)||'index.html');
   if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
   const type=file.endsWith('.html')?'text/html':file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':'application/octet-stream';
   res.setHeader('Content-Type',type);fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/orderup/';
 }
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],requests=[],badResponses=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('request',req=>requests.push({url:req.url(),method:req.method()}));
 page.on('response',res=>{if(res.status()>=400)badResponses.push({url:res.url(),status:res.status()});});
 const resourceBase=new URL('.',url).href;
 await page.goto(url,{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('input[type="file"]').count(),0,'The hosted game must never request local files');
 await page.locator('#start').waitFor({state:'visible'});
 // Start during automatic downloading, just as a new visitor can.
 await page.click('#start');
 console.log('Starting the complete hosted game in a fresh browser at '+url);
 await page.waitForFunction(()=>orderup.state==='failed'||orderup.frames>=60,null,{timeout:600000});
 assert.equal(await page.evaluate(()=>orderup.error),null);
 await page.evaluate(()=>orderup.controller.pause());
 const report=await page.evaluate(()=>({state:orderup.state,boot:orderup.bootCompleted,frames:orderup.frames,startup_ms:orderup.startup.ready_ms,draws:orderup.runtime.graphics.draws,decoded_audio:orderup.runtime.audio.decoded,save_files:[...orderup.runtime.files.keys()].filter(p=>p.startsWith('/save/'))}));
 assert.equal(report.boot,true);assert(report.frames>=60);assert(report.draws>0);assert(report.decoded_audio>0);
 const download=await page.evaluate(()=>({bytes:orderup.startup.bytes_loaded,total:orderup.startup.bytes_total,files:orderup.startup.files_loaded}));
 assert.deepEqual(download,{bytes:expectedBytes,total:expectedBytes,files:6});
 await page.locator('#loading-panel').waitFor({state:'hidden'});
 await page.click('#fullscreen');await page.waitForFunction(()=>!!document.fullscreenElement);await page.click('#fullscreen');await page.waitForFunction(()=>!document.fullscreenElement);
 const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.up();
 const input=await page.evaluate(()=>orderup.input.splice(0));assert.deepEqual(input.map(e=>e[1]),[0,2,1]);
 assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
 assert(requests.every(req=>req.method==='GET'),'Game files must not be uploaded');
 for(const file of gamePaths)assert(requests.some(req=>new URL(req.url).pathname===new URL(url).pathname+file.slice(1)),'Missing automatically downloaded game file: '+file);
 assert(requests.every(req=>req.url.startsWith(resourceBase)),'All player resources must work under the project path');
 fs.mkdirSync(path.join(root,'analysis'),{recursive:true});
 const stem=process.env.OU_PAGES_URL?'pages-live':'pages-local';
 await page.screenshot({path:path.join(root,'analysis',stem+'.png')});
 const buildResponse=await page.request.get(new URL('build.json',resourceBase).href);assert.equal(buildResponse.ok(),true);const build=await buildResponse.json();const scriptRequests=requests.filter(req=>{const p=new URL(req.url).pathname;return p.endsWith('.mjs')||p.endsWith('/unicorn.js');});assert(scriptRequests.length>10);assert(scriptRequests.every(req=>new URL(req.url).searchParams.get('v')===build.version),'Every module and the engine must bypass an older cached build');
 Object.assign(report,{url,build,all_player_modules_versioned:true,automatic_downloads:download,no_local_files_required:true,fresh_browser_boot:true,fullscreen:true,mouse_drag:true,no_uploads:true,page_errors:errors,network_errors:badResponses});
 fs.writeFileSync(path.join(root,'analysis',stem+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
