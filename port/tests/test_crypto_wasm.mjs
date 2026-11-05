import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url);
const uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}});
const r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)));
const vectors=JSON.parse(fs.readFileSync(new URL('analysis/crypto-native-vectors.json',root)));
let checks=0;
try{
 assert(uc._ou_hot_native_crypto_bind);r.map(vectors.base,vectors.size);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.renderHot.setEnabled(mode!=='original');
  for(const c of vectors.cases){
   r.write(vectors.base,inflateSync(Buffer.from(c.before,'base64')));
   r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(vectors.names[c.kind]),c.args);
   r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original save cipher'}),label=JSON.stringify({mode,kind:c.kind,seed:c.seed});
   assert.equal(result,c.result,label+' return');
   const actual=Buffer.from(r.read(vectors.base,vectors.size)),expected=inflateSync(Buffer.from(c.after,'base64'));
   if(!actual.equals(expected)){let first=0;while(actual[first]===expected[first])first++;assert.fail(label+' memory at '+(vectors.base+first).toString(16)+': '+actual.subarray(first,first+24).toString('hex')+' != '+expected.subarray(first,first+24).toString('hex'));}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');
   for(let i=4;i<=11;i++)assert.equal(r.reg(i),0,label+' callee r'+i);
   assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.save_cipher_operations>0);
 const report={original_cases:vectors.cases.length,comparison_checks:checks,all_memory_and_random_state:true,encrypted_blocks_and_decryption_modes:true,overlap_and_unusual_table_fallbacks:true,original_return_and_float_state:true,ports};
 fs.writeFileSync(new URL('analysis/crypto-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
