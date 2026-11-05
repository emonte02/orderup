import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url);
const uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root))),v=JSON.parse(fs.readFileSync(new URL('analysis/digest-native-vectors.json',root)));
let checks=0;const unpack=s=>inflateSync(Buffer.from(s,'base64'));
try{
 assert(uc._ou_hot_native_digest_bind);r.map(v.base,v.size);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   r.write(v.base,unpack(c.before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),c.args);r.engine.context_restore(r.main.ctx);r.reg(13,v.stack);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);
   for(let i=4;i<=12;i++)r.reg(i,(0x87654321+i*0x11111111)>>>0);r.write(v.stack-256,unpack(c.stack_before));r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original digest'}),label=mode+' '+c.seed;
   assert.equal(result,c.result,label+' return');assert.deepEqual(Buffer.from(r.read(v.base,v.size)),unpack(c.after),label+' memory');
   // Exclude the eight dead bytes used for the original saved-register frame.
   const stack=Buffer.from(r.read(v.stack-256,512)),expected=unpack(c.stack_after);if(c.args.some((p,i)=>p<v.stack&&p+(i?32:256)>v.stack-8))assert.deepEqual(stack,expected,label+' aliased stack');else {assert.deepEqual(stack.subarray(0,248),expected.subarray(0,248),label+' lower stack');assert.deepEqual(stack.subarray(256),expected.subarray(256),label+' upper stack');}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),c.callee[i-4],label+' r'+i);assert.equal(r.reg(13),v.stack,label+' SP');checks++;
  }
 }
 const report={original_cases:v.cases.length,comparison_checks:checks,overlap_and_unaligned_buffers:true,stack_alias_fallback:true,all_live_memory_and_flags:true,ports:r.nativeHot.report()};assert(report.ports.save_block_digests>0);fs.writeFileSync(new URL('analysis/digest-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
