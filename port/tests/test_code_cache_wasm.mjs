/** Preparing translation blocks must not run the game or alter its state. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
import {completionCodeBlocks} from '../runtime/optimizations.mjs';
const require=createRequire(import.meta.url),bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js',uc=await require(bundle)({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),P=0x700000;let hook;
try{
 r.map(P,4096);r.write(P,new Uint8Array(Uint32Array.of(0xe2800007,0xe12fff1e).buffer));r.write(P+0x100,new Uint8Array(Uint16Array.of(0x3003,0x4770).buffer));let executions=0;hook=r.engine.hook_add(uc.HOOK_CODE,()=>{executions++;},null,0,0xffffffff);
 for(let i=0;i<13;i++)r.reg(i,0x12345600+i);for(let i=0;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,0x3f800000+i);r.cpuRegister(uc.ARM_REG_CPSR,0xa0000010);r.cpuRegister(uc.ARM_REG_FPSCR,0x9f);
 const state=()=>({regs:Array.from({length:16},(_,i)=>r.reg(i)),cpsr:r.cpuRegister(uc.ARM_REG_CPSR),fpscr:r.cpuRegister(uc.ARM_REG_FPSCR),fpexc:r.cpuRegister(uc.ARM_REG_FPEXC),floats:Array.from({length:32},(_,i)=>r.cpuRegister(uc.ARM_REG_S0+i)),heap_top:r.heapTop,blocks:[...r.blocks],calls:[...r.calls],memory:r.mappings.filter(([a,b])=>a<r.heapStart).map(([a,b])=>[a,b,createHash('sha256').update(r.read(a,b-a)).digest('hex')])});
 const before=state(),fake=r.prepareCodeCache([P,P+0x101]),game=r.prepareCodeCache([...completionCodeBlocks]);assert.deepEqual(state(),before);assert.equal(executions,0);assert.equal(fake.prepared,2);assert.equal(game.prepared,completionCodeBlocks.length);assert.equal(r.hasExecuted,undefined);assert.equal(r.hasTranslations,true);
 // Writes after translation but before the first instruction must invalidate.
 r.write(P,new Uint8Array(Uint32Array.of(0xe2800009,0xe12fff1e).buffer));assert.equal(await r.call(P,[5]),14);assert.equal(await r.call(P+0x101,[5]),8);assert(executions>0);
 assert.throws(()=>r.prepareCodeCache([0]));assert.throws(()=>r.prepareCodeCache([0xdead0000]));r.inCall=true;assert.throws(()=>r.prepareCodeCache([P]));r.inCall=false;
 const report={passed:true,bundle,all_registers_vfp_flags_and_original_image_unchanged:true,no_guest_instructions_executed_during_preparation:true,mixed_arm_thumb_modes_preserved:true,code_write_invalidation_before_first_execution:true,fake,game};fs.writeFileSync(new URL('../../analysis/code-cache-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{if(hook!==undefined)r.engine.hook_del(hook);r.close();}
