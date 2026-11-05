import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/cleanup-vertex-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64')),SP=(r.main.stack-0x100)&~7,entry=r.elf.address(v.name),site=entry+0x78;
let checks=0;
try{
 assert(uc._ou_hot_native_cleanup_vertices_bind);r.map(P,v.size);r.renderHot.setEnabled(false);const original=r.read(site,8);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');if(mode==='original')r.write(site,original);else{r.u32(site,0xe51ff004);r.u32(site+4,0x0f009000+388);}
  for(const c of v.cases){r.write(P,unpack(c.before));r.write(SP-0x100,unpack(c.stack_before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,entry,c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=4;i<=11;i++)r.reg(i,0x12340000+i);for(let i=16;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,0x12345600+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original dish cleanliness'}),label=mode+' '+c.seed;assert.equal(result,c.result,label+' result');assert.deepEqual(Buffer.from(r.read(P,v.size)),unpack(c.after),label+' full memory and dirty maps');assert.deepEqual(Buffer.from(r.read(SP-0x100,0x100)),unpack(c.stack_after),label+' complete original stack');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);for(let i=16;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,c.float_callee[i-16]>>>0,label+' s'+i);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.cleanup_vertex_batches>0);const report={original_cases:v.cases.length,comparisons:checks,original_y_then_x_sum_and_all_float_bits:true,all_arm_rounding_flush_and_default_nan_modes:true,exact_dirty_maps_and_stack:true,overlapping_dirty_maps_and_vertex_stack_alias_fallbacks:true,registers_flags_and_float_state:true,ports};fs.writeFileSync(new URL('analysis/cleanup-vertices-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
