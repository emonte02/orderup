import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/cipher-chain-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64'));let current,calls=[],checks=0;
try{
 assert(uc._ou_hot_native_cipher_chain_bind);r.map(P,0x20000);
 for(const [i,kind] of ['key','process'].entries()){
  r.function('qa:cipher-'+kind,()=>{const a=Array.from({length:kind==='key'?2:3},(_,i)=>r.arg(i));calls.push({kind,args:a,sp:r.reg(13),memory:createHash('sha256').update(r.read(P,v.size)).digest('hex')});if(kind==='key'){r.u32(a[0]+0x14,a[1]^0x12345678);return a[0];}r.u32(a[1],r.u32(a[1])^current.seed);return current.seed%7===0?0:1;});r.u32(P+0x1f000+i*0x20,0xe51ff004);r.u32(P+0x1f004+i*0x20,r.trap('qa:cipher-'+kind));
 }
 const entry=r.elf.address(v.name),accelerated=r.read(entry,8);r.renderHot.setEnabled(false);const original=r.read(entry,8);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.write(entry,mode==='original'?original:accelerated);
  for(const c of v.cases){current=c;calls=[];r.write(P,unpack(c.before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,entry,c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=2;i<=11;i++)r.reg(i,0x12340000+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original complete cipher chain'}),label=mode+' '+c.seed;assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' callbacks, stack, order and memory');const actual=Buffer.from(r.read(P,v.size)),expected=unpack(c.after);if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' memory at '+(P+i).toString(16)+': '+actual.subarray(i,i+32).toString('hex')+' != '+expected.subarray(i,i+32).toString('hex'));}assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),0x12340000+i,label+' r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.save_cipher_chains>0);const report={original_cases:v.cases.length,comparisons:checks,full_cipher_and_encrypted_block_memory:true,exact_permutations_random_state_list_links_and_key_order:true,encryption_and_decryption_modes:true,existing_and_empty_cipher_lists:true,alias_modified_table_and_custom_callback_fallbacks:true,callback_order_arguments_stack_and_memory:true,integer_and_floating_point_state:true,ports};fs.writeFileSync(new URL('analysis/cipher-chain-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
