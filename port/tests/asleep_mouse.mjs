/** Wake the original assistant with clicks on the visible browser Shake control. */
export async function asleepState(page){return page.evaluate(()=>{const r=orderup.runtime,m=r.u32(r.elf.address('_ZN19AsleepOnJobMinigame9g_ManagerE'));return{phase:r.u32(m+0x58),remaining:r.f32(m+0x60),intensity:r.f32(m+0x80),direction:r.u32(m+0x64),requested:r.u32(m+0x68),assistant:r.u32(m+0x90),actor:r.u32(m+0x94),motion:r.motion.mode,error:orderup.error};});}
export async function playAsleepRound(page,{timeout=95000,clickDelay=125}={}){
 const first=await asleepState(page),began=Date.now(),samples=[];let clicks=0;
 while(Date.now()-began<timeout){const s=await asleepState(page);samples.push(s);if(s.error)throw Error(s.error);if(s.phase>=2)break;if(s.phase!==1||s.motion!=='shake'){await page.waitForTimeout(50);continue;}
 await page.locator('#shake').click();clicks++;await page.waitForTimeout(clickDelay);
 }
 return{mouse_only_input:true,native_state_reads_only:true,first,last:await asleepState(page),samples,clicks,elapsed_ms:Date.now()-began};
}
