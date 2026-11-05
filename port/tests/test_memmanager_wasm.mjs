import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url);
const uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}});
const r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)));
const vectors=JSON.parse(fs.readFileSync(new URL('analysis/memmanager-native-vectors.json',root)));
let checks=0,seed=0;const calls=[];
try{
 assert(uc._ou_hot_native_memmanager_bind);r.map(vectors.base,0x20000);r.function('test:foreign-alloc',()=>{calls.push({args:[r.arg(0),r.arg(1),r.arg(2)],memory:createHash('sha256').update(r.read(vectors.base,vectors.size)).digest('hex')});return seed&1?0:vectors.base+0x18000;});r.u32(vectors.base+0x1f000,0xe51ff004);r.u32(vectors.base+0x1f004,r.trap('test:foreign-alloc'));
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of vectors.cases){
   seed=c.seed;calls.length=0;r.write(vectors.base,inflateSync(Buffer.from(c.before,'base64')));
   r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(vectors.names[c.kind]),c.args);
   r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original save cipher'}),label=JSON.stringify({mode,kind:c.kind,seed:c.seed});
   assert.equal(result,c.result,label+' return');assert.deepEqual(calls,c.calls,label+' foreign allocator order, arguments and memory');
   const actual=Buffer.from(r.read(vectors.base,vectors.size)),expected=inflateSync(Buffer.from(c.after,'base64'));
   if(!actual.equals(expected)){let first=0;while(actual[first]===expected[first])first++;assert.fail(label+' memory at '+(vectors.base+first).toString(16)+': '+actual.subarray(first,first+24).toString('hex')+' != '+expected.subarray(first,first+24).toString('hex'));}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');
   for(let i=4;i<=11;i++)assert.equal(r.reg(i),0,label+' callee r'+i);
   assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.memory_manager_operations>0);
 const report={original_cases:vectors.cases.length,comparison_checks:checks,all_memory_and_allocator_counters:true,forward_and_reverse_heap_chains:true,size_and_heap_output_aliases:true,foreign_allocator_fallback_equivalence:true,original_return_and_float_state:true,ports};
 fs.writeFileSync(new URL('analysis/memmanager-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
