import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createGameSession,tapCanvasLabel} from './game_session.mjs';
import {readCanvasText} from './scene_helpers.mjs';

const session=await createGameSession(),errors=[],layouts=[];
try{
 const page=await session.open('fullscreen','analysis/worldclass-earned-fixture.json');page.on('pageerror',error=>errors.push(String(error)));
 await page.evaluate(()=>orderup.controller.resume());await tapCanvasLabel(page,'Continue',{after:500});
 const waitButton=async()=>{await page.waitForFunction(()=>orderup.error||orderup.fullscreen.bounds,null,{timeout:120000});assert.equal(await page.evaluate(()=>orderup.error),null);const frame=await page.evaluate(()=>orderup.frames);await page.waitForFunction(n=>orderup.frames>n+10,frame);};
 const clickButton=async()=>{const p=await page.evaluate(()=>{const c=document.querySelector('canvas'),box=c.getBoundingClientRect(),b=orderup.fullscreen.bounds;return{x:box.left+(b.x+b.width/2)*box.width/c.width,y:box.top+(b.y+b.height/2)*box.height/c.height};});await page.mouse.click(p.x,p.y);};
 const navigation=()=>page.evaluate(async()=>{
  await orderup.controller.pause();const r=orderup.runtime,manager=r.u32(r.elf.address('_ZN4Menu9g_ManagerE'));
  const crc=s=>{let v=0xffffffff;for(const c of s){v^=c.charCodeAt(0);for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return v>>>0;};
  const result={};for(const name of ['worldmap_exit_panel','worldmap_back_panel','browser_fullscreen_panel']){const p=await r.call('_ZN4Menu7Manager16GetElementByNameE10checksum32b',[manager,crc(name),1]);result[name]={exists:!!p,hidden:p?!!(r.u8(p+0x180)&4):true};}
  await orderup.controller.resume();return result;
 });
 await waitButton();
 // The text must be in the canvas itself; a CSS lookalike cannot pass this.
 assert((await readCanvasText(page)).some(row=>row.text==='Full Screen'));
 assert.equal(await page.locator('#fullscreen').getAttribute('class'),'native-fullscreen');
 await page.screenshot({path:'analysis/fullscreen-native-window.png'});
 const resources=await page.evaluate(async()=>{
  await orderup.controller.pause();const r=orderup.runtime;
  const crc=s=>{let v=0xffffffff;for(const c of s){v^=c.charCodeAt(0);for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return v>>>0;};
  const find=name=>r.call('_ZN4Menu7Manager16GetElementByNameE10checksum32b',[r.u32(r.elf.address('_ZN4Menu9g_ManagerE')),crc(name),1]);
  const children=p=>{const out=[];for(let n=r.u32(p+0x194);n&&n!==p+0x18c;n=r.u32(n+8))out.push(n-0x20);return out;};
  const details=async name=>{const p=await find(name),list=children(p),text=list.find(c=>r.u32(c+0xac)===0xc4745838),image=list.find(c=>r.u32(c+0xac)===0x3ac2fba0);return{font:r.u32(text+0x1d4),image:r.u32(image+0x18c),shadow:Array.from(r.read(text+0x1ac,24)),height:r.f32(p+0x7c),y:r.f32(p+0x9c)};};
  const result={back:await details('worldmap_exit_panel'),fullscreen:await details('browser_fullscreen_panel')};await orderup.controller.resume();return result;
 });
 assert.deepEqual(resources.fullscreen,resources.back,'Original artwork, font, shadow and vertical placement must match Back');
 for(const [width,height]of[[1280,720],[700,1000],[1100,850]]){
  await page.setViewportSize({width,height});await clickButton();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.waitForFunction(()=>document.querySelector('#fullscreen').getAttribute('aria-pressed')==='true');
  const n=await page.evaluate(()=>orderup.frames);await page.waitForFunction(n=>orderup.frames>n+8,n);
  assert((await readCanvasText(page)).some(row=>row.text==='Exit Full Screen'));
  layouts.push(await page.evaluate(()=>({viewport:[innerWidth,innerHeight],bounds:orderup.fullscreen.bounds,input:orderup.input.slice(),lastInput:orderup.lastInput})));
  await clickButton();await page.waitForFunction(()=>!document.fullscreenElement);await waitButton();
 }
 await clickButton();await page.waitForFunction(()=>!!document.fullscreenElement);await page.screenshot({path:'analysis/fullscreen-native-expanded.png'});
 // Keyboard activation uses the same hidden accessible control, without a
 // second visible browser button on top of the game.
 await page.locator('#fullscreen').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.fullscreenElement);await waitButton();
 await page.locator('#fullscreen').blur();
 assert(layouts.every(row=>row.input.length===0),'Full-screen clicks must never reach the game');
 assert(layouts.every(row=>JSON.stringify(row.lastInput)===JSON.stringify(layouts[0].lastInput)));
 await clickButton();await page.waitForFunction(()=>!!document.fullscreenElement);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);await waitButton();
 assert.equal((await navigation()).worldmap_exit_panel.hidden,false,'Escape exits full screen without leaving the map');
 // A map district destroys/recreates its own navigation; retain the control
 // without stale native object pointers, and restore it on returning.
 await page.mouse.click(350,500);await page.waitForTimeout(1500);
 await waitButton();
 assert.equal((await navigation()).worldmap_back_panel.hidden,false,'District navigation must be active');
 await tapCanvasLabel(page,'Back',{after:1500});await waitButton();
 assert.equal((await navigation()).worldmap_exit_panel.hidden,false,'Overview navigation must be restored');
 await page.screenshot({path:'analysis/fullscreen-native-return.png'});
 await tapCanvasLabel(page,'Back',{after:1500});
 await page.waitForFunction(()=>!orderup.fullscreen.bounds);
 assert.equal((await navigation()).browser_fullscreen_panel.exists,false,'Leaving the map destroys the added native menu');
 await tapCanvasLabel(page,'Continue',{after:500});await waitButton();
 assert((await readCanvasText(page)).some(row=>row.text==='Full Screen'));
 assert.equal(await page.evaluate(()=>orderup.error),null);assert.deepEqual(errors,[]);
 const report={native_canvas_text:true,original_resources:resources,layouts,keyboard_toggle:true,escape_preserves_map:true,map_transition:true,native_cleanup_and_recreation:true,page_errors:errors,graphics_errors:await page.evaluate(()=>orderup.runtime.graphics.errors)};
 assert.deepEqual(report.graphics_errors,[]);fs.writeFileSync('analysis/fullscreen-browser-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await session.close();}
