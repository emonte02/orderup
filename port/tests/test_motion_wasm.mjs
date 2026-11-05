import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),P=0x700000,handler=P+0x1000,device=P+0x2000,manager=P+0x3000,size=0x8000;
const consumers=[['tilt','_ZN23KnifeSharpeningMinigame7Manager20s_handle_touchscreenERN3Mim7HandlerIS0_EE',0x0f00c000],['shake','_ZN19AsleepOnJobMinigame7Manager20s_handle_touchscreenERN3Mim7HandlerIS0_EE',0x0f00c040]],modes=[],pulse=[];let checks=0,calls=[];
try{
 r.map(P,0x10000);r.onMotionMode=m=>modes.push(m);
 const shakeName='_ZN19AsleepOnJobMinigame7Manager23CalculateShakeIntensityEib';
 const shakeSymbol=r.elf.symbols.find(s=>s.name.includes('CalculateShakeIntensity'));
 assert(shakeSymbol,'Original shake scoring function');
 r.replaceFunction(shakeSymbol.name,()=>{calls.push({args:[0,1,2].map(i=>r.arg(i)),sp:r.reg(13),callee:Array.from({length:8},(_,i)=>r.reg(4+i))});return 0x1234;});
 for(const[kind,name,trampoline]of consumers){
  const entry=r.elf.address(name),patched=r.read(entry,8),original=r.read(trampoline,8);if(kind==='shake')new DataView(original.buffer).setUint32(4,0xeddf7a1f,true);
  for(const value of [-2,-1,-.7,-.01,0,.35,.9,1,2])for(const shaking of [false,true]){
   r.motion.reset();r.motion.setTilt(value);if(shaking)r.motion.shake();
   r.write(P,new Uint8Array(size).fill(0x35));r.u32(handler+0x10,device);r.u32(handler+0x1c,manager);r.u32(manager+0x58,0);const before=r.read(P,size),sp=(r.main.stack-0x100)&~7;
   calls=[];r.motion.beginFrame();const actualResult=await r.call(name,[handler]),actual={result:actualResult,memory:r.read(P,size),calls:structuredClone(calls),flags:r.cpuRegister(uc.ARM_REG_CPSR),fpscr:r.cpuRegister(uc.ARM_REG_FPSCR),callee:Array.from({length:8},(_,i)=>r.reg(4+i)),sp:r.reg(13)};r.motion.endFrame();assert.equal(r.motion.mode,kind);assert.equal(actual.sp,sp);
   const injectedGravity=r.read(device+0x150,16),injectedAcceleration=r.read(device+0x170,16);pulse.push({kind,shaking,y:r.f32(device+0x174)});assert.equal(r.f32(device+0x154),Math.fround(Math.max(-1,Math.min(1,value))));
   r.motion.beginFrame();r.motion.endFrame();assert.equal(r.motion.mode,null);assert.deepEqual(r.read(device+0x150,16),before.slice(0x2150,0x2160));assert.deepEqual(r.read(device+0x170,16),before.slice(0x2170,0x2180));assert.equal(r.u8(device+0x5b8),0x35);
   r.write(P,before);r.write(device+0x150,injectedGravity);r.write(device+0x170,injectedAcceleration);r.u8(device+0x5b8,1);r.write(entry,original);calls=[];
   const expectedResult=await r.call(name,[handler]),expected={result:expectedResult,memory:r.read(P,size),calls:structuredClone(calls),flags:r.cpuRegister(uc.ARM_REG_CPSR),fpscr:r.cpuRegister(uc.ARM_REG_FPSCR),callee:Array.from({length:8},(_,i)=>r.reg(4+i)),sp:r.reg(13)};r.write(entry,patched);assert.deepEqual(actual,expected,kind+' '+value+' '+shaking);checks++;
  }
 }
 // A held button must not become an automatic permanent acceleration source.
 r.motion.reset();r.motion.shake();await new Promise(resolve=>setTimeout(resolve,200));r.write(P,new Uint8Array(size));r.u32(handler+0x10,device);r.u32(handler+0x1c,manager);r.motion.beginFrame();await r.call(consumers[1][1],[handler]);r.motion.endFrame();assert.equal(r.f32(device+0x174),0);r.motion.reset();
 assert.throws(()=>r.motion.setTilt(NaN));assert(pulse.some(x=>x.kind==='shake'&&x.shaking&&Math.abs(x.y)>1.2));assert(pulse.every(x=>x.kind==='shake'||x.y===0));
 const report={comparisons:checks,original_motion_consumers_and_thresholds:true,original_scoring_callback_arguments_and_stack:true,full_memory_flags_and_registers:true,hardware_fields_restored:true,user_force_untouched:true,finite_bounded_tilt:true,shake_pulse_expires:true};fs.writeFileSync(new URL('../../analysis/motion-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
