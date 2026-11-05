import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}});
const r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),v=JSON.parse(fs.readFileSync(new URL('../../analysis/array-copy-native-vectors.json',import.meta.url))),P=v.base,srcHandle=P+0x8000,destHandle=P+0x8100;
let seed=0,count=0,copies=0,calls=[],checks=0;
const reference=(tag,value,delta)=>{if(tag&0x600){const obj=tag&0x400?r.u32(value):value,word=r.u32(obj+4);r.u32(obj+4,(word&0xffff0000)|((word+delta)&0xffff));}};
const record=kind=>{const args=[0,1,2,3].map(i=>r.arg(i));calls.push({kind,args,memory:createHash('sha256').update(r.read(P,v.size)).digest('hex')});return args;};
try{
 assert(uc._ou_hot_native_array_copy_bind);r.map(P,0x20000);r.u32(P+0xf000,0xe5900018);r.u32(P+0xf004,0xe12fff1e);
 r.replaceFunction(v.new,()=>{
  const a=record('new');
  if(seed%19===0)r.u32(a[0],0);
  else{if(seed%17===0&&count){r.u32(r.u32(srcHandle)+0x20,0x103);r.u32(r.u32(srcHandle)+0x24,0x98765432);}r.u32(a[0],destHandle);const obj=r.u32(destHandle),word=r.u32(obj+4);r.u32(obj+4,(word&0xffff0000)|((word+1)&0xffff));}
  return a[0];
 });
 r.replaceFunction(v.copy,()=>{
  const a=[0,1,2,3].map(i=>r.arg(i)),inputTag=r.u32(a[2]),complex=!!(inputTag&0x600)||[8,9,10,12].includes(inputTag&31);if(complex){record('copy');copies++;}
  if(complex&&seed%11===0)r.u32(a[0],0);
  else{
   let tag=r.u32(a[2]),value=r.u32(a[2]+4);if([8,9,10,12].includes(tag&31)){tag=3;value=0x12340000+copies;}
   r.u32(a[1]+4,value);r.u32(a[1],tag);reference(tag,value,1);r.u32(a[0],1);
   if(complex&&seed%7===0&&copies===1){const oldSource=r.u32(srcHandle),oldDest=r.u32(destHandle);r.write(P+0xa000,r.read(oldSource,0x20+count*8));r.write(P+0xb000,r.read(oldDest,0x20+count*8));r.u32(srcHandle,P+0xa000);r.u32(destHandle,P+0xb000);}
  }
  return a[0];
 });
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   seed=c.seed;count=c.count;copies=0;calls=[];r.write(P,inflateSync(Buffer.from(c.before,'base64')));
   r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original array copy'}),label=JSON.stringify({mode,seed});assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' allocation and recursive callback order/arguments/memory');
   const actual=Buffer.from(r.read(P,v.size)),expected=inflateSync(Buffer.from(c.after,'base64'));if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' data at '+(P+i).toString(16)+': '+actual.subarray(i,i+24).toString('hex')+' != '+expected.subarray(i,i+24).toString('hex'));}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0,label+' callee r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.array_copy_items>0);const report={original_cases:v.cases.length,comparisons:checks,full_array_and_handle_memory:true,primitive_literal_and_identity_batches:true,recursive_fallback_and_failures:true,array_movement_during_recursive_callback:true,allocation_callback_mutations_and_failure:true,wrapped_reference_counts_and_output_aliases:true,exact_allocation_and_delegated_copy_arguments_order_and_memory:true,ports};fs.writeFileSync(new URL('../../analysis/array-copy-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
