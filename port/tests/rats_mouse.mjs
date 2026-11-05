/** Flick visible rats with the real browser mouse; native memory is observation. */
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function ratsState(page){return page.evaluate(()=>{
 const r=orderup.runtime,m=r.u32(r.elf.address('_ZN24RatsInTheKitchenMinigame9g_ManagerE')),g=r.u32(r.elf.address('_ZN3Gfx11g_Manager3DE')),base=r.u32(m+0x50),total=r.u32(m+0x80),rats=[];
 const f=p=>r.f32(p),c=r.u32(g+0x408),up=[0x24,0x28,0x2c].map(o=>f(c+o)),z=[0x34,0x38,0x3c].map(o=>-f(c+o)),position=[0x54,0x58,0x5c].map(o=>f(c+o)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],right=cross(z,up),length=Math.hypot(...right),axisX=right.map(v=>v/length),axisY=cross(z,axisX),scale=1/Math.tan(f(c+0x64)*Math.PI/360),aspect=1.5*f(g+0x3f4),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),project=(x,y,z)=>{const d=[x-position[0],y-position[1],z-position[2]],w=-dot(d,[-f(c+0x34),-f(c+0x38),-f(c+0x3c)]);return{x:480*(1-scale/aspect*dot(axisX,d)/w),y:320*(1+scale*dot(axisY,d)/w),w};};
 if(total<128)for(let i=0;i<total;i++){const p=base+i*0x50,obj=r.u32(p),state=r.u32(p+0x2c);if(obj)rats.push({index:i,state,...project(f(obj+0xa0),f(obj+0xa4),f(obj+0xa8))});}
 return{phase:r.u32(m+0x64),remaining:f(m+0x90),cleared:r.u32(m+0x68),total,rats,error:orderup.error};
 });}
export async function playRatsRound(page,{timeout=95000,stateOnly=false}={}){
 if(stateOnly)return ratsState(page);
 const began=Date.now(),first=await ratsState(page),attempts=[],box=await page.locator('canvas').boundingBox();const click=async(x,y,wait=35)=>{await page.mouse.move(box.x+x*box.width/960,box.y+y*box.height/640);await page.mouse.down();await delay(20);await page.mouse.up();await delay(wait);};let primed=false,lastPrime=0;
 while(Date.now()-began<timeout){const s=await ratsState(page);if(s.error)throw Error(s.error);if(s.phase>=2)break;
 if(s.phase!==1){await page.waitForTimeout(60);continue;}if(!primed){await click(30,220,80);primed=true;lastPrime=Date.now();continue;}
 const rat=s.rats.find(x=>x.state===1&&x.w>0&&x.x>20&&x.x<940&&x.y>50&&x.y<605);
 if(!rat){if(s.rats.some(x=>x.state===1)&&Date.now()-lastPrime>1200){await click(30,220,60);lastPrime=Date.now();}else await page.waitForTimeout(80);continue;}await click(rat.x,rat.y,35);const after=await ratsState(page);attempts.push({rat,before:s.cleared,after:after.cleared,remaining:s.remaining});
 }
 return{mouse_only_input:true,native_state_reads_only:true,first,last:await ratsState(page),attempts,elapsed_ms:Date.now()-began};
}
