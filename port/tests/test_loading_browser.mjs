import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const artifact=name=>new URL('../../analysis/'+name,import.meta.url);
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const network=await page.context().newCDPSession(page);await network.send('Network.enable');
 await network.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:16*1024*1024,uploadThroughput:16*1024*1024});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.locator('#loading-panel').waitFor({state:'visible'});
 await page.waitForFunction(()=>window.orderup?.startup.bytes_loaded>0&&orderup.startup.bytes_loaded<orderup.startup.bytes_total,null,{timeout:120000});
 await page.waitForFunction(()=>{const p=document.querySelector('#loading-progress');return p.value>0&&p.value<100;});
 const partial=await page.evaluate(()=>({value:document.querySelector('#loading-progress').value,bytes_loaded:orderup.startup.bytes_loaded,bytes_total:orderup.startup.bytes_total,start_requested:orderup.startRequested,runtime:!!orderup.runtime}));
 assert.equal(partial.start_requested,false);assert.equal(partial.runtime,false);assert(partial.value>0&&partial.value<100);
 await page.screenshot({path:artifact('loading-download-browser.png').pathname});
 const layouts=[];
 async function checkLayout(label){const layout=await page.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{viewport:[innerWidth,innerHeight],canvas:[r.x,r.y,r.width,r.height],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};});const[w,h]=layout.viewport,[x,y,cw,ch]=layout.canvas;assert(Math.abs(cw/ch-1.5)<0.001);assert(cw<=w+1&&ch<=h+1&&x>=-1&&y>=-1);assert(Math.abs(cw-w)<1||Math.abs(ch-h)<1);assert(layout.scroll[0]<=w&&layout.scroll[1]<=h);layouts.push({label,...layout});return layout;}
 for(const[width,height]of[[1280,720],[1100,850],[700,1000]]){await page.setViewportSize({width,height});await checkLayout(width+'x'+height);}
 await page.setViewportSize({width:1100,height:850});
 await page.click('#fullscreen');await page.waitForFunction(()=>document.fullscreenElement===document.documentElement&&document.querySelector('#fullscreen').getAttribute('aria-pressed')==='true');assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'true');await checkLayout('full-screen');
 await page.click('#fullscreen');await page.waitForFunction(()=>!document.fullscreenElement&&document.querySelector('#fullscreen').getAttribute('aria-pressed')==='false');assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'false');
 await page.waitForFunction(()=>orderup.state==='failed'||orderup.state==='ready',null,{timeout:120000});assert.equal(await page.evaluate(()=>orderup.error),null);
 assert.equal(await page.locator('#loading-progress').getAttribute('value'),'100');assert.equal(await page.evaluate(()=>!!orderup.runtime),false);
 const download=await page.evaluate(()=>({bytes_loaded:orderup.startup.bytes_loaded,bytes_total:orderup.startup.bytes_total,files_loaded:orderup.startup.files_loaded}));assert.equal(download.bytes_loaded,download.bytes_total);assert.equal(download.files_loaded,6);
 await network.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await page.click('#start');await page.waitForFunction(()=>orderup.state==='failed'||orderup.state==='initializing',null,{timeout:120000});assert.equal(await page.evaluate(()=>orderup.error),null);
 assert.equal(await page.locator('#loading-progress').getAttribute('value'),null);assert((await page.locator('#loading-detail').textContent()).includes('1–2 minutes'));assert((await page.locator('#loading-elapsed').textContent()).includes('elapsed'));
 await page.screenshot({path:artifact('loading-progress-browser.png').pathname});
 await page.waitForFunction(()=>orderup.state==='failed'||orderup.frames>5,null,{timeout:600000});await page.locator('#loading-panel').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>orderup.error),null);assert.equal(await page.locator('#start').isVisible(),false);
 await page.evaluate(()=>orderup.controller.pause());const frames=await page.evaluate(()=>orderup.frames);
 await page.click('#fullscreen');await page.waitForFunction(()=>document.fullscreenElement===document.documentElement&&document.querySelector('#fullscreen').getAttribute('aria-pressed')==='true');await checkLayout('playing-full-screen');
 const box=await page.locator('canvas').boundingBox();await page.mouse.click(box.x+box.width*.25,box.y+box.height*.5);
 const input=await page.evaluate(()=>orderup.input.splice(0));assert.equal(input.length,2);assert.deepEqual(input.map(e=>e[1]),[0,1]);for(const e of input){assert(Math.abs(e[2]-240)<1);assert(Math.abs(e[3]-320)<1);}
 await page.evaluate(()=>orderup.runtime.call('_Z21showActivityIndicatorb',[1]));assert.equal(await page.locator('#activity-indicator').isVisible(),true);
 await page.screenshot({path:artifact('scene-loading-browser.png').pathname});
 await page.evaluate(()=>orderup.runtime.call('_Z21showActivityIndicatorb',[1]));assert.equal(await page.locator('#activity-indicator').isVisible(),true);
 await page.evaluate(()=>orderup.runtime.call('_Z21showActivityIndicatorb',[0]));assert.equal(await page.locator('#activity-indicator').isVisible(),false);assert.equal(await page.evaluate(()=>orderup.frames),frames);
 await page.click('#fullscreen');await page.waitForFunction(()=>!document.fullscreenElement&&document.querySelector('#fullscreen').getAttribute('aria-pressed')==='false');
 await page.evaluate(()=>orderup.controller.resume());await page.waitForFunction(n=>orderup.state==='failed'||orderup.frames>n,frames);assert.deepEqual(errors,[]);
 const report=await page.evaluate(()=>({native_scene_loading_feedback:true,native_scene_loading_does_not_pause:true,visible_loading_feedback:true,hidden_after_first_frame:true,files_loaded:orderup.startup.files_loaded,startup_ms:orderup.startup.ready_ms,page_ready_ms:orderup.startup.page_ready_ms,phases:orderup.startup.phases,error:orderup.error}));
 Object.assign(report,{automatic_file_preload:true,partial_download:partial,download,viewport_layouts:layouts,fullscreen_enter_exit:true,fullscreen_mouse_coordinates:input,page_errors:errors});assert(report.startup_ms>0);
 fs.writeFileSync(artifact('loading-browser-tests.json'),JSON.stringify(report,null,2)+'\n');await page.screenshot({path:artifact('loading-finished-browser.png').pathname});console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
