/** Direct math bindings retain the existing float32 host-Math ABI bit for bit. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
import {bitsFloat,floatBits} from '../runtime/memory.mjs';
const require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),names=['sinf','cosf','tanf','acosf','asinf','atanf','ceilf','floorf'],functions=[Math.sin,Math.cos,Math.tan,Math.acos,Math.asin,Math.atan,Math.ceil,Math.floor],special=[0,0x80000000,1,0x80000001,0x7fffff,0x807fffff,0x800000,0x80800000,0x3f000000,0xbf000000,0x3f800000,0xbf800000,0x3f800001,0xbf800001,0x3fc90fdb,0x40490fdb,0xc0490fdb,0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc01234,0xffc01234,0x7fa01234,0xffa01234];let seed=918273,checks=0;const inputs=[...special];for(let i=0;i<384;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;inputs.push(seed);}
try{
 assert(uc._ou_hot_native_math_bind);
 for(const mode of ['baseline','accelerated','fallback']){
  r.nativeHot.setEnabled(mode==='accelerated');
  for(const[kind,name]of names.entries()){
   const address=r.resolveImport({name}),relocations=r.elf.relocations.filter(rel=>rel.symbol?.name===name&&!rel.symbol.section&&(rel.type===21||rel.type===22));assert(relocations.length,name+' original import relocations');for(const rel of relocations)assert.equal(r.u32(rel.address),address,name+' direct imported binding');
   for(const[index,bits]of inputs.entries()){
    const label=mode+' '+name+' '+bits.toString(16),expected=floatBits(functions[kind](bitsFloat(bits))),flags=((index&15)<<28)|((index&16)<<23)|((index&15)<<16)|0x10,control=((index%4)<<22)|(((index>>2)&3)<<24)|(index&31);
    r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,address,[bits]);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,flags);r.cpuRegister(uc.ARM_REG_FPSCR,control);for(let i=4;i<=11;i++)r.reg(i,0x12345600+i);for(let i=0;i<32;i++)r.cpuRegister(uc.ARM_REG_S0+i,(bits+i)>>>0);r.engine.context_save(r.main.ctx);
    assert.equal(await r.runUntilMainIdle({label:'float Math ABI'}),expected,label+' float32 bits');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,flags>>>0,label+' all CPU flags');assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,control>>>0,label+' FPSCR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12345600+i,label+' callee r'+i);for(let i=0;i<32;i++)assert.equal(r.cpuRegister(uc.ARM_REG_S0+i)>>>0,(bits+i)>>>0,label+' untouched S'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7,label+' stack');checks++;
   }
  }
 }
 r.nativeHot.setEnabled(true);const P=0x700000;r.map(P,4096);r.write(P,Uint8Array.from([0x00,0xb5,0x02,0x4b,0x98,0x47,0x00,0xbd,0x00,0xbf,0x00,0xbf]));for(const[kind,name]of names.entries()){r.u32(P+12,r.resolveImport({name}));assert.equal(await r.call(P+1,[0x3f000000]),floatBits(functions[kind](.5)),name+' Thumb caller interworking');checks++;}
 const ports=r.nativeHot.report();assert(ports.native_math_operations.every(n=>n>0));const report={functions:names,inputs_per_function:inputs.length,comparison_checks:checks,existing_host_math_float32_bits_unchanged:true,thumb_caller_interworking:true,signed_zero_subnormals_extreme_values_and_nan_payloads:true,nonfinite_and_domain_fallback:true,all_rounding_modes_and_float_controls:true,callee_registers_and_all_vfp_state_preserved:true,original_import_relocations_and_live_toggle:true,ports};fs.writeFileSync(new URL('../../analysis/math-wasm-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
