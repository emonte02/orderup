/** Read-only original order evidence. Pause the frame controller before use. */
export async function originalOrderState(page){
 return page.evaluate(async()=>{
  if(orderup.state!=='paused'||orderup.runtime.inCall)throw Error('Pause before inspecting original orders');
  const r=orderup.runtime,manager=r.u32(r.elf.address('_ZN5Order9g_ManagerE')),ingredientManager=r.u32(r.elf.address('_ZN10Ingredient9g_ManagerE'));
  const head=manager+0xc,orders=[],seen=new Set();let node=r.u32(head);
  const float=bits=>{const v=new DataView(new ArrayBuffer(4));v.setUint32(0,bits,true);return v.getFloat32(0,true);};
  while(node!==head){
   if(!node||seen.has(node)||seen.size>=64)throw Error('Invalid native order list');seen.add(node);
   const order=r.u32(node+4);if(!order)throw Error('Empty native order node');
   const definition=r.u32(order+0x20),count=r.u32(definition+0x10),table=r.u32(order+0x10),ingredients=[];
   if(count>32)throw Error('Unexpected native ingredient count');
   for(let i=0;i<count;i++){
    const id=r.u32(table+i*4),instance=await r.call('_ZN10Ingredient7Manager13GetIngredientEi',[ingredientManager,id]);
    if(!instance){ingredients.push({id,instance:null});continue;}
    const def=r.u32(instance+0x10),flags=r.u8(instance+0x3c);
    ingredients.push({id,instance,definition_crc:r.u32(def+0xc),prepared:!!(flags&1),plated:!!(flags&2),has_spices:!!await r.call('_ZN10Ingredient8Instance12HasAnySpicesEv',[instance]),required_actions:r.u32(def+0x180)|0,actions:r.u32(instance+100),cook_seconds:float(await r.call('_ZN10Ingredient8Instance11GetCookTimeEv',[instance])),perfect_seconds:r.f32(def+0x38)});
   }
   orders.push({id:r.u32(order+0x1c),instance:order,ingredient_count:count,prepared:!!await r.call('_ZN5Order8Instance10IsPreparedEv',[order]),plated:!!await r.call('_ZN5Order8Instance8IsPlatedEv',[order]),ingredients});node=r.u32(node);
  }
  return orders;
 });
}
/** Fortified Chef shows the opponent's dish before resetting it for the player. */
export async function waitForFreshOrder(page,id,{timeout=90000,requirePreview=true}={}){
 const start=Date.now();let sawPreview=!requirePreview;
 while(Date.now()-start<timeout){
  await page.evaluate(()=>orderup.controller.pause());
  const current=(await originalOrderState(page)).find(order=>order.id===id);
  if(current&&!current.prepared&&current.ingredients.length&&current.ingredients.every(ingredient=>ingredient.plated))sawPreview=true;
  if(sawPreview&&current&&current.ingredients.length&&current.ingredients.every(ingredient=>!ingredient.plated)){await page.evaluate(()=>orderup.controller.resume());await page.waitForTimeout(8000);await page.evaluate(()=>orderup.controller.pause());return current;}
  const error=await page.evaluate(()=>orderup.error);if(error)throw Error(error);
  await page.evaluate(()=>orderup.controller.resume());await page.waitForTimeout(2000);
 }
 await page.evaluate(()=>orderup.controller.pause());throw Error('Original order '+id+' did not reset for the player');
}
