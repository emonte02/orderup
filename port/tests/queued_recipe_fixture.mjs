/** Choose a recipe only for an untouched future party in isolated QA.
 * The original party-entry loader must subsequently load all its recipe assets. */
import {originalOrderState} from './order_state.mjs';
export async function chooseFutureQueuedRecipe(page,id,recipeCRC){
 if(new URL(page.url()).port==='8147')throw Error('Never alter the user game profile');
 await page.evaluate(()=>orderup.controller.pause());
 const order=(await originalOrderState(page)).find(order=>order.id===id);
 if(!order||order.ingredients.some(i=>i.prepared||i.plated||i.actions||i.cook_seconds))throw Error('Future recipe requires an untouched order');
 return page.evaluate(async({order,recipeCRC})=>{
  const r=orderup.runtime,restaurants=r.u32(r.elf.address('_ZN10Restaurant9g_ManagerE')),restaurant=await r.call('_ZN10Restaurant7Manager20GetCurrentRestaurantEv',[restaurants]);
  if(!restaurant)throw Error('A different party must already be active in a kitchen');
  const party=r.u32(restaurant+0x5c),count=party?r.u32(party+0x1c):0;
  if(count<1||count>4)throw Error('No valid current kitchen party');
  const activeIds=Array.from({length:count},(_,i)=>r.u32(r.u32(party+0xc+i*4)+0x10));
  if(activeIds.includes(order.id))throw Error('Never replace an active or displayed recipe');
  const customer=r.u32(order.instance+0x24);
  if(!customer||r.u32(customer+0x10)!==order.id||order.ingredients.some(i=>r.u32(i.instance+0x24)!==0xffffffff))throw Error('Future customer or unused-vessel precondition failed');
  const manager=r.u32(r.elf.address('_ZN5Order9g_ManagerE')),recipes=r.u32(r.elf.address('_ZN6Recipe9g_ManagerE')),definition=await r.call('_ZN6Recipe7Manager9GetRecipeE10checksum32',[recipes,recipeCRC]);
  if(!definition||!await r.call('_ZN6Recipe7Manager16IsRecipeUnlockedE10checksum32',[recipes,recipeCRC]))throw Error('Recipe must already be available through the menu');
  const counter=r.u32(manager+8);await r.call('_ZN5Order7Manager10ClearOrderEi',[manager,order.id]);r.u32(manager+8,order.id);let newId;
  try{newId=await r.call('_ZN5Order7Manager10PlaceOrderE10checksum32PN8Customer8InstanceEbS1_',[manager,recipeCRC,customer,0,0xffffffff]);}finally{r.u32(manager+8,counter);}
  const instance=await r.call('_ZN5Order7Manager8GetOrderEi',[manager,newId]);
  if(newId!==order.id||!instance||r.u32(instance+0x20)!==definition||r.u32(instance+0x24)!==customer)throw Error('Future recipe identity was not preserved');
  return{synthetic_test_fixture:true,order_id:newId,recipe_crc:recipeCRC,active_order_ids:activeIds,customer_preserved:true,order_counter_preserved:true,ingredient_preparation_modified:false,requires_original_party_asset_loading:true};
 },{order,recipeCRC});
}
