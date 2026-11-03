import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,monitor;
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1100,height:850}});page.setDefaultTimeout(600000);
 const consoleLines=[];page.on('console',msg=>{const text=msg.text();if(text.startsWith('[engine]')||text.startsWith('[graphics]')){consoleLines.push(text);if(consoleLines.length<30)console.log(text);}});page.on('pageerror',e=>console.error('Page error',String(e)));
 monitor=setInterval(async()=>{try{const s=await page.evaluate(()=>{const o=window.orderup,r=o?.runtime;return {state:o?.state,pc:r?.reg(15),virtual_ms:r?.virtualMs,frames:o?.frames,threads:r?.threads.map(t=>({id:t.id,state:t.state,wait:t.wait})),last_events:r?.events.slice(-3),gl:r?.graphics&&{draws:r.graphics.draws,textures:r.graphics.textureUploads,shaders:r.graphics.shaders.length}};});console.log('Progress:',JSON.stringify(s));await page.screenshot({path:path.join(root,'analysis/engine-browser-live.png')});}catch{ }},15000);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.click('#start');await page.waitForFunction(()=>window.orderup?.state==='failed'||window.orderup?.frames>=90,{},{timeout:600000});
 const beforePause=await page.evaluate(async()=>{await orderup.controller.pause();return {clock:orderup.runtime.virtualMs,frames:orderup.frames,error:orderup.error};});
 await new Promise(resolve=>setTimeout(resolve,120));const duringPause=await page.evaluate(()=>({clock:orderup.runtime.virtualMs,frames:orderup.frames,state:orderup.state,error:orderup.error}));
 if(beforePause.error||duringPause.error||duringPause.state!=='paused'||beforePause.clock!==duringPause.clock||beforePause.frames!==duringPause.frames)throw Error('Pause failed '+JSON.stringify({beforePause,duringPause}));
 await page.evaluate(()=>orderup.controller.resume());await page.waitForFunction(n=>orderup.state==='failed'||orderup.frames>n,beforePause.frames,{timeout:30000});
 await page.evaluate(async()=>{await Promise.all([orderup.controller.pause(),orderup.controller.resume(),orderup.controller.pause()]);if(orderup.state!=='paused')throw Error('Rapid tab changes did not preserve the last pause request');await orderup.controller.resume();});
 const report=await page.evaluate(()=>({state:window.orderup.state,error:window.orderup.error,initializers_completed:!!window.orderup.initializersCompleted,boot_completed:!!window.orderup.bootCompleted,frames:window.orderup.frames,timings:window.orderup.timings,runtime:window.orderup.runtime?.report()}));
 report.pause_resume_verified=true;report.rapid_pause_resume_verified=true;report.browser=await browser.version();report.console=consoleLines;report.playable=false;
 fs.writeFileSync(path.join(root,'analysis/engine-boot-browser.json'),JSON.stringify(report,null,2)+'\n');await page.screenshot({path:path.join(root,'analysis/engine-browser.png')});console.log(JSON.stringify({state:report.state,error:report.error,frames:report.frames,graphics:report.runtime?.graphics&&{draws:report.runtime.graphics.draw_calls,shaders:report.runtime.graphics.shaders.length}},null,2));if(report.error)process.exitCode=1;
}finally{if(monitor)clearInterval(monitor);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
