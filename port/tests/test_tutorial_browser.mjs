/** Real UI and original engine, fresh isolated player; no prepared save fixture. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGameSession,tapCanvasLabel} from './game_session.mjs';
import {tap} from './cooking_helpers.mjs';
import {readCanvasText} from './scene_helpers.mjs';

const session=await createGameSession();let page;
const healthy=async()=>assert.equal(await page.evaluate(()=>orderup.error),null);
async function waitText(needle,timeout=120000){
 const until=Date.now()+timeout;
 while(Date.now()<until){await healthy();const text=(await readCanvasText(page)).map(x=>x.text);if(text.some(t=>t.toLowerCase().includes(needle.toLowerCase())))return text;await page.waitForTimeout(700);}
 throw Error('Game did not show '+needle);
}
async function newGame(){
 await page.evaluate(()=>orderup.controller.resume());
 await tapCanvasLabel(page,'New Game',{timeout:60000});
 await waitText('select chef');assert.equal(await page.locator('#skip-tutorial').isVisible(),false,'No skip button during chef selection');await tap(page,350,320,3000);
 await waitText('confirm chef');await tap(page,350,320);
}
async function reload(){
 await page.reload();
 await page.waitForFunction(()=>orderup.error||orderup.frames>=60,null,{timeout:180000});await healthy();
}
async function clearTestSave(){
 await page.evaluate(async()=>{
  await orderup.controller.pause();
  const {openSaves}=await import('/runtime/persistence.mjs'),saves=await openSaves();
  for(const [path] of saves.files)await saves.write(path,null);
  saves.close();
 });
}
try {
 page=await session.open('tutorial');
 assert.equal(await page.locator('#tutorial-overlay').isVisible(),false);
 assert.equal(await page.locator('#tutorial-preference').count(),0,'There is no tutorial toggle');
 await newGame();await page.locator('#skip-tutorial').waitFor({state:'visible',timeout:120000});
 assert.equal(await page.locator('#skip-tutorial').textContent(),'Skip Tutorial');
 await page.screenshot({path:'analysis/tutorial-overlay.png'});
 await page.click('#skip-tutorial');
 await waitText('Gravy Chug');await page.waitForTimeout(15000);await healthy();
 assert.equal(await page.locator('#tutorial-overlay').isVisible(),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('orderup-skip-tutorial')),'true','Remember the successful skip');
 const save=await page.evaluate(async()=>{
  await orderup.controller.pause();await orderup.flushSaves();
  const r=orderup.runtime,m=r.u32(r.elf.address('_ZN10Restaurant9g_ManagerE'));
  const assistant=await r.call('_ZN10Restaurant7Manager18GetBoughtAssistantEi',[m,0]);
  return {files:[...r.files].filter(([p,f])=>f.writable&&/Save\d+\.bin$/.test(p)).map(([path,f])=>({path,bytes:f.data.length})),assistant:!!assistant};
 });
 assert(save.files.length>0,'Native completion saves the new player');
 assert.equal(save.assistant,false,'The temporary tutorial assistant must be removed');
 console.log('Manual skip reached stable world map with original save:',save);
 await reload();assert.equal(await page.locator('#skip-tutorial').isVisible(),false);
 await tapCanvasLabel(page,'Continue',{timeout:60000});await waitText('Back');await healthy();
 assert.equal(await page.locator('#skip-tutorial').isVisible(),false,'No button on the world map');
 console.log('Original encrypted save restored after reload.');
 // Start this isolated player's next game while keeping their remembered choice.
 await clearTestSave();
 await reload();await newGame();
 await waitText('Gravy Chug');await page.waitForTimeout(15000);await healthy();
 assert.equal(await page.locator('#skip-tutorial').isVisible(),false);
 assert.equal(await page.locator('#tutorial-preference').count(),0);
 console.log('The next new game skipped its tutorial using the remembered click, with no toggle.');
 await page.screenshot({path:'analysis/tutorial-skipped-map.png'});
 fs.writeFileSync('analysis/tutorial-browser-tests.json',JSON.stringify({button_only_during_tutorial:true,exact_button_label:'Skip Tutorial',no_toggle:true,one_click_skip:true,remembered_choice:true,stable_after_delayed_callbacks:true,encrypted_save_reload:true,next_game_auto_skip:true,save},null,2)+'\n');
} finally {if(page)await page.screenshot({path:'analysis/tutorial-test-final.png'});await session.close();}
