/** Measure a loaded original scene after warm-up; never changes guest progress. */
export async function measureGraphicsMode(page,enabled,{frames=120,warmup=20,nativeHot}={}){
 await page.evaluate(async({enabled,nativeHot})=>{await orderup.controller.pause();if(nativeHot!==undefined)orderup.runtime.nativeHot.setEnabled(nativeHot);orderup.runtime.graphicsBatch.setEnabled(enabled);orderup.timings=[];orderup.frameTimes=[];},{enabled,nativeHot});
 const start=await page.evaluate(()=>orderup.frames);await page.evaluate(()=>orderup.controller.resume());await page.waitForFunction(({start,frames})=>orderup.state==='failed'||orderup.frames>=start+frames,{start,frames},{timeout:120000});await page.evaluate(()=>orderup.controller.pause());
 return page.evaluate(({enabled,warmup})=>{
  if(orderup.error)throw Error(orderup.error);const times=orderup.timings.slice(warmup),sorted=[...times].sort((a,b)=>a-b),frameTimes=orderup.frameTimes.slice(warmup);
  return{graphics_batch:enabled,samples:times.length,mean_ms:times.reduce((a,b)=>a+b,0)/times.length,median_ms:sorted[Math.floor(sorted.length/2)],p95_ms:sorted[Math.floor(sorted.length*0.95)],observed_fps:(frameTimes.length-1)*1000/(frameTimes.at(-1)-frameTimes[0]),batch:orderup.runtime.graphicsBatch.report(),native_c_ports:orderup.runtime.nativeHot?.report()||null,graphics_errors:orderup.runtime.graphics.errors};
 },{enabled,warmup});
}
