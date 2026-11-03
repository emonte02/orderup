/** Mouse-only gameplay helpers. Native memory reads are observation, never game-state edits. */
export async function tap(page,x,y,wait=400){
 const b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);await page.mouse.down();await new Promise(r=>setTimeout(r,100));await page.mouse.up();await new Promise(r=>setTimeout(r,wait));
}
export async function drag(page,x1,y1,x2,y2,milliseconds=300){
 const b=await page.locator('canvas').boundingBox(),tx=x=>b.x+x*b.width/960,ty=y=>b.y+y*b.height/640;
 await page.mouse.move(tx(x1),ty(y1));await page.mouse.down();
 for(let i=1;i<=8;i++){await page.mouse.move(tx(x1+(x2-x1)*i/8),ty(y1+(y2-y1)*i/8));await new Promise(r=>setTimeout(r,milliseconds/8));}
 await page.mouse.up();
}
export async function tutorialState(page){return page.evaluate(()=>{const r=orderup.runtime,p=r.u32(0x45dc20),data=p?r.u32(p+0x14):0;return data?r.u32(data):0;});}
export async function waitState(page,crc,timeout=90000){
 await page.waitForFunction(crc=>{if(orderup.state==='failed')throw Error(orderup.error);const r=orderup.runtime,p=r.u32(0x45dc20),data=p?r.u32(p+0x14):0;return data&&r.u32(data)===crc;},crc,{timeout});
}
export async function waitVoice(page,number,{finished=true,after=500,timeout=90000}={}){
 const part='_tut_'+String(number).padStart(2,'0')+'_en.';
 await page.waitForFunction(({part,finished})=>{if(orderup.state==='failed')throw Error(orderup.error);const a=orderup.runtime.audio;return a.history.some(name=>name.includes(part))&&(!finished||![...a.players].some(p=>p.name.includes(part)));},{part,finished},{timeout});
 if(after)await new Promise(r=>setTimeout(r,after));
}
export async function waitUnlocked(page,timeout=30000){await page.waitForFunction(()=>orderup.state==='failed'||orderup.runtime.u32(0x45d8d0+0x68)===0,null,{timeout});if(await page.evaluate(()=>orderup.error))throw Error(await page.evaluate(()=>orderup.error));}
export async function screenshot(page,path){await page.screenshot({path});}

export async function inspectTutorial(page){return page.evaluate(()=>{
 const r=orderup.runtime,p=r.u32(0x45dc20),state=p?r.u32(p+0x14):0;if(!state)return null;
 const words=Array.from({length:14},(_,i)=>r.u32(state+i*4)),rows=(address,count,width)=>address?Array.from({length:count},(_,row)=>Array.from({length:width},(_,column)=>r.u32(address+(row*width+column)*4))):[];
 return {state:words[0],native_enter:words[1],native_update:words[2],native_exit:words[3],transitions:rows(words[7],words[8],5),handlers:rows(words[9],words[10],3),input_mask:r.u32(0x45d8d0+0x68),kitchen_mode:r.u32(0x45d720+0x3c)};
});}
