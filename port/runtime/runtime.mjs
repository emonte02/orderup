import {ArmElf} from './elf.mjs';
import {GuestMemory} from './memory.mjs';
import {installLibc} from './libc.mjs';
import {installThreads,createTaskQueue} from './threads.mjs';
import {installMemoryHelpers,installHotHelpers,installCompatibilityGuards,installDecompressionHelper} from './optimizations.mjs';
import {createGraphicsBatch} from './graphics_batch.mjs';
import {installJNI} from './jni.mjs';
export class ArmRuntime extends GuestMemory {
 constructor(uc,elfBytes,{files=new Map(),graphics=null,audio=null,optimizeMemory=true,optimizeHot=true,optimizeDecompression=true,compatibilityFixes=true,batchGraphics=true,onSave=()=>{},log=()=>{},yieldHost}={}){
  const engine=new uc.Unicorn(uc.ARCH_ARM,uc.MODE_ARM);super(uc,engine);this.elf=new ArmElf(elfBytes);this.log=log;this.files=files;this.graphics=graphics;this.audio=audio;this.onSave=onSave;this.hostYieldQueue=yieldHost?null:createTaskQueue();this.yieldHost=yieldHost||(()=>this.hostYieldQueue.yield());
  this.regs=[...Array(13)].map((_,i)=>uc['ARM_REG_R'+i]).concat([uc.ARM_REG_SP,uc.ARM_REG_LR,uc.ARM_REG_PC]);
  this.functions=new Map();this.traps=new Map();this.trapNext=0x0f000100;this.returnTrap=0x0f000000;this.exitTrap=0x0f000004;this.map(0x0f000000,0x10000);
  this.calls=new Map();this.recentCalls=[];this.events=[];this.eventTotal=0;const pushEvent=this.events.push.bind(this.events);this.events.push=(...items)=>{this.eventTotal+=items.length;if(this.events.length>2048)this.events.splice(0,1024);return pushEvent(...items);};this.clockStart=performance.now();this.clockEpoch=Date.now();this.roundRobin=0;this.pending=null;this.active=null;this.nested=0;
  this.engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);this.engine.reg_write_i32(uc.ARM_REG_C1_C0_2,0x00f00000);this.engine.reg_write_i32(uc.ARM_REG_FPEXC,0x40000000);
  this.map(0x20000000,0x1000000);this.threads=[];this.main=this.createThreadState(1,0x20100000);this.active=this.main;this.engine.context_save(this.main.ctx);
  installLibc(this);installThreads(this);installJNI(this);
  this.graphicsBatch=batchGraphics?createGraphicsBatch(this):null;this.elf.load(this);if(optimizeMemory)installMemoryHelpers(this);if(optimizeHot)installHotHelpers(this);if(optimizeDecompression)installDecompressionHelper(this);if(compatibilityFixes)installCompatibilityGuards(this);
  this.hook=this.engine.hook_add(uc.HOOK_CODE,(_e,address)=>{this.pending=Number(address);this.engine.emu_stop();},null,0x0f000000,0x0f007fff);
  this.installBudgetHook();
  this.invalidHook=this.engine.hook_add(uc.HOOK_MEM_INVALID,(_e,type,address,size)=>{this.invalid={type,address:Number(address),size,pc:this.reg(15),lr:this.reg(14),thread:this.active?.id};return false;});
 }
 installBudgetHook(){
  if(this.budgetHook!==undefined||this.nativeBudget)return;
  this.budgetBlocks=0;this.budgetStops=0;this.sliceDeadline=Infinity;
  if(this.uc._ou_budget_create){this.nativeBudget=this.uc._ou_budget_create(this.uc.getValue(this.engine.handle_ptr,'*'));if(!this.nativeBudget)throw Error('CPU budget allocation failed');}
  else this.budgetHook=this.engine.hook_add(this.uc.HOOK_BLOCK,()=>{if((++this.budgetBlocks&127)===0&&performance.now()>=this.sliceDeadline){this.budgetStops++;this.engine.emu_stop();}},null,1,0);
  // Hooks are inserted into translated blocks. Flush when upgrading a running CPU too.
  const handle=this.uc.getValue(this.engine.handle_ptr,'*');
  const result=this.uc.ccall('uc_ctl','number',['pointer','number','pointer'],[handle,0x4000000a,0]);
  if(result)throw Error('Could not invalidate CPU translation cache: '+result);
 }
 get virtualMs(){return (this.clockPausedAt??performance.now())-this.clockStart;}
 pauseClock(){this.clockPausedAt??=performance.now();}
 resumeClock(){if(this.clockPausedAt!==undefined){this.clockStart+=performance.now()-this.clockPausedAt;delete this.clockPausedAt;}}
 reg(i,v){return this.cpuRegister(this.regs[i],v);}
 cpuRegister(id,v){
  if(!this.uc.HEAPU8){if(v===undefined)return this.engine.reg_read_i32(id)>>>0;this.engine.reg_write_i32(id,v);return;}
  this.registerScratch??=this.uc._malloc(4);const handle=this.uc.getValue(this.engine.handle_ptr,'*');let error;
  if(v===undefined){error=this.uc._uc_reg_read(handle,id,this.registerScratch);if(error)throw Error('CPU register read '+error);return this.uc.getValue(this.registerScratch,'i32')>>>0;}
  this.uc.setValue(this.registerScratch,v,'i32');error=this.uc._uc_reg_write(handle,id,this.registerScratch);if(error)throw Error('CPU register write '+error);
 }
 readABI(){
  if(!this.uc._uc_reg_read_batch)return {args:[0,1,2,3].map(i=>this.reg(i)),sp:this.reg(13)};
  if(!this.abiScratch){this.abiScratch=this.uc._malloc(64);[0,1,2,3,13].forEach((i,j)=>{this.uc.setValue(this.abiScratch+j*4,this.regs[i],'i32');this.uc.setValue(this.abiScratch+20+j*4,this.abiScratch+40+j*4,'*');});}
  const handle=this.uc.getValue(this.engine.handle_ptr,'*'),error=this.uc._uc_reg_read_batch(handle,this.abiScratch,this.abiScratch+20,5);if(error)throw Error('CPU ABI read '+error);
  return {args:[0,1,2,3].map(i=>this.uc.getValue(this.abiScratch+40+i*4,'i32')>>>0),sp:this.uc.getValue(this.abiScratch+56,'i32')>>>0};
 }
 arg(i){return i<4?(this.abiArgs?.args[i]??this.reg(i)):this.u32((this.abiArgs?.sp??this.reg(13))+4*(i-4));}
 ret(value=0){if(value!==undefined)this.reg(0,value);this.jump(this.reg(14));}
 jump(address){let flags=this.cpuRegister(this.uc.ARM_REG_CPSR)>>>0;flags=(flags&~32)|((address&1)?32:0);this.reg(15,address&~1);this.cpuRegister(this.uc.ARM_REG_CPSR,flags);}
 function(name,fn){this.functions.set(name,fn);}
 trap(name){for(const [a,n] of this.traps)if(n===name)return a;const a=this.trapNext;this.trapNext+=4;if(this.trapNext>=0x0f008000)throw Error('Import trap arena full');this.u32(a,0xe12fff1e);this.traps.set(a,name);return a;}
 resolveImport(symbol){const name=symbol.name;if(name==='__stack_chk_guard'){const p=this.malloc(16);this.u32(p,0x51adbeef);return p;}if(name==='__sF'){const p=this.malloc(3*84);for(let i=0;i<3;i++)this.streams.set(p+i*84,{console:i,position:0});return p;}return this.graphicsBatch?.bind(name)||this.trap(name);}
 replaceFunction(name,fn){const address=this.elf.address(name);if(address&1)throw Error('Only A32 replacement entry points are supported');const trapName='hle:'+name;this.function(trapName,fn);this.u32(address,0xe51ff004);this.u32(address+4,this.trap(trapName));}
 createThreadState(id,stack){const t={id,stack,ctx:this.engine.context_alloc(),state:'idle',result:0,errno:0};this.threads.push(t);return t;}
 prepare(t,address,args,returnAddress=this.returnTrap){this.cpuRegister(this.uc.ARM_REG_CPSR,0x10);this.cpuRegister(this.uc.ARM_REG_FPSCR,0);for(let i=0;i<13;i++)this.reg(i,0);this.reg(13,(t.stack-0x100)&~7);this.reg(14,returnAddress);for(let i=0;i<Math.max(args.length,4);i++){if(i<4)this.reg(i,args[i]||0);else this.u32(this.reg(13)+(i-4)*4,args[i]||0);}this.jump(address);t.state='ready';this.engine.context_save(t.ctx);}
 unsupported(name){const e={type:'unsupported',name,thread:this.active?.id,pc:this.reg(15),lr:this.reg(14),args:[0,1,2,3].map(i=>this.arg(i))};this.events.push(e);throw Error('Unsupported host call '+JSON.stringify(e));}
 dispatch(address){
  if(address===this.returnTrap||address===this.exitTrap){this.active.result=this.reg(0);this.active.state=address===this.exitTrap?'exited':'idle';if(address===this.exitTrap&&this.threadExited)this.threadExited(this.active);return;}
  const name=this.traps.get(address);if(!name)throw Error('Unknown host trap 0x'+address.toString(16));this.calls.set(name,(this.calls.get(name)||0)+1);
  const previousABI=this.abiArgs;this.abiArgs=this.readABI();try{
  this.recentCalls.push({name,lr:this.reg(14),args:[0,1,2,3].map(i=>this.arg(i))});if(this.recentCalls.length>30)this.recentCalls.shift();let fn=this.functions.get(name);if(!fn&&name.startsWith('gl')&&this.graphics)fn=()=>this.graphics.call(name,this);if(!fn&&name.startsWith('jni:'))fn=()=>this.jniCall(+name.slice(4));
  if(!fn)return this.unsupported(name);const result=fn();if(this.active.state==='ready')this.ret(result);
  }finally{this.abiArgs=previousABI;}
 }
 slice(){this.hasExecuted=true;this.pending=null;this.invalid=null;this.sliceDeadline=performance.now()+4;if(this.nativeBudget)this.uc._ou_budget_begin(this.nativeBudget,4);try{const pc=this.reg(15),thumb=this.cpuRegister(this.uc.ARM_REG_CPSR)&32;this.engine.emu_start(pc|(thumb?1:0),0xffffffff,0,0);}catch(e){throw Error(String(e)+' '+JSON.stringify({original_stack:e?.stack,invalid:this.invalid,pc:this.reg(15),lr:this.reg(14),sp:this.reg(13),thread:this.active?.id,lastEvents:this.events.slice(-8),lastCalls:this.recentCalls,registers:Array.from({length:13},(_,i)=>this.reg(i))}));}this.nativeHot?.check();this.graphicsBatch?.flush();if(this.pending!==null)this.dispatch(this.pending);}
 async call(nameOrAddress,args=[],{timeoutMs=120000}={}){
  if(this.inCall)throw Error('Overlapping guest entry points');if(this.main.state!=='idle')throw Error('A guest call is suspended; resume it before starting another');
  const address=typeof nameOrAddress==='string'?this.elf.address(nameOrAddress):nameOrAddress;this.active=this.main;this.engine.context_restore(this.main.ctx);this.prepare(this.main,address,args);
  this.currentEntry={name:nameOrAddress,started:performance.now()};const jniEntry=typeof nameOrAddress==='string'&&nameOrAddress.startsWith('Java_');if(jniEntry)this.beginJNIFrame();
  try{return await this.runUntilMainIdle({label:nameOrAddress,timeoutMs});}finally{if(jniEntry)this.endJNIFrame();this.currentEntry=null;}
 }
 async runUntilMainIdle({label='resumed call',timeoutMs=120000}={}){
  if(this.inCall)throw Error('Overlapping guest scheduler');this.inCall=true;let hostYield=performance.now(),start=hostYield;
  try{while(this.main.state!=='idle'){
   this.wakeSleepers?.();const runnable=this.threads.filter(t=>t.state==='ready');
   if(!runnable.length){const wakes=this.threads.filter(t=>t.state==='sleep').map(t=>t.wake);if(!wakes.length)throw Error('Guest threads deadlocked '+JSON.stringify(this.threads.map(({id,state,wait})=>({id,state,wait}))));await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.min(20,Math.min(...wakes)-this.virtualMs))));continue;}
   const t=runnable[this.roundRobin++%runnable.length];this.active=t;this.engine.context_restore(t.ctx);
   const sliceStart=performance.now();let n=0;t.forceYield=false;while(t.state==='ready'&&!t.forceYield&&performance.now()-sliceStart<8&&n++<500)this.slice();
   this.engine.context_save(t.ctx);this.wakeSleepers?.();
   if(performance.now()-start>timeoutMs)throw Error('Guest call time limit '+label+' '+JSON.stringify({pc:this.reg(15),threads:this.threads.map(t=>({id:t.id,state:t.state,wait:t.wait})),calls:Object.fromEntries(this.calls)}));
   if(performance.now()-hostYield>40){await this.yieldHost();hostYield=performance.now();}
  }
  this.active=this.main;this.engine.context_restore(this.main.ctx);return this.main.result;
  }finally{this.inCall=false;}
 }
 invoke(address,args=[]){
  if(++this.nested>16)throw Error('Guest callback nesting exceeded');const previousABI=this.abiArgs;this.abiArgs=null;const context=this.engine.context_alloc(),thread=this.active,state=thread.state;this.engine.context_save(context);
  try{const stack=this.reg(13)-0x1000,fpscr=this.cpuRegister(this.uc.ARM_REG_FPSCR);const temp={...thread,stack};this.prepare(temp,address,args);this.cpuRegister(this.uc.ARM_REG_FPSCR,fpscr);thread.state='ready';let n=0;while(thread.state==='ready'){this.slice();if(++n>100000)throw Error('Guest callback exceeded budget');if(thread.state!=='ready'&&thread.state!=='idle')throw Error('Blocking from synchronous guest callback');}return thread.result;}finally{this.engine.context_restore(context);this.engine.context_free(context);thread.state=state;this.nested--;this.abiArgs=previousABI;}
 }
 async initialize(){for(const [i,a] of this.elf.initializers.entries()){await this.call(a);this.log({type:'initializer',index:i,address:a});}return this.elf.loadReport;}
 async boot({width=960,height=640}={}){
  const str=s=>this.jobject({kind:'string',value:s});const args=[this.jniEnv,0,this.activity,0x3fd33333,width,height,1,str('/save/'),str('/game/orderup.apk'),str('/game/'),str('main.13.com.svsgames.orderup.obb'),str('browser'),0,0,0,0];
  await this.call('Java_com_svsgames_orderup_OrderUpJNILib_init',args,{timeoutMs:600000});
 }
 report(){return {current_entry:this.currentEntry||null,decompression:this.decompression?.report()||null,graphics_batch:this.graphicsBatch?.report()||null,native_c_ports:this.nativeHot?.report()||null,elf:this.elf.loadReport,c_accelerations:this.cAccelerations||[],compatibility_fixes:this.compatibilityFixes||[],heap_high_water:this.heapTop-this.heapStart,allocations:this.blocks.size,threads:this.threads.map(t=>({id:t.id,state:t.state,wait:t.wait})),calls:Object.fromEntries(this.calls),recent_calls:this.recentCalls,events:this.events.slice(-100),event_count:this.eventTotal,java_objects:this.javaObjects.size,graphics:this.graphics?.report?.(),audio:this.audio?.report?.()};}
 close(){this.hostYieldQueue?.close();if(this.registerScratch)this.uc._free(this.registerScratch);if(this.abiScratch)this.uc._free(this.abiScratch);if(this.scratch)this.uc._free(this.scratch);for(const t of this.threads)this.engine.context_free(t.ctx);this.engine.hook_del(this.hook);this.engine.hook_del(this.invalidHook);for(const hook of this.compatibilityHooks||[]){if(hook.native){const error=this.uc.ccall('uc_hook_del','number',['pointer','pointer'],[this.uc.getValue(this.engine.handle_ptr,'*'),hook.native]);if(error)throw Error('Could not release compatibility hook '+error);}else this.engine.hook_del(hook);}if(this.budgetHook!==undefined)this.engine.hook_del(this.budgetHook);if(this.nativeBudget)this.uc._ou_budget_destroy(this.nativeBudget);this.graphicsBatch?.close();this.nativeHot?.close();this.engine.close();this.releaseMappings();}
}
