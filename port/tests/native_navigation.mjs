/** Synthetic unlocks stay in an isolated test browser; never used by the launcher. */
export async function makeContentFixture(page){
 await page.evaluate(()=>orderup.controller.pause());return page.evaluate(async()=>{
  const r=orderup.runtime,m=r.u32(0x44a638),a=r.u32(m+4),recipeManager=r.u32(0x440854),restaurants=[],recipes=new Set();
  for(let i=0;i<r.u32(m+8);i++){
   const p=r.u32(a+i*4),name=r.str(r.u32(p+0x14)),crc=r.u32(p+0x18),n=r.u32(p+0x58),table=r.u32(p+0x4c);if(name==='default')continue;
   restaurants.push({name,crc,recipes:n});await r.call('_ZN10Restaurant7Manager22SetRestaurantPurchasedE10checksum32b',[m,crc,1]);
   for(let j=0;j<n;j++)recipes.add(r.u32(table+j*4));
  }
  await r.call('_ZN10Restaurant7Manager20LoadPracticeCallBackEv',[]);
  for(const crc of recipes)await r.call('_ZN6Recipe7Manager12UnlockRecipeE10checksum32b',[recipeManager,crc,1]);
  return{synthetic_test_fixture:true,practice:!!r.u8(m+0x22),restaurants,recipes:recipes.size};
 });
}
/** Keep selected original recipes available so a first-day test has realistic stock. */
export async function configureRecipeFixture(page,restaurant,indices=[0,1,2]){
 await page.evaluate(()=>orderup.controller.pause());return page.evaluate(async({restaurant,indices})=>{
  const r=orderup.runtime,m=r.u32(0x44a638),a=r.u32(m+4),manager=r.u32(0x440854);let instance=0;
  for(let i=0;i<r.u32(m+8);i++){const p=r.u32(a+i*4);if(r.str(r.u32(p+0x14))===restaurant){instance=p;break;}}if(!instance)throw Error('Unknown fixture restaurant '+restaurant);
  const table=r.u32(instance+0x4c),count=r.u32(instance+0x58),recipes=[];for(let i=0;i<count;i++){const crc=r.u32(table+i*4),active=indices.includes(i);await r.call(active?'_ZN6Recipe7Manager12UnlockRecipeE10checksum32b':'_ZN6Recipe7Manager10LockRecipeE10checksum32',[manager,crc,1]);if(active)recipes.push(crc);}return{synthetic_test_fixture:true,restaurant,active_recipes:recipes};
 },{restaurant,indices});
}
