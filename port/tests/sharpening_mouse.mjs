/** Original knife sharpening driven by the mouse and the visible tilt slider. */
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function sharpeningState(page){return page.evaluate(()=>{const r=orderup.runtime,m=r.u32(r.elf.address('_ZN23KnifeSharpeningMinigame9g_ManagerE'));return{phase:r.u32(m+0xf8),remaining:r.f32(m+0x110),sharpness:r.f32(m+0x134),force:r.f32(m+0x12c),angle:r.f32(m+0x160),target:r.f32(m+0x144),band:[r.f32(m+0x148),r.f32(m+0x14c)],forceBand:[r.f32(m+0x108),r.f32(m+0x10c)],flags:r.u8(m+0x164),motion:r.motion.mode,error:orderup.error};});}
async function setTiltMouse(page,value){const b=await page.locator('#tilt').boundingBox();if(!b)throw Error('Mouse tilt control is not visible');const x=b.x+8+(b.width-16)*(Math.max(-1,Math.min(1,value))+1)/2;await page.mouse.move(x,b.y+b.height/2);await page.mouse.down();await page.mouse.up();await delay(100);}
export async function playSharpeningRound(page,{timeout=95000,calibrate=false,tilt=-.5,y=350}={}){
 const first=await sharpeningState(page),began=Date.now(),samples=[],attempts=[];const move=async(x,y)=>{const b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);};
 if(calibrate){await setTiltMouse(page,tilt);await move(480,220);await page.mouse.down();try{await move(480,y);await delay(timeout);}finally{await page.mouse.up();}return{first,last:await sharpeningState(page),tilt,y};}
 while(Date.now()-began<timeout){const s=await sharpeningState(page);samples.push(s);if(s.error)throw Error(s.error);if(s.phase>=5)break;if(s.motion!=='tilt'){await delay(50);continue;}
 await setTiltMouse(page,Math.tan(s.target-1.5*Math.PI)/5);await move(480,220);await page.mouse.down();try{for(let n=0;n<12;n++){await move(480,220+n*(y-220)/11);await delay(50);}}finally{await page.mouse.up();}await delay(250);attempts.push(await sharpeningState(page));
 }
 return{mouse_only_input:true,native_state_reads_only:true,first,last:await sharpeningState(page),samples,attempts,elapsed_ms:Date.now()-began};
}
