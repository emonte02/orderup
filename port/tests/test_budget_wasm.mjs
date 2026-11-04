/** Long pure-CPU loops must resume at the exact PC after deadline preemption. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js',create=require(bundle),uc=await create({print:()=>{},printErr:()=>{}}),elf=fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url));
const r=new ArmRuntime(uc,elf),other=new ArmRuntime(uc,elf),results=[];
try{
 r.map(0x700000,4096);other.map(0x700000,4096);
 const arm=Uint32Array.of(0xe2800001,0xe2511001,0x1afffffc,0xe12fff1e),thumb=Uint16Array.of(0x3001,0x3901,0xd1fc,0x4770);
 for(const runtime of [r,other]){runtime.write(0x700000,new Uint8Array(arm.buffer));runtime.write(0x700100,new Uint8Array(thumb.buffer));}
 const stops=runtime=>uc._ou_budget_stops(runtime.nativeBudget)>>>0;
 for(const[address,label]of[[0x700000,'ARM'],[0x700101,'Thumb']]){
  const before=stops(r),start=performance.now(),expected=1500000;assert.equal(await r.call(address,[0,expected]),expected);const after=stops(r);assert(after>before,label+' loop was long enough to be preempted');results.push({mode:label,iterations:expected,preemptions:after-before,elapsed_ms:performance.now()-start});
 }
 const otherBefore=stops(other);assert.equal(await other.call(0x700000,[7,10000]),10007);assert.equal(await r.call(0x700101,[3,123]),126);assert.equal(stops(other),otherBefore,'Small call has independent engine budget');
 console.log(JSON.stringify({passed:true,bundle,independent_engine_budgets:true,results},null,2));
}finally{r.close();other.close();}
