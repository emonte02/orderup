import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),create=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),uc=await create({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),v=JSON.parse(fs.readFileSync(new URL('../../analysis/uniform-native-vectors.json',import.meta.url))),calls=[];let seed=0;
try{
 assert(uc._ou_hot_native_gfx_bind,'Requires uniform port');r.map(0x700000,0x10000);const fast=r.read(v.entry,8),original=Buffer.from(v.original_prefix,'hex');
 for(const [name,kind,bytes,arg]of [['glUniform4fv','vector',16,2],['glUniform1fv','float',4,2],['glUniformMatrix4fv','matrix',64,3]])r.function(name,()=>{const location=r.arg(0),pointer=r.arg(arg),memory=createHash('sha256').update(r.read(v.program,0x13c0)).update(r.read(v.manager,0xb2c)).digest('hex');assert.equal(r.arg(1),1);if(arg===3)assert.equal(r.arg(2),0);calls.push({kind,location,pointer,data:Buffer.from(r.read(pointer,bytes)).toString('hex'),memory});if((seed&32)&&kind==='vector'&&location===0){r.u32(v.program+0x1318+38*4,123);r.write(v.program+0x48+38*24+20,Uint8Array.of(1));}return 0;});
 for(const enabled of [false,true]){r.write(v.entry,enabled?fast:original);
  for(const c of v.cases){seed=c.seed;r.write(v.program,Buffer.from(c.before,'base64'));r.write(v.manager,Buffer.from(c.manager_before,'base64'));r.u32(v.manager_global,v.manager);calls.length=0;await r.call('_ZN3Gfx7Program15UpdateConstantsEv',[v.program]);assert.deepEqual(calls,c.calls,JSON.stringify({enabled,seed,field:'callbacks'}));assert.equal(Buffer.from(r.read(v.program,0x13c0)).toString('base64'),c.after,JSON.stringify({enabled,seed,field:'program'}));assert.equal(Buffer.from(r.read(v.manager,0xb2c)).toString('base64'),c.manager_after,JSON.stringify({enabled,seed,field:'manager'}));assert.equal(r.reg(4),0);assert.equal(r.reg(13),(r.main.stack-0x100)&~7);}
 }
 console.log(JSON.stringify({passed:true,original_arm_cases:v.cases.length,checks_original_and_accelerated:v.cases.length*2,all_guest_memory_at_every_upload:true,float32_edge_cases:true,callback_mutations:true,generation_wrap:true,stack_and_registers_preserved:true},null,2));
}finally{r.close();}
