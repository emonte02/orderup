/** Synthetic branch testing only. Never imported by the production game. */
import {originalOrderState} from './order_state.mjs';
import {readCanvasText} from './scene_helpers.mjs';
export async function completePlayerOrderForBranchTest(page,id,{opponentSeconds=600}={}){
 if(new URL(page.url()).port==='8147')throw Error('Do not run QA fixtures on the user game origin');
 await page.evaluate(()=>orderup.controller.pause());
 const text=(await readCanvasText(page)).map(row=>row.text);
 if(!text.some(line=>/^TIME\s*:/i.test(line))||!text.some(line=>/OPPONENT TIME/i.test(line)))throw Error('Fixture requires the actual player timer, after the opponent preview');
 const before=(await originalOrderState(page)).find(order=>order.id===id);
 if(!before||!before.ingredients.length||before.ingredients.some(ingredient=>ingredient.plated))throw Error('Fixture requires a fresh, unplated player order');
 const result=await page.evaluate(async({order,opponentSeconds})=>{
  const r=orderup.runtime,fc=await r.call('_ZN3Mdl7Manager9GetModuleE10checksum32',[r.u32(r.elf.address('_ZN3Mdl9g_ManagerE')),0x425ac03c]);
  if(!fc)throw Error('Fortified Chef module is absent');
  const dish=r.u32(fc+0x84),tier=r.u32(fc+0x88),controller=await r.call('_ZN3Obj7Manager9GetObjectERNS_12ObjectHandleE',[r.u32(r.elf.address('_ZN3Obj9g_ManagerE')),fc+0x98]);
  if(dish<1||dish>3||!controller)throw Error('Invalid tournament fixture preconditions');
  const opponentBefore=r.f32(fc+0x54+(dish-1)*4);
  // Original opponent times occupy +0x54..+0x5c; player times use +0x60..+0x68.
  r.f32(fc+0x54+(dish-1)*4,opponentSeconds);
  // These are the original game's complete-order preparation and plate setup.
  await r.call('_ZN5Order8Instance11SetPreparedEb',[order.instance,1]);
  await r.call('_ZN5Order8Instance9SetPlatedEv',[order.instance]);
  const prepared=!!await r.call('_ZN5Order8Instance10IsPreparedEv',[order.instance]),plated=!!await r.call('_ZN5Order8Instance8IsPlatedEv',[order.instance]);
  if(!prepared||!plated)throw Error('Original fixture preparation did not complete the order');
  const message=r.malloc(16);
  try{
   await r.call('_ZN3Obj19ChecksumGameMessageC1E10checksum32S1_',[message,0x0ea536bc,0]);
   await r.call('_ZN3Obj6Object6NotifyERNS_11GameMessageEb',[controller,message,0]);
  }finally{r.free(message);}
  return{synthetic_test_fixture:true,mouse_cooked:false,tier,dish,order_id:order.id,prepared,plated,opponent_seconds_before:opponentBefore,opponent_test_seconds:opponentSeconds,original_completion_event:'0x0ea536bc'};
 },{order:before,opponentSeconds});
 return result;
}
