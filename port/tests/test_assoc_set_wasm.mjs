import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),require=createRequire(import.meta.url),uc=await require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',root)),{optimizeMemory:false}),v=JSON.parse(fs.readFileSync(new URL('analysis/assoc-set-native-vectors.json',root))),P=v.base,unpack=s=>inflateSync(Buffer.from(s,'base64'));
let seed=0,calls=[],checks=0;
try{
 assert(uc._ou_hot_native_assoc_set_bind);r.map(P,0x20000);
 for(const [i,kind] of ['resize','error','getter'].entries()){
  r.function('qa:table-'+kind,()=>{const a=[0,1,2,3].map(i=>r.arg(i));calls.push({kind,args:a,sp:r.reg(13),memory:createHash('sha256').update(r.read(P,v.size)).digest('hex')});
   if(kind==='error'){r.u32(P+0xd000,r.u32(P+0xd000)+1);return 0;}
   if(kind==='getter'){if(seed%13===0)r.u32(a[0]+0x1c,2);if(seed%17===0){r.u32(P+0x8000,6);r.u32(P+0x8004,2);}return P+0x5000;}
   if(seed%7===0)r.u32(a[0],0);else{r.u32(a[1]+0x18,Math.max(16,a[2]));r.u32(a[0],1);if(seed%11===0){r.write(P+0x3000,r.read(a[1],0x200));r.u32(P+0xb004,P+0x3000);}}return a[0];
  });r.u32(P+0xf000+i*0x20,0xe51ff004);r.u32(P+0xf004+i*0x20,r.trap('qa:table-'+kind));
 }
 const entry=r.elf.address(v.name),accelerated=r.read(entry,8);r.renderHot.setEnabled(false);const original=r.read(entry,8);
 for(const mode of ['original','accelerated','fallback']){
  r.nativeHot.setEnabled(mode!=='fallback');r.write(entry,mode==='original'?original:accelerated);
  for(const c of v.cases){seed=c.seed;calls=[];r.write(P,unpack(c.before));r.active=r.main;r.engine.context_restore(r.main.ctx);r.prepare(r.main,r.elf.address(v.name),c.args);r.engine.context_restore(r.main.ctx);r.cpuRegister(uc.ARM_REG_CPSR,c.flags);r.cpuRegister(uc.ARM_REG_FPSCR,c.control);for(let i=4;i<=11;i++)r.reg(i,0x12340000+i);r.engine.context_save(r.main.ctx);
   const result=await r.runUntilMainIdle({label:'original table assignment'}),label=mode+' '+seed;
   assert.equal(result,c.result,label+' result');assert.deepEqual(calls,c.calls,label+' callback order, arguments, stack and memory');const actual=Buffer.from(r.read(P,v.size)),expected=unpack(c.after);if(!actual.equals(expected)){let i=0;while(actual[i]===expected[i])i++;assert.fail(label+' memory at '+(P+i).toString(16)+': '+actual.subarray(i,i+24).toString('hex')+' != '+expected.subarray(i,i+24).toString('hex'));}
   assert.equal(r.cpuRegister(uc.ARM_REG_FPSCR)>>>0,c.fpscr>>>0,label+' FPSCR');assert.equal(r.cpuRegister(uc.ARM_REG_CPSR)>>>0,c.cpsr>>>0,label+' CPSR');for(let i=4;i<=11;i++)assert.equal(r.reg(i),c.callee[i-4],label+' r'+i);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);checks++;
  }
 }
 const ports=r.nativeHot.report();assert(ports.script_table_assignments>0);const report={original_cases:v.cases.length,comparisons:checks,full_table_and_handle_memory:true,identifier_keys_and_flag_masks:true,aliases_and_reference_values:true,resize_failure_and_moved_object_callbacks:true,custom_getter_mutations_and_error_callbacks:true,exact_callback_arguments_order_stack_and_memory:true,integer_and_floating_point_flags:true,ports};fs.writeFileSync(new URL('analysis/assoc-set-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
