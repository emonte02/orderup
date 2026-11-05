/** Original hash bit folding with exact flags and callee stack writes. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js',uc=await require(bundle)({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root))),v=JSON.parse(fs.readFileSync(new URL('analysis/link-native-vectors.json',root)));let checks=0;
try{
 assert(uc._ou_hot_native_hash_index_bind);r.map(v.base,v.size);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.write(v.stack,inflateSync(Buffer.from(c.stack_before,'base64')));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.names[c.kind]),c.initial.slice(0,4));r.engine.context_restore(r.main.ctx);for(let i=0;i<13;i++)r.reg(i,c.initial[i]);r.reg(13,v.sp);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=0;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,(c.seed*31+i*17)>>>0);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original hash bit folding'}),label=JSON.stringify({mode,kind:c.kind,seed:c.seed});assert.equal(result,c.registers[0],label+' result');for(let i=0;i<12;i++)assert.equal(r.reg(i),c.registers[i],label+' R'+i);assert.equal(r.reg(13),v.sp,label+' SP');assert.equal(r.reg(14),c.registers[14],label+' original return link');assert.deepEqual(r.read(v.base,v.size),new Uint8Array(inflateSync(Buffer.from(c.after,'base64'))),label+' all memory ranges');assert.deepEqual(r.read(v.stack,v.stack_size),new Uint8Array(inflateSync(Buffer.from(c.stack_after,'base64'))),label+' exact original stack writes');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR including Q/GE');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');for(let i=0;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,c.s[i]>>>0,label+' S'+i);checks++;
  }
 }
 // A real Thumb caller exercises interworking through the ARM helper.
 const P=v.base,wrapper=P+0xf200,c=v.cases.find(x=>x.seed===2);r.write(P,inflateSync(Buffer.from(c.before,'base64')));r.write(wrapper,Uint8Array.from([0x00,0xb5,0x02,0x4b,0x98,0x47,0x00,0xbd,0x00,0xbf,0x00,0xbf]));r.u32(wrapper+12,r.elf.address(v.names[0]));assert.equal(await r.call(wrapper+1,c.initial.slice(0,4)),c.registers[0]);checks++;
 // Inputs outside the original terminating domain must take the ARM body. Use
 // a test-only return after its unchanged prologue to observe that path.
 const entry=r.elf.address(v.names[0]),body=r.read(entry+8,8);r.u32(entry+8,0xe3a0005a);r.u32(entry+12,0xe12fff1e);
 for(const bits of[33,34,63,0x80000000,0xffffffff]){const args=[bits,0x87654321,0xfedcba98,0x12345678];r.renderHot.setEnabled(false);r.nativeHot.setEnabled(true);const expected=await r.call(v.names[0],args),flags=r.cpuRegister(uc.ARM_REG_CPSR),registers=[0,1,2,3].map(i=>r.reg(i));r.renderHot.setEnabled(true);assert.equal(await r.call(v.names[0],args),expected,'undefined width fallback '+bits);assert.equal(expected,0x5a);assert.equal(r.cpuRegister(uc.ARM_REG_CPSR),flags);assert.deepEqual([0,1,2,3].map(i=>r.reg(i)),registers);checks++;}r.write(entry+8,body);
 const ports=r.nativeHot.report();assert(ports.hash_index_calls>0);const report={bundle,original_cases:v.cases.length,comparison_checks:checks,all_original_widths_zero_through_32:true,unsigned_key_boundaries:true,exact_register_shift_and_bit_fold_order:true,undefined_width_original_fallback:true,all_stack_writes_flags_q_ge_and_vfp_unchanged:true,thumb_caller_interworking:true,ports};fs.writeFileSync(new URL('analysis/link-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
