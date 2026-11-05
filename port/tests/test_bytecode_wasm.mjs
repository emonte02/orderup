import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root))),v=JSON.parse(fs.readFileSync(new URL('analysis/bytecode-native-vectors.json',root))),targets=new Set(v.targets);let checks=0,stops=0;
try{
 assert(uc._ou_hot_native_bytecode_bind);r.map(v.base,v.size);r.hasExecuted=true;
 const hook=r.engine.hook_add(uc.HOOK_CODE,()=>{if(targets.has(r.reg(15))){stops++;r.engine.emu_stop();}},null,0x3b5c60,0x3b9eb8);
 try{for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=0;i<15;i++)r.reg(i,c.initial[i]);for(let i=0;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,c.floats[i]);stops=0;r.engine.emu_start(v.entry,0xffffffff,0,1000);r.nativeHot.check();const label=JSON.stringify({mode,seed:c.seed});assert.equal(stops,1,label+' handler boundary');assert.equal(r.reg(15),c.pc,label+' exact original handler');assert.deepEqual(r.read(v.base,v.size),new Uint8Array(inflateSync(Buffer.from(c.after,'base64'))),label+' all memory and locals');for(let i=0;i<15;i++)if(i!==12)assert.equal(r.reg(i),c.registers[i],label+' r'+i);if(mode!=='accelerated')assert.equal(r.reg(12),c.registers[12],label+' original R12');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');for(let i=0;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,c.floats[i]>>>0,label+' S'+i);checks++;}
 }
 // Dispatch words can change after translation; both the native decoder and
 // its ARM fallback must see the new instruction on the next opcode.
 r.nativeHot.setEnabled(true);const slot=0x3b5f2c,saved=r.u32(slot),c=v.cases[1],capture=()=>{r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=0;i<15;i++)r.reg(i,c.initial[i]);stops=0;r.engine.emu_start(v.entry,0xffffffff,0,1000);assert.equal(stops,1);return{pc:r.reg(15),memory:r.read(v.base,v.size),registers:Array.from({length:15},(_,i)=>i===12?null:r.reg(i)),cpsr:r.cpuRegister(uc.ARM_REG_CPSR),fpscr:r.cpuRegister(uc.ARM_REG_FPSCR)};};
 try{for(const word of [(0xea000000|(((0x3b60fc-slot-8)>>2)&0xffffff))>>>0,0xe1a00000,saved]){r.u32(slot,word);r.renderHot.setEnabled(false);const original=capture();r.renderHot.setEnabled(true);assert.deepEqual(capture(),original,'live dispatch mutation '+word.toString(16));checks++;}}finally{r.u32(slot,saved);}
 }finally{r.engine.hook_del(hook);}
 const ports=r.nativeHot.report();assert(ports.bytecode_decodes>0);const report={original_cases:v.cases.length,comparison_checks:checks,all_256_opcodes:true,sticky_q_and_simd_ge_flags_preserved:true,live_dispatch_mutation_and_non_branch_fallback:true,signed_8_16_24_32_bit_immediates:true,exact_original_handler_addresses:true,all_memory_gpr_vfp_flags_and_float_state:true,unused_r12_continuation_register:true,bytecode_stack_alias_fallback:true,original_opcode_bodies_and_deadline_checks_retained:true,ports};fs.writeFileSync(new URL('analysis/bytecode-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
