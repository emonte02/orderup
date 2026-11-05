/** Newsboy Nosedive: click visible flying papers using original camera data.
 * Native state is observed only; scoring, timing and wave logic remain native. */
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function pratfallState(page){return page.evaluate(()=>{
 const r=orderup.runtime,m=r.u32(r.elf.address('_ZN22PratfallPickupMinigame9g_ManagerE')),g=r.u32(r.elf.address('_ZN3Gfx11g_Manager3DE')),c=r.u32(g+0x408),f=p=>r.f32(p),up=[0x24,0x28,0x2c].map(o=>f(c+o)),z=[0x34,0x38,0x3c].map(o=>-f(c+o)),position=[0x54,0x58,0x5c].map(o=>f(c+o)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],right=cross(z,up),length=Math.hypot(...right),x=right.map(v=>v/length),y=cross(z,x),scale=1/Math.tan(f(c+0x64)*Math.PI/360),aspect=1.5*f(g+0x3f4),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),papers=[];
 const project=p=>{const d=[0xa0,0xa4,0xa8].map((o,i)=>f(p+o)-position[i]),w=-dot(z,d);return{x:480*(1-scale/aspect*dot(x,d)/w),y:320*(1+scale*dot(y,d)/w),w};};
 for(let node=r.u32(m+0x264),i=0;node!==m+0x264&&i<128;node=r.u32(node),i++){const p=r.u32(node+4);if(!p)break;const obj=r.u32(p+0x30);if(obj&&r.u8(p+0x5d)&&!r.u8(p+0x59)&&!r.u8(p+0x58))papers.push({p,obj,...project(obj)});}
 const introPapers=[0xac,0x104,0x15c].map(offset=>{const p=m+offset,obj=r.u32(p);return obj?{obj,landed:!r.u8(p+0x50),...project(obj)}:null}).filter(Boolean);
 const front=orderup.qaPratfallFront,rider=front?r.u32(front+0x68):0,primary=front?r.u32(front+0x74):0;if(primary)introPapers.unshift({obj:primary,landed:!r.u8(front+0x74+0x50),primary:true,...project(primary)});
 return{rider:rider?{obj:rider,...project(rider)}:null,introPapers,phase:r.u32(m+0x4c),elapsed:f(m+0x240),duration:f(m+0x38),coins:r.u32(m+0x44)>>>16,active:r.u8(m+0x238),papers,camera_fov_aspect:f(c+0x68),error:orderup.error};
 });}
export async function playPratfallRound(page,{timeout=100000,stateOnly=false}={}){
 if(stateOnly)return pratfallState(page);
 const began=Date.now(),first=await pratfallState(page),attempts=[],b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);let active=false;
 while(Date.now()-began<timeout){const s=await pratfallState(page);if(s.error)throw Error(s.error);if(s.phase>=4||active&&!s.active)break;if(s.phase!==3){await delay(50);continue;}active=true;if(s.camera_fov_aspect!==0)throw Error('Unexpected original camera FOV aspect');const paper=s.papers.find(p=>p.w>0&&p.x>15&&p.x<945&&p.y>60&&p.y<595);if(!paper){await delay(35);continue;}await move(paper.x,paper.y);await page.mouse.down();await delay(25);await page.mouse.up();await delay(45);const after=await pratfallState(page);attempts.push({paper,before:s.coins,after:after.coins,elapsed:s.elapsed});}
 return{mouse_only_input:true,native_state_reads_only:true,camera_projection_checked_against_original:true,first,last:await pratfallState(page),attempts,elapsed_ms:Date.now()-began};
}
