import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root))),v=JSON.parse(fs.readFileSync(new URL('analysis/region-native-vectors.json',root)));let checks=0;
try{
 assert(uc._ou_hot_native_region_bind);r.map(v.base,v.size);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of v.cases){
   r.write(v.base,inflateSync(Buffer.from(c.before,'base64')));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.names[c.kind]),c.args);r.engine.context_restore(r.main.ctx);r.reg(13,v.sp);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original region/handle operation'}),label=JSON.stringify({mode,kind:c.kind,seed:c.seed});assert.equal(result,c.registers[0],label+' return');
   assert.deepEqual(r.read(v.base,v.size),new Uint8Array(inflateSync(Buffer.from(c.after,'base64'))),label+' all region links, counters and stack aliases');
   for(let i=0;i<4;i++)assert.equal(r.reg(i),c.registers[i],label+' r'+i);assert.equal(r.reg(13),v.sp,label+' SP');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');for(let i=4;i<12;i++)assert.equal(r.reg(i),0,label+' callee r'+i);checks++;
  }
 }
 // Compare the complete long-list fallback, including region heads and all
 // neighbor links: a matching returned node alone cannot detect corruption.
 for(const direction of [0,1]){
  const region=v.base,n=4100,head=v.base+0x1000;for(let i=0;i<n;i++){const p=head+i*12;r.u32(p,i?p-12:0);r.u32(p+4,i+1<n?p+12:0);r.u32(p+8,i===(direction?n-1:0)?100:1);}r.u32(region+0x48,head);r.u32(region+0x4c,head+(n-1)*12);const before=r.read(v.base,v.size);r.renderHot.setEnabled(false);r.nativeHot.setEnabled(true);const expectedResult=await r.call(v.names[0],[region,50,direction]),expected=r.read(v.base,v.size),flags=r.cpuRegister(uc.ARM_REG_CPSR);r.write(v.base,before);r.renderHot.setEnabled(true);r.nativeHot.setEnabled(true);assert.equal(await r.call(v.names[0],[region,50,direction]),expectedResult,'long fallback return '+direction);assert.deepEqual(r.read(v.base,v.size),expected,'all long fallback region heads and links '+direction);assert.equal(r.cpuRegister(uc.ARM_REG_CPSR),flags,'long fallback flags '+direction);
 }
 const ports=r.nativeHot.report();assert(ports.region_block_selections>0&&ports.handle_acquires>0&&ports.handle_releases>0);const report={original_cases:v.cases.length,comparison_checks:checks,all_memory_registers_flags_and_stack:true,unsigned_search_thresholds:true,both_directions_and_first_fit:true,exact_link_removal_order:true,reference_wrap_and_stack_aliases:true,long_search_fallback:true,ports};fs.writeFileSync(new URL('analysis/region-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
