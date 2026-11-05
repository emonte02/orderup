import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
const root=new URL('../../',import.meta.url),server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1100,height:850}});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>orderup.state==='failed'||orderup.frames>=15,null,{timeout:600000});assert.equal(await page.evaluate(()=>orderup.error),null);
 await page.evaluate(()=>orderup.controller.pause());
 await page.evaluate(async()=>{const r=orderup.runtime,app=r.u32(r.elf.address('_ZN3App13s_current_appE')),show=r.elf.symbols.find(s=>s.name.includes('GameApp')&&s.name.includes('ShowAchievementEv'));r.beginJNIFrame();try{await r.call(show.value,[app]);}finally{r.endJNIFrame();}});
 await page.locator('#notice[open]').waitFor();assert.equal(await page.locator('#notice-title').textContent(),'Achievements');assert.equal(await page.locator('#notice-body li').count(),30);
 const badges = page.locator('#notice-body img:not([hidden])');
 assert.equal(await badges.count(),30,'Each original achievement has its own badge slot');
 await badges.evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:new URL('analysis/achievements-browser.png',root).pathname});await page.click('#notice-close');
 await page.evaluate(async()=>{const r=orderup.runtime,app=r.u32(r.elf.address('_ZN3App13s_current_appE')),show=r.elf.symbols.find(s=>s.name.includes('GameApp')&&s.name.includes('13DisplayDialogEi'));r.beginJNIFrame();try{await r.call(show.value,[app,11]);}finally{r.endJNIFrame();}});
 await page.locator('#notice[open]').waitFor();assert((await page.locator('#notice-body').textContent()).includes('close this tab'));await page.click('#notice-close');await page.evaluate(()=>orderup.controller.resume());const before=await page.evaluate(()=>orderup.frames);await page.waitForFunction(n=>orderup.frames>n+5,before);assert.equal(await page.evaluate(()=>orderup.error),null);
 await page.locator('canvas').click({button:'right',position:{x:80,y:80}});await page.locator('#notice[open]').waitFor();await page.click('#notice-close');await page.waitForFunction(()=>orderup.state==='running');const afterBack=await page.evaluate(()=>orderup.frames);await page.waitForFunction(n=>orderup.frames>n+12,afterBack);assert.equal(await page.locator('#notice').evaluate(dialog=>dialog.open),false,'Back must be released when the Android dialog pauses the game');
 const report={right_click_back_released:true,native_achievements_panel:true,original_achievement_count:30,native_android_dialog:true,resume_after_dialog:true,runtime:await page.evaluate(()=>({objects:orderup.runtime.javaObjects.size,frames:orderup.frames,shared_memory:orderup.runtime.mappings.every(m=>!!m[2]),c_accelerations:orderup.runtime.cAccelerations}))};fs.writeFileSync(new URL('analysis/platform-browser-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
