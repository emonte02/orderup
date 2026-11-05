import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),v=JSON.parse(fs.readFileSync(new URL('../../analysis/pose-native-vectors.json',import.meta.url)));let checks=0,calls=[];
try{
 assert(uc._ou_hot_native_pose_bind);r.map(v.base,v.size);r.replaceFunction(v.procedure,()=>{const args=[0,1,2].map(i=>r.arg(i));calls.push({args,memory:createHash('sha256').update(r.read(v.base,v.size)).digest('hex')});r.write(args[0],r.read(args[1]+0x60,64));return args[0];});
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   calls=[];r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=16;i<32;i++)r.cpuRegister(uc['ARM_REG_S'+i],0x12345600+i-16);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original pose transform'}),label=JSON.stringify({mode,seed:c.seed,count:c.count});assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' procedural callback arguments/memory');
   const actual=Buffer.from(r.read(v.base,v.size)),expected=inflateSync(Buffer.from(c.after,'base64'));if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' memory at '+(v.base+i).toString(16)+': '+actual.subarray(i&~3,(i&~3)+24).toString('hex')+' != '+expected.subarray(i&~3,(i&~3)+24).toString('hex'));}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0,label+' callee r'+i);for(let i=16;i<32;i++)assert.equal(r.cpuRegister(uc['ARM_REG_S'+i]),c.callee_float[i-16],label+' callee s'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.pose_bones>0);const report={original_cases:v.cases.length,comparisons:checks,all_memory_and_float_bits:true,rounding_denormals_special_values_and_sticky_flags:true,exact_cpu_and_float_flags:true,hierarchies_nonuniform_and_pose_scales:true,procedural_bone_fallback_and_callback_order:true,all_callee_registers_and_stack:true,ports};fs.writeFileSync(new URL('../../analysis/pose-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
