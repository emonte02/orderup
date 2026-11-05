/** Real on-disk browser cache, across browser restarts with HTTP caching disabled. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
import {gamePaths,assetCacheName} from '../web/downloads.mjs';
const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'orderup-cache-')),url='http://127.0.0.1:'+server.address().port;
let context;
const launch=async()=>{
 context=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:844},args:['--autoplay-policy=document-user-activation-required']});
 const page=context.pages()[0],network=await context.newCDPSession(page);await network.send('Network.enable');await network.send('Network.setCacheDisabled',{cacheDisabled:true});page.cacheCDP=network;
 await page.addInitScript(()=>{
  window.startupSamples=[];const timer=setInterval(()=>{const p=document.querySelector('#loading-progress');if(!p||!window.orderup)return;
   const sample={percent:p.value,frames:orderup.frames};if(startupSamples.at(-1)?.percent!==sample.percent)startupSamples.push(sample);if(orderup.frames>5)clearInterval(timer);
  },10);
 });return page;
};
// Playwright evaluate/wait helpers can grant user activation. Use raw CDP for
// the no-interaction startup assertions, explicitly without a user gesture.
const observe=async(page,expression)=>{const r=await page.cacheCDP.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:false});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const ready=async page=>{
 const deadline=Date.now()+600000;
 while(Date.now()<deadline){const s=await observe(page,"window.orderup&&({error:orderup.error,frames:orderup.frames,hidden:document.querySelector('#loading-panel').hidden})");if(s?.error)throw Error(s.error);if(s?.frames>=30&&s.hidden)return;await new Promise(resolve=>setTimeout(resolve,250));}
 throw Error('Automatic startup timed out');
};
const stats=page=>observe(page,"({downloaded:orderup.startup.bytes_downloaded,cached:orderup.startup.bytes_cached,total:orderup.startup.bytes_total,frames:orderup.frames,audio:orderup.runtime.audio.context.state,activated:navigator.userActivation.hasBeenActive})");
try{
 let page=await launch(),assets=[];page.on('request',request=>{const p=new URL(request.url()).pathname;if(gamePaths.includes(p))assets.push(p);});
 await page.goto(url);await ready(page);
 const cold=await stats(page);assert.equal(assets.length,6);assert.equal(cold.downloaded,cold.total);assert.equal(cold.cached,0);assert.equal(cold.activated,false);assert.equal(cold.audio,'suspended');
 const ui=await observe(page,"({retryHidden:document.querySelector('#start').hidden,soundHidden:document.querySelector('#sound').hidden,percent:document.querySelector('#loading-progress').value,samples:startupSamples})");
 assert.equal(ui.retryHidden,true);assert.equal(ui.soundHidden,false);assert(ui.samples.filter(s=>!s.frames).every(s=>s.percent<100));assert.equal(ui.percent,100);
 const shot=await page.cacheCDP.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(new URL('../../analysis/autostart-portrait.png',import.meta.url),Buffer.from(shot.data,'base64'));
 // Pausing and returning before a gesture must not hang on AudioContext.resume().
 await observe(page,'orderup.controller.pause()');await observe(page,'orderup.controller.resume()');const frame=await observe(page,'orderup.frames');
 while(await observe(page,'orderup.frames')<=frame+5)await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal((await stats(page)).audio,'suspended');
 const button=await observe(page,"(()=>{const r=document.querySelector('#sound').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await page.mouse.click(button.x,button.y);await page.waitForFunction(()=>orderup.runtime.audio.context.state==='running');assert.equal(await page.locator('#sound').isVisible(),false);
 await context.close();context=null;
 console.log('Cold startup completed without a click; sound unlocked by the first interaction.');
 page=await launch();assets=[];
 // Refuse every large-asset network request, even after a browser restart/build URL change.
 await page.route('**/*',route=>{const p=new URL(route.request().url()).pathname;if(gamePaths.includes(p)){assets.push(p);return route.abort();}return route.continue();});
 await page.goto(url+'/?v=new-player-build');await ready(page);const warm=await stats(page);
 assert.deepEqual(assets,[]);assert.equal(warm.downloaded,0);assert.equal(warm.cached,warm.total);assert.equal(warm.activated,false);
 console.log('Warm startup after browser restart fetched zero game assets.');
 // Corrupt one stored file, then allow only that file to be recovered.
 await page.evaluate(async name=>{const c=await caches.open(name),keys=await c.keys(),key=keys.find(k=>new URL(k.url).pathname.endsWith('/libOrderUp.so'));await c.put(key,new Response(new Uint8Array([1,2,3])));},assetCacheName);
 await page.unroute('**/*');assets=[];
 await page.route('**/*',route=>{const p=new URL(route.request().url()).pathname;if(gamePaths.includes(p)){assets.push(p);if(p!==gamePaths[0])return route.abort();}return route.continue();});
 await page.reload();await ready(page);const repaired=await stats(page);assert.deepEqual(assets,[gamePaths[0]]);assert(repaired.downloaded>0&&repaired.downloaded<repaired.total);assert.equal(repaired.cached+repaired.downloaded,repaired.total);
 // A failed manifest should offer a working reload, not a second Start gate.
 let failManifest=true;await page.route('**/game/manifest.json',route=>{if(failManifest){failManifest=false;return route.abort();}return route.continue();});
 await page.reload();await page.waitForFunction(()=>orderup.error);assert.equal(await page.locator('#start').isVisible(),true);
 await page.click('#start');await ready(page);assert.equal((await stats(page)).downloaded,0);
 const report={cold,warm,repaired,retry_after_download_failure:true,autostart_without_gesture:true,audio_unlock:true,resume_before_audio_unlock:true,disk_cache_survives_browser_restart:true,no_asset_requests_on_warm_start:true,recovers_only_corrupt_asset:true};
 fs.writeFileSync(new URL('../../analysis/cache-browser-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
