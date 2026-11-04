import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),create=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),uc=await create({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),vectors=JSON.parse(fs.readFileSync(new URL('../../analysis/gc-graph-native-vectors.json',import.meta.url))),symbols=vectors.symbols;
try{r.nativeHot.setScriptMarkInlining?.(false);
 assert(uc._ou_hot_native_gc_bind,'Requires GC traversal ports');r.map(0x700000,0x10000);const put=(p,...v)=>v.forEach((n,i)=>r.u32(p+i*4,n)),calls=[],delegate=(target)=>{const object=r.arg(0);calls.push({target,object});r.u32(object+0x1c,1);return 0;};
 const installDelegates=()=>{for(const name of ['_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv'])r.replaceFunction(name,()=>delegate(symbols[name]));};installDelegates();
 const trap=r.trap('test:complex-mark');r.function('test:complex-mark',()=>delegate(0x704100));put(0x704100,0xe51ff004,trap);put(0x704200,0xe2800040,0xe12fff1e);
 for(const enabled of [false,true]){
  r.renderHot.setEnabled(enabled);installDelegates();
  for(const c of vectors.cases){r.write(0x700000,new Uint8Array(0x3000));const offset=c.getter.includes('ObjectObject')?0x24:c.getter.includes('ClassObject')?0x2c:c.getter==='unknown'?0x40:0x20;
   put(0x702010,symbols._ZN3CVM11ArrayObject12MarkAllItemsEv);put(0x702110,symbols._ZN3CVM5Assoc12MarkAllItemsEv);put(0x702170,c.getter==='unknown'?0x704200:symbols[c.getter]);put(0x702210,0x704100);[0x700000,0x700400,0x700800,0x700c00,0x700d00,0x700e00,0x700f00].forEach((object,i)=>put(0x701800+i*4,object));
   put(0x700000,0x702000);put(0x700018,9);put(0x700400,0x702100);put(0x700414,c.weak);put(0x70041c,2);put(0x700800,0x702000);put(0x700818,2);put(0x700820,0x1008,0x701800,1,33);put(0x700d08,0x70180c);put(0x700f00,0x702200);
   [[1,123],[5,0x70180c],[6,0x701810],[7,0x701814],[0x1008,0x701808],[0x1009,0x701804],[15,0x701100],[16,0x701200],[0x100a,0x701818]].forEach(([kind,value],i)=>put(0x700020+i*8,kind,value));put(0x700400+offset,5,0x70180c,0x1008,0x701808,0x100a,0x701818,7,0x701814);
   const root=c.root_kind==='array'?0x700000:0x700400;if(c.already_marked)put(root+0x14,(c.root_kind==='array'?0:c.weak)|0x20);const before=r.read(0x700000,0x3000);calls.length=0;await r.call(c.root_kind==='array'?'_ZN3CVM11ArrayObject12MarkAllItemsEv':'_ZN3CVM5Assoc12MarkAllItemsEv',[root]);const after=r.read(0x700000,0x3000),changes=[];for(let i=0;i<after.length;i++)if(before[i]!==after[i])changes.push({offset:i,value:after[i]});assert.deepEqual(changes,c.changes,JSON.stringify({enabled,...c}));assert.deepEqual(calls,c.delegates,JSON.stringify({enabled,...c}));assert.equal(r.reg(4),0,'Callee-saved R4');assert.equal(r.reg(13),(r.main.stack-0x100)&~7,'Guest stack restored');assert.equal(r.nativeHot.report().gc_active_frames,0,'Native continuation frames released');
  }
 }
 console.log(JSON.stringify({passed:true,original_arm_graph_cases:vectors.cases.length,checks_in_original_and_accelerated_modes:vectors.cases.length*2,cyclic_graphs:true,weak_references:true,all_original_getter_layouts:true,unknown_getter_delegation:true,delegate_order_preserved:true,callee_saved_registers_and_stack_preserved:true,native_ports:r.nativeHot.report()},null,2));
}finally{r.close();}
