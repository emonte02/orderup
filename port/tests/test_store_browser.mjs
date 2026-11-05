/** Exercises local fulfillment in a fresh browser, never the user's save/profile. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createGameSession,tapCanvasLabel} from './game_session.mjs';
import {waitSceneContent} from './scene_helpers.mjs';
import {tap} from './cooking_helpers.mjs';
const root=new URL('../../',import.meta.url),session=await createGameSession();
try{
 const page=await session.open('store',new URL(process.env.OU_STORE_FIXTURE||'analysis/tutorial-save-fixture.json',root));
 const externalRequests=[];page.on('request',request=>{if(new URL(request.url()).origin!==session.url)externalRequests.push(request.url());});
 const continueGame=async()=>{await page.evaluate(()=>orderup.controller.resume());await tapCanvasLabel(page,'Continue',{timeout:120000});await waitSceneContent(page);await page.evaluate(()=>orderup.controller.pause());};
 const balances=()=>page.evaluate(async()=>{
  const r=orderup.runtime,prefix='Java_com_svsgames_orderup_OrderUpJNILib_',gameData=r.u32(r.elf.address('_ZN12ChefGameData9g_ManagerE'));
  const name=r.cstring('DoubleCoinDaysRemaining');let crc;try{crc=await r.call('_ZN3Crc21GenerateCRCFromStringEPKcj',[name,0xffffffff]);}finally{r.free(name);}
  const days=await r.call('_ZN12ChefGameData7Manager11GetVariableIiEEPT_10checksum32',[gameData,crc]);
  const silver=await r.call('_ZN12ChefGameData7Manager11GetVariableIiEEPT_10checksum32',[gameData,0xaa9668a2]);
  return{gold:await r.call(prefix+'getGoldAmount',[r.jniEnv,0]),silver:r.u32(silver),doubleSilver:r.u32(days),permanent:!!await r.call(prefix+'getPermanentDoubleSilverCoins',[r.jniEnv,0]),productStrings:[...r.javaObjects.values()].filter(object=>object.kind==='string'&&object.value.startsWith('com.svs.orderup.')).length};
 });
 const openStore=async silverOnly=>{
  await page.evaluate(()=>orderup.controller.resume());
  // The world-map gold icon is clickable; silver-only offers originate elsewhere.
  if(silverOnly)await page.evaluate(()=>orderup.runtime.platformCall({name:'showSilverIAP'},[]));
  else await tap(page,60,85,100);
  await page.locator('[data-product]').first().waitFor();
  await page.waitForFunction(()=>orderup.state==='paused'&&!document.querySelector('#notice-close').disabled);
 };
 const closeStore=async()=>{await page.click('#notice-close');await page.waitForFunction(()=>!document.querySelector('#notice').open&&orderup.state==='running');await page.evaluate(()=>orderup.controller.pause());};
 const buy=async id=>{
  // Dispatch twice in one task to cover rapid repeat clicks without a second grant.
  await page.locator('[data-product="'+id+'"]').evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>orderup.error||(/purchased\./.test(document.querySelector('#notice-body').textContent)&&!document.querySelector('#notice-close').disabled));
  assert.equal(await page.evaluate(()=>orderup.error),null);
 };
 // Follow the exact title-menu entry reported by the player, in portrait layout.
 const titleBefore=await balances();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>orderup.controller.resume());
 await tapCanvasLabel(page,'FREE COINS!!',{timeout:120000});
 await page.locator('[data-product]').first().waitFor();
 await page.waitForFunction(()=>orderup.state==='paused'&&!document.querySelector('#notice-close').disabled);
 assert.equal(await page.locator('[data-product]').count(),9);
 assert.equal(await page.locator('#notice-title').textContent(),'Free Coins');
 const icons=page.locator('.coin-options img:not([hidden])');
 assert.equal(await icons.count(),9,'Each offer uses an original store illustration');
 await icons.evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:new URL('analysis/store-free-coins-portrait.png',root).pathname});
 await buy('gold_coins_30');assert.equal((await balances()).gold,titleBefore.gold+30);await closeStore();
 await page.setViewportSize({width:1100,height:850});
 await continueGame();console.log('Free Coins button granted 30 gold; continued isolated save');
 const before=await balances();assert.equal(before.gold,titleBefore.gold+30,'Title-menu purchase must survive Continue');
 await openStore(false);assert.equal(await page.locator('[data-product]').count(),9);
 await page.screenshot({path:new URL('analysis/store-gold.png',root).pathname});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#notice').open&&orderup.state==='running');await page.evaluate(()=>orderup.controller.pause());
 assert.deepEqual(await balances(),before,'Cancel must not change the save or allocate Java objects');
 let expectedGold=before.gold;
 for(const amount of [10,30,100,300,900,2000]){
  await openStore(false);await buy('gold_coins_'+amount);expectedGold+=amount;
  const after=await balances();assert.equal(after.gold,expectedGold);assert.equal(after.silver,before.silver);assert.equal(after.productStrings,0,'JNI product string must be released');
  await closeStore();console.log('Verified gold pack',amount);
 }
 await openStore(true);assert.equal(await page.locator('[data-product]').count(),3);
 await page.screenshot({path:new URL('analysis/store-silver.png',root).pathname});
 await buy('doublesilver5');assert.equal((await balances()).doubleSilver,5);await closeStore();
 await openStore(true);await buy('doublesilver15');assert.equal((await balances()).doubleSilver,15);await closeStore();
 await openStore(true);await buy('doublesilver0');assert.equal((await balances()).permanent,true);await closeStore();
 await openStore(true);assert.equal(await page.locator('[data-product]:disabled').count(),3);await closeStore();
 console.log('Verified silver upgrades');
 const saved=await balances();
 const invalid=await page.evaluate(async()=>{const {purchaseCoins}=await import('/store.mjs');try{await purchaseCoins(orderup.runtime,'unknown_product');return false;}catch(error){return /Unknown coin product/.test(error.message);}});
 assert.equal(invalid,true);assert.deepEqual(await balances(),saved);
 await page.evaluate(()=>orderup.flushSaves());
 // Reload before resuming gameplay: the purchase callback itself must save.
 await page.reload();await page.waitForFunction(()=>orderup.error||orderup.frames>=30,null,{timeout:600000});assert.equal(await page.evaluate(()=>orderup.error),null);
 await page.evaluate(()=>orderup.controller.pause());await continueGame();
 const restored=await balances();assert.equal(restored.gold,expectedGold);assert.equal(restored.silver,before.silver);assert.equal(restored.permanent,true);assert.equal(restored.doubleSilver,saved.doubleSilver);
 await openStore(false);assert.equal(await page.locator('[data-product]:disabled').count(),3);await closeStore();
 const frame=await page.evaluate(()=>orderup.frames);await page.evaluate(()=>orderup.controller.resume());await page.waitForFunction(frame=>orderup.error||orderup.frames>frame+10,frame);assert.equal(await page.evaluate(()=>orderup.error),null);await page.evaluate(()=>orderup.controller.pause());
 assert.deepEqual(externalRequests,[],'Store and reward fulfillment must make no external requests');
 const report={free_coins_button:true,title_purchase_survives_continue:true,portrait_store:true,all_gold_packs:true,silver_upgrades:true,cancel_without_purchase:true,duplicate_click_grants_once:true,save_reload:true,resume_after_store:true,no_external_requests:true,before,saved,restored};
 fs.writeFileSync(new URL('analysis/store-browser-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await session.close();}
