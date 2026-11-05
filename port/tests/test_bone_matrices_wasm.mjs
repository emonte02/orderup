import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/bone-matrix-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64'));
let seed=0,calls=[],checks=0;
try{
 assert(uc._ou_hot_native_bone_matrices_bind);r.map(P,0x20000);
 r.replaceFunction(v.upload,()=>{const a=[0,1,2].map(i=>r.arg(i));calls.push({args:a,sp:r.reg(13),data:createHash('sha256').update(r.read(P,v.size)).digest('hex'),matrices:Buffer.from(r.read(a[1],0xe00)),callee:Array.from({length:8},(_,i)=>r.reg(i+4))});r.u32(P+0x1b000,r.u32(P+0x1b000)+1);r.u32(a[1]+(seed%896)*4,seed*1777);r.cpuRegister(uc.ARM_REG_FPSCR,r.cpuRegister(uc.ARM_REG_FPSCR)^0x11);return(a[0]+seed)>>>0;});
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){seed=c.seed;calls=[];r.write(P,unpack(c.before));r.write(v.buffer,unpack(c.stack_before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),[...c.args,0x12345678]);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=4;i<=11;i++)r.reg(i,0x12340000+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original bone matrix upload'}),label=mode+' '+seed;assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls.map(x=>({...x,matrices:unpack(x.matrices)})),label+' upload arguments, stack, matrices, registers and memory');assert.deepEqual(Buffer.from(r.read(P,v.size)),unpack(c.after),label+' memory');assert.deepEqual(Buffer.from(r.read(v.buffer,0xf00)),unpack(c.stack_after),label+' full original stack');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.bone_matrix_batches>0);const report={original_cases:v.cases.length,comparisons:checks,all_56_initialized_matrices:true,selected_bone_order_and_raw_float_bits:true,full_original_stack_and_live_memory:true,mesh_skeleton_and_bone_stack_alias_fallbacks:true,original_upload_callback_arguments_stack_registers_and_mutations:true,flags_and_callee_registers:true,ports};fs.writeFileSync(new URL('analysis/bone-matrices-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
