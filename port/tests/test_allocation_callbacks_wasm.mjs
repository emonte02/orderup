import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}});
const r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),P=0x700000,size=0x1e000,heap=P,manager=P+0x400,ref=P+0x800,nested=P+0x600,nestedManager=P+0x900,nestedRef=P+0xa00;
let scenario=0,events=[];const expected=[];let checks=0;
try{
 assert(uc._ou_hot_native_memmanager_bind);r.map(P,0x20000);
 const record=kind=>events.push({kind,args:[r.arg(0),r.arg(1),r.arg(2)],memory:createHash('sha256').update(r.read(P,size)).digest('hex')});
 r.function('test:allocation-inner',()=>{record('inner');r.u32(nestedManager+0x14,123);return P+0x1a000;});
 r.function('test:allocation-outer',()=>{
  record('outer');
  if(scenario===2)assert.equal(r.invoke(r.elf.address('_ZN3XPL4Heap5allocERjj'),[nested,nestedRef,0]),P+0x1a010);
  if(scenario>=4){r.u32(heap+8,nestedManager);r.u32(ref,9999);r.u32(nestedManager+0x14,0xfffffff0);r.u32(heap+0x44,0xffffffe0);r.u32(heap+0x40,0xffffffff);}
  const result=scenario===1?0:P+0x18000;
  if(scenario===3){r.reg(0,result);r.jump(r.reg(14));r.active.state='sleep';r.active.wake=r.virtualMs+2;return;}
  return result;
 });
 for(const [offset,name]of [[0x1f000,'outer'],[0x1f020,'inner']]){r.u32(P+offset,0xe51ff004);r.u32(P+offset+4,r.trap('test:allocation-'+name));}
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(scenario=0;scenario<8;scenario++){
   r.write(P,new Uint8Array(size).fill(0xa5));
   for(const [h,m,f,v,t]of [[heap,manager,P+0x1000,P+0x1100,P+0x1f000],[nested,nestedManager,P+0xb00,P+0xb20,P+0x1f020]]){
    r.u32(h+8,m);r.u32(h+0x34,f);r.u32(h+0x38,0x1234);r.u32(h+0x40,7);r.u32(h+0x44,100);r.u32(m+0x30,16);r.u32(m+0x14,200);r.u32(m+0x18,9);r.u32(f,v);r.u32(v,t);
   }
   r.u32(ref,64);r.u32(nestedRef,32);events=[];
   const result=await r.call('_ZN3XPL4Heap5allocERjj',[heap,ref,(scenario&1)?0x10100:0]),answer={result,events:structuredClone(events),memory:Buffer.from(r.read(P,size))};
   if(mode==='original')expected[scenario]=answer;else assert.deepEqual(answer,expected[scenario],JSON.stringify({mode,scenario}));
   for(let i=4;i<=11;i++)assert.equal(r.reg(i),0);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);assert.equal(r.inCall,false);assert.equal(r.main.state,'idle');checks++;
  }
 }
 const report={checks,callback_arguments_order_and_memory:true,callback_mutations_and_latched_request_size:true,nested_guest_allocation:true,cooperative_sleep_and_resume:true,callee_registers_and_stack:true,no_suspended_guest_calls:true};
 fs.writeFileSync(new URL('../../analysis/allocation-callback-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
