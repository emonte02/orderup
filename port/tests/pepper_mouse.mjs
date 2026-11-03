/** Pepper Chop integration driver: original prompt observation plus real mouse strokes. */
import fs from 'node:fs';
const vectors=JSON.parse(fs.readFileSync(new URL('../../analysis/pepper-gesture-vectors.json',import.meta.url))).gestures;
export async function pepperState(page){return page.evaluate(()=>{
 const r=orderup.runtime,m=r.u32(0x440808);if(!m)return{loaded:false,error:orderup.error};
 const p=r.u32(m+0x9c),d=p?r.u32(p+0x18):0;
 return{loaded:true,error:orderup.error,phase:r.u32(m+0x5c),remaining:r.f32(m+100),score:r.u32(m+0xbc),pepper:p,gesture:d?r.str(d+0x10):null,active:p?r.u8(p+0x61):0,done:p?r.u8(p+0x24):1,blocked:r.u8(m+0xc4)};
});}
export async function drawPepperGesture(page,name,{pixelScale=1.4,stepMs=55,cornerMs=90}={}){
 const strokes=vectors[name];if(!strokes)throw Error('Unknown original pepper gesture '+name);
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);let from=[400,250];
 await move(...from);await page.mouse.down();await page.waitForTimeout(60);
 try{for(const stroke of strokes){const length=Math.hypot(...stroke.direction),to=[from[0]+stroke.direction[0]/length*stroke.length*pixelScale,from[1]+stroke.direction[1]/length*stroke.length*pixelScale];
  for(let step=1;step<=4;step++){await move(from[0]+(to[0]-from[0])*step/4,from[1]+(to[1]-from[1])*step/4);await page.waitForTimeout(stepMs);}await page.waitForTimeout(cornerMs);from=to;
 }}finally{await page.mouse.up();}
}
export async function playPepperRound(page,{timeout=100000,onProgress=()=>{}}={}){
 const began=Date.now(),attempts=[];let lastKey='',lastAt=0,highestScore=0,seenLoaded=false;
 while(Date.now()-began<timeout){
  const state=await pepperState(page);if(state.error)throw Error(state.error);
  if(!state.loaded){if(seenLoaded)break;await page.waitForTimeout(100);continue;}seenLoaded=true;highestScore=Math.max(highestScore,state.score);
  if(state.remaining<=0)break;
  const key=state.pepper+':'+state.gesture;
  if(state.active&&!state.done&&!state.blocked&&(key!==lastKey||Date.now()-lastAt>5000)){
   lastKey=key;lastAt=Date.now();await drawPepperGesture(page,state.gesture);const after=await pepperState(page);highestScore=Math.max(highestScore,after.score||0);const attempt={gesture:state.gesture,remaining:state.remaining,score_before:state.score,score_after:after.score};attempts.push(attempt);onProgress(attempt);
  }else await page.waitForTimeout(60);
 }
 await page.waitForTimeout(1200);const final=await pepperState(page);highestScore=Math.max(highestScore,final.score||0);
 return{mouse_only_input:true,native_state_reads_only:true,highest_score:highestScore,attempts,elapsed_ms:Date.now()-began,last_state:final};
}
