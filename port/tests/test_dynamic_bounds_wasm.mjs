import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/dynamic-bounds-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64')),SP=(r.main.stack-0x100)&~7,entry=r.elf.address(v.name),site=entry+0x28;
let current,calls=[],checks=0;
try{
 assert(uc._ou_hot_native_dynamic_bounds_bind);r.map(P,0x30000);r.renderHot.setEnabled(false);const original=r.read(site,8);
 for(const[i,name]of v.callbacks.entries())r.replaceFunction(name,()=>{const a=Array.from({length:3},(_,i)=>r.arg(i));calls.push({kind:i,args:a,sp:r.reg(13),callee:Array.from({length:8},(_,i)=>r.reg(i+4)),memory:createHash('sha256').update(r.read(P,v.size)).digest('hex'),stack:Buffer.from(r.read(SP-0x120,0x120))});r.u32(P+0x1f000,r.u32(P+0x1f000)+1);r.cpuRegister(uc.ARM_REG_FPSCR,r.cpuRegister(uc.ARM_REG_FPSCR)^0x11);if(i===2){for(let k=0;k<8;k++)r.u32(a[0]+k*4,current.seed*12345+k*77);return a[0];}return i===1?P+0x6000:a[0];});
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');if(mode==='original')r.write(site,original);else{r.u32(site,0xe51ff004);r.u32(site+4,0x0f009000+392);}
  for(const c of v.cases){current=c;calls=[];r.write(P,unpack(c.before));r.write(SP-0x120,unpack(c.stack_before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,entry,c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=4;i<=11;i++)r.reg(i,0x12340000+i);for(let i=16;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,0x12345600+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original dynamic bounds'}),label=mode+' '+c.seed;assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls.map(x=>({...x,stack:unpack(x.stack)})),label+' original callbacks, memory, stack and live registers');assert.deepEqual(Buffer.from(r.read(P,v.size)),unpack(c.after),label+' full memory');assert.deepEqual(Buffer.from(r.read(SP-0x120,0x120)),unpack(c.stack_after),label+' complete original stack');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);for(let i=16;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,c.float_callee[i-16]>>>0,label+' s'+i);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.dynamic_bounds_batches>0);const report={original_cases:v.cases.length,comparisons:checks,all_active_vertex_bounds_and_signed_zero:true,empty_and_all_inactive_meshes:true,exceptional_float_and_alias_fallbacks:true,complete_original_stack_and_callbacks:true,registers_flags_and_float_state:true,ports};fs.writeFileSync(new URL('analysis/dynamic-bounds-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
