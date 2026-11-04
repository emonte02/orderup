import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),createCPU=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),elf=fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url));
async function run(enabled){
 const events=[],graphics={supportsCommandBatch:true,call(name,r){const argc=name==='glVertexAttribPointer'?6:name==='glUniformMatrix4fv'?4:name==='glUniform4fv'?3:1,args=Array.from({length:argc},(_,i)=>r.arg(i)),data=name==='glUniform4fv'?Array.from(new Float32Array(r.read(args[2],16).buffer)):name==='glUniformMatrix4fv'?Array.from(new Float32Array(r.read(args[3],args[1]*64).buffer)):null;events.push({name,args,data});return 0;}};
 const uc=await createCPU({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,elf,{graphics,batchGraphics:enabled});
 try{
  r.map(0x700000,0x4000);const words=[0xe92d4070,0xe1a04000,0xe5940000,0xe5941004,0xe5942008,0xe594c00c,0xe12fff3c,0xe5945008,0xe3a06000,0xe5856000,0xe594c010,0xe12fff3c,0xe8bd8070];words.forEach((v,i)=>r.u32(0x700000+i*4,v));
  r.write(0x701100,new Uint8Array(new Float32Array([1,2,3,4]).buffer));r.function('graphicsBarrier',()=>{events.push({barrier:r.u32(0x701100)});return 123;});[7,1,0x701100,r.resolveImport({name:'glUniform4fv'}),r.trap('graphicsBarrier')].forEach((v,i)=>r.u32(0x701000+i*4,v));
  assert.equal(await r.call(0x700000,[0x701000]),123);assert.equal(r.u32(0x701100),0);assert.deepEqual(events[0].data,[1,2,3,4]);assert.deepEqual(events[1],{barrier:0});
  await r.call(r.resolveImport({name:'glVertexAttribPointer'}),[3,4,0x1406,0,24,0x701200]);assert.deepEqual(events.at(-1).args,[3,4,0x1406,0,24,0x701200]);
  const matrices=Float32Array.from({length:56*16},(_,i)=>i/8);r.write(0x702000,new Uint8Array(matrices.buffer));await r.call(r.resolveImport({name:'glUniformMatrix4fv'}),[9,56,0,0x702000]);assert.deepEqual(events.at(-1).data,Array.from(matrices));
  r.write(0x700100,Uint8Array.from([0x00,0xb5,0x02,0x4b,0x98,0x47,0x00,0xbd,0x00,0xbf,0x00,0xbf]));r.u32(0x70010c,r.resolveImport({name:'glEnable'}));assert.equal(await r.call(0x700101,[0xbe2]),0);
  if(enabled){r.graphicsBatch.setEnabled(false);await r.call(0x700101,[0xb71]);r.graphicsBatch.setEnabled(true);await r.call(0x700101,[0xbe2]);}
  const report=r.graphicsBatch?.report()||null;return{events,report};
 }finally{r.close();}
}
const baseline=await run(false),batched=await run(true);assert.deepEqual(batched.events.slice(0,baseline.events.length),baseline.events);assert(batched.report.original_void_calls>=4);assert(batched.report.flushes>=3);
const report={uniform_snapshot_survives_native_mutation:true,flush_precedes_synchronous_host_call:true,six_argument_stack_abi:true,original_56_bone_matrix_upload:true,thumb_interworking:true,live_batch_toggle:true,baseline_equivalent:true,graphics_batch:batched.report};fs.writeFileSync(new URL('../../analysis/'+(process.env.OU_GRAPHICS_REPORT||'graphics-batch-tests.json'),import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
