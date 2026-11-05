// Original Android product IDs; fulfillment stays inside the local game engine.
const goldPacks=[10,30,100,300,900,2000].map(amount=>({id:'gold_coins_'+amount,title:amount.toLocaleString('en-US')+' Gold Coins'}));
const silverUpgrades=[{id:'doublesilver5',title:'Double Silver Coins - 5 Shifts'},{id:'doublesilver15',title:'Double Silver Coins - 15 Shifts'},{id:'doublesilver0',title:'Double Silver Coins - Permanent'}];
const products=[...goldPacks,...silverUpgrades];
const nativePrefix='Java_com_svsgames_orderup_OrderUpJNILib_';

// Called only while the frame controller is paused. Use the same fulfillment
// callback as Android billing, with a scoped JNI string and no billing SDK/network.
export async function purchaseCoins(runtime,id){
 if(!products.some(product=>product.id===id))throw Error('Unknown coin product: '+id);
 runtime.beginJNIFrame();
 try{
  const sku=runtime.jobject({kind:'string',value:'com.svs.orderup.'+id});
  await runtime.call(runtime.elf.address(nativePrefix+'playTrack'),[runtime.jniEnv,0,sku]);
 }finally{runtime.endJNIFrame();}
}

export async function showCoinStore(state,dialog,body,silverOnly,onError){
 if(!dialog.open)return;
 const close=dialog.querySelector('#notice-close'),preventCancel=event=>event.preventDefault();
 const lock=()=>{close.disabled=true;dialog.addEventListener('cancel',preventCancel);};
 const unlock=()=>{close.disabled=false;dialog.removeEventListener('cancel',preventCancel);};
 let permanent;
 lock();
 try{
  await state.controller.pause();
  if(state.state!=='paused')return;
  permanent=await state.runtime.call(nativePrefix+'getPermanentDoubleSilverCoins',[state.runtime.jniEnv,0]);
 }finally{unlock();}
 const list=document.createElement('ul');list.style.cssText='list-style:none;padding:0';
 let purchased=false;
 for(const product of silverOnly?silverUpgrades:products){
  const row=document.createElement('li'),label=document.createElement('span'),buy=document.createElement('button');
  row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:24px;margin:12px 0';
  label.textContent=product.title;buy.type='button';buy.textContent='Buy';buy.dataset.product=product.id;
  buy.setAttribute('aria-label','Buy '+product.title);
  if(permanent&&product.id.startsWith('doublesilver')){buy.disabled=true;buy.textContent='Owned';}
  buy.addEventListener('click',async()=>{
   if(purchased||!dialog.open||!buy.isConnected||state.state!=='paused')return;
   purchased=true;for(const button of list.querySelectorAll('button'))button.disabled=true;lock();
   try{
    await purchaseCoins(state.runtime,product.id);
    await state.flushSaves();
    body.textContent=product.title+' purchased.';
   }catch(error){onError(error);}finally{unlock();}
  });
  row.append(label,buy);list.append(row);
 }
 body.replaceChildren(list);
}
