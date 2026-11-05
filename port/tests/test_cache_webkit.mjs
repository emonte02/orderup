/** WebKit's ephemeral test contexts discard cache bodies on navigation: use a real profile. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {webkit} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
import {gamePaths} from '../web/downloads.mjs';
const server=createGameServer(),requests=[];
server.on('request',req=>{const p=new URL(req.url,'http://localhost').pathname;if(gamePaths.includes(p))requests.push(p);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'orderup-webkit-cache-')),url='http://127.0.0.1:'+server.address().port;
let context;
const launch=async()=>{context=await webkit.launchPersistentContext(profile,{headless:true,executablePath:process.env.OU_WEBKIT_PATH||webkit.executablePath(),viewport:{width:390,height:844},isMobile:true,hasTouch:true});return context.pages()[0];};
const ready=async page=>{await page.waitForFunction(()=>orderup.error||orderup.frames>=30,null,{timeout:600000});assert.equal(await page.evaluate(()=>orderup.error),null);await page.locator('#loading-panel').waitFor({state:'hidden'});};
const stats=page=>page.evaluate(()=>({downloaded:orderup.startup.bytes_downloaded,cached:orderup.startup.bytes_cached,total:orderup.startup.bytes_total,cache_available:orderup.startup.cache_available}));
try{
 let page=await launch();await page.goto(url);await ready(page);const cold=await stats(page);
 assert.equal(cold.cache_available,true);assert.equal(cold.downloaded,cold.total);assert.equal(requests.length,6);
 await context.close();context=null;requests.length=0;
 page=await launch();await page.goto(url);await ready(page);const warm=await stats(page);
 assert.equal(warm.downloaded,0);assert.equal(warm.cached,warm.total);assert.deepEqual(requests,[]);
 await page.screenshot({path:new URL('../../analysis/cache-webkit-portrait.png',import.meta.url).pathname});
 const report={cold,warm,autostart:true,disk_cache_survives_browser_restart:true,zero_game_asset_requests_on_reload:true};
 fs.writeFileSync(new URL('../../analysis/cache-webkit-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
