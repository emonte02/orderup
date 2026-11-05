import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/assoc-merge-native-vectors.json',root))),P=v.base,SH=P+0x8000,DH=P+0x8100,unpack=s=>inflateSync(Buffer.from(s,'base64'));let current,calls=[],copies=0,checks=0;
const moveObjects=()=>{for(const[handle,dest,owner]of[[SH,P+0x10000,P+0xe500],[DH,P+0x12000,P+0xe510]]){r.write(dest,r.read(r.u32(handle),0x900));r.u32(dest-12,owner);r.write(dest-2,Uint8Array.of(16,0));r.u32(owner+4,handle);r.u32(handle,dest);}};
const record=(kind,a)=>{calls.push({kind,args:kind==='getter'?a.slice(0,1):a,sp:r.reg(13),memory:createHash('sha256').update(r.read(P,v.size)).digest('hex')});};
try{
 assert(uc._ou_hot_native_assoc_merge_bind);r.map(P,0x20000);r.u32(P+0x1f100,0xe590001c);r.u32(P+0x1f104,0xe12fff1e);const copyAddress=r.elf.address(v.copy),copyTrampoline=P+0x1f180;r.write(copyTrampoline,r.read(copyAddress,8));r.u32(copyTrampoline+8,0xe51ff004);r.u32(copyTrampoline+12,copyAddress+8);
 r.replaceFunction(v.copy,()=>{const a=[0,1,2,3].map(i=>r.arg(i)),tag=r.u32(a[2]),complex=!!(tag&0x600)||[8,9,10,12].includes(tag&31);if(!complex)return r.invoke(copyTrampoline,a);record('copy',a);copies++;if(current.seed%23===0)r.u32(a[0],0);else{r.u32(a[1]+4,0x12340000+copies);r.u32(a[1],3);r.u32(a[0],1);if(current.seed%7===0&&copies===1)moveObjects();}return a[0];});
 for(const[i,kind]of['resize','getter','error'].entries()){
  r.function('qa:merge-'+kind,()=>{const a=[0,1,2,3].map(i=>r.arg(i));record(kind,a);if(kind==='resize'){if(current.seed%11===0)r.u32(a[0],0);else{r.u32(a[1]+0x18,Math.max(a[2],64));r.u32(a[0],1);if(current.seed%13===0)moveObjects();}return a[0];}if(kind==='getter'){const source=a[0]===r.u32(SH);if(source&&current.seed%17===0)r.u32(a[0]+0x1c,Math.max(1,Math.floor(current.count/2)));return a[0]+(source?current.src_offset:current.dst_offset);}r.u32(P+0xe700,r.u32(P+0xe700)+1);return 0;});r.u32(P+0x1f000+i*0x20,0xe51ff004);r.u32(P+0x1f004+i*0x20,r.trap('qa:merge-'+kind));
 }
 const site=r.elf.address(v.name)+0x5e4,accelerated=r.read(site,8);r.renderHot.setEnabled(false);const original=r.read(site,8);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.write(site,mode==='original'?original:accelerated);
  for(const c of v.cases){current=c;calls=[];copies=0;r.write(P,unpack(c.before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=4;i<=11;i++)r.reg(i,0x12340000+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original complete table merge'}),label=mode+' '+c.seed;assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' callbacks, order, arguments, stack and memory');const actual=Buffer.from(r.read(P,v.size)),expected=unpack(c.after);if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' memory at '+(P+i).toString(16)+': '+actual.subarray(i,i+32).toString('hex')+' != '+expected.subarray(i,i+32).toString('hex'));}assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.script_merge_items>0);const report={original_cases:v.cases.length,comparisons:checks,full_merged_tables_and_handles:true,overwrite_recursive_and_literal_semantics:true,real_scalar_copy_implementation:true,complex_copy_and_resize_failures_and_object_movement:true,custom_getters_and_error_callbacks:true,exact_callback_order_arguments_stack_and_memory:true,wrapped_reference_counts_and_output_aliases:true,integer_and_floating_point_state:true,ports};fs.writeFileSync(new URL('analysis/assoc-merge-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
