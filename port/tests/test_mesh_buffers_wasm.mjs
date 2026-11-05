import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),v=JSON.parse(fs.readFileSync(new URL('analysis/mesh-buffers-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64'));let r,current,calls=[],checks=0;
const graphics={supportsCommandBatch:true,supportsMeshBatch:true,call(name,proxy){const args=Array.from({length:name==='glVertexAttribPointer'?6:1},(_,i)=>proxy.arg(i));calls.push({name,args});if(current.mutating&&name==='glVertexAttribPointer'){r.u32(current.buffer+0x18,r.u32(current.buffer+0x18)+4);r.u8(current.args[0]+0x62,0);r.u32(current.args[0]+0xec,calls.length&1?32:0);}return 0;}};
r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{graphics,optimizeMemory:false});
try{
 assert(uc._ou_hot_native_mesh_buffers_bind);r.map(P,0x20000);const entry=r.elf.address(v.name),accelerated=r.read(entry,8);r.renderHot.setEnabled(false);const original=r.read(entry,8);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.write(entry,mode==='original'?original:accelerated);
  for(const c of v.cases){current=c;calls=[];r.graphicsBatch.setEnabled(!c.mutating);r.write(P,unpack(c.before));r.u32(v.cache_slot,P+0x3000);r.u32(v.manager,P+0x5000);r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,entry,c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=1;i<=11;i++)r.reg(i,0x12340000+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original mesh buffers'}),label=mode+' '+c.seed;assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' complete ordered graphics arguments');const actual=Buffer.from(r.read(P,v.size)),expected=unpack(c.after);if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' memory at '+(P+i).toString(16)+': '+actual.subarray(i,i+24).toString('hex')+' != '+expected.subarray(i,i+24).toString('hex'));}assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.mesh_attribute_batches>0);const report={original_cases:v.cases.length,comparisons:checks,full_ordered_graphics_command_stream:true,all_attribute_formats_stride_and_offsets:true,client_arrays_and_vertex_buffers:true,cache_alias_and_capability_fallbacks:true,disabled_batching_and_callback_mutations:true,live_memory_flags_and_callee_registers:true,ports};fs.writeFileSync(new URL('analysis/mesh-buffers-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
