import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),create=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),uc=await create({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),vectors=JSON.parse(fs.readFileSync(new URL('../../analysis/cvm-mark-native-vectors.json',import.meta.url)));
try{
 assert(uc._ou_guest_variant_mark,'Requires marking C port');r.map(0x700000,0x10000);const calls=[],put=(p,...words)=>words.forEach((v,i)=>r.u32(p+i*4,v));
 for(const name of ['_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv'])r.replaceFunction(name,()=>{calls.push({target:vectors.symbols[name],object:r.arg(0)});return 0;});
 const trap=r.trap('test:virtual-mark');r.function('test:virtual-mark',()=>{calls.push({target:0x704000,object:r.arg(0)});return 0;});put(0x704000,0xe51ff004,trap);
 for(const c of vectors.cases){r.write(0x700000,new Uint8Array(0x1000));put(0x700000,c.kind|c.item_flag,0x700100);put(0x700100,0x700200);put(0x700200,0x700500);put(0x700510,0x704000);put(0x700218,c.initial_mark);put(0x700208,0x700300);put(0x700300,0x700400);put(0x700418,c.initial_mark);const before=r.read(0x700000,0x1000);calls.length=0;await r.call('_ZN3CVM7Variant4MarkEv',[0x700000]);const after=r.read(0x700000,0x1000),changes=[];for(let i=0;i<after.length;i++)if(before[i]!==after[i])changes.push({offset:i,value:after[i]});assert.deepEqual(changes,c.changes,JSON.stringify(c));assert.deepEqual(calls,c.delegates,JSON.stringify(c));}
 console.log(JSON.stringify({passed:true,original_arm_mark_cases:vectors.cases.length,all_32_types_checked:true,weak_item_flag_checked:true,complex_mark_delegation_preserved:true,native_ports:r.nativeHot.report()},null,2));
}finally{r.close();}
