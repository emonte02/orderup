/** Original memory-range order, exact shifts, wrap and guarded ARM fallbacks. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js',uc=await require(bundle)({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root))),v=JSON.parse(fs.readFileSync(new URL('analysis/blackout-native-vectors.json',root)));let checks=0;
try{
 assert(uc._ou_hot_native_blackout_bind);r.map(v.base,v.size);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.write(v.stack,inflateSync(Buffer.from(c.stack_before,'base64')));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.names[c.kind]),c.initial.slice(0,4));r.engine.context_restore(r.main.ctx);for(let i=0;i<13;i++)r.reg(i,c.initial[i]);r.reg(13,v.sp);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=0;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,(c.seed*31+i*17)>>>0);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original memory-range bookkeeping'}),label=JSON.stringify({mode,kind:c.kind,seed:c.seed});assert.equal(result,c.registers[0],label+' result');for(let i=0;i<12;i++)assert.equal(r.reg(i),c.registers[i],label+' R'+i);assert.equal(r.reg(13),v.sp,label+' SP');assert.equal(r.reg(14),c.registers[14],label+' original return link');assert.deepEqual(r.read(v.base,v.size),new Uint8Array(inflateSync(Buffer.from(c.after,'base64'))),label+' all memory ranges');assert.deepEqual(r.read(v.stack,v.stack_size),new Uint8Array(inflateSync(Buffer.from(c.stack_after,'base64'))),label+' exact original stack writes');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR including Q/GE');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');for(let i=0;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,c.s[i]>>>0,label+' S'+i);checks++;
  }
 }
 // Actual Thumb calls exercise the same ARM entry and return interworking.
 const wrapper=v.base+0xf200;for(let kind=0;kind<v.names.length;kind++){const c=v.cases.find(x=>x.kind===kind&&x.seed===2);r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.write(wrapper,Uint8Array.from([0x00,0xb5,0x02,0x4b,0x98,0x47,0x00,0xbd,0x00,0xbf,0x00,0xbf]));r.u32(wrapper+12,r.elf.address(v.names[kind]));assert.equal(await r.call(wrapper+1,c.initial.slice(0,4)),c.registers[0],'Thumb caller '+kind);checks++;}
 // Oversized inputs retain the original body before changing any arguments.
 for(const kind of [0,1])for(const count of [1024,1025]){const P=v.base,owner=P+0x100;for(let i=0;i<count;i++){r.u32(owner+0x860+i*12,i+1);r.u32(owner+0x864+i*12,i+30);r.u32(owner+0x868+i*12,i+40);}r.u32(owner+0x3860,count);const before=r.read(P,v.size),args=[owner,0x80000000,1,1];r.renderHot.setEnabled(false);r.nativeHot.setEnabled(true);const expectedResult=await r.call(v.names[kind],args),expected=r.read(P,v.size),flags=r.cpuRegister(uc.ARM_REG_CPSR),registers=[0,1,2,3].map(i=>r.reg(i));r.write(P,before);r.renderHot.setEnabled(true);assert.equal(await r.call(v.names[kind],args),expectedResult,'oversized fallback '+kind+':'+count);assert.deepEqual(r.read(P,v.size),expected);assert.equal(r.cpuRegister(uc.ARM_REG_CPSR),flags);assert.deepEqual([0,1,2,3].map(i=>r.reg(i)),registers);checks++;}
 const ports=r.nativeHot.report();assert(ports.blackout_operations.every(n=>n>0));const report={bundle,original_cases:v.cases.length,comparison_checks:checks,duplicate_start_order_and_first_removal:true,exact_12_byte_shifts_and_stale_tail:true,unsigned_wrap_and_raw_16_bit_flags:true,maximum_table_sizes_and_oversized_fallbacks:true,all_resource_and_stack_memory:true,live_registers_callee_registers_flags_and_vfp_unchanged:true,thumb_caller_interworking:true,ports};fs.writeFileSync(new URL('analysis/blackout-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
