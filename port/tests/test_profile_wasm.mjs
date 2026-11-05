/** The optional profiler must observe blocks without changing guest behavior. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.profile.js',uc=await require(bundle)({print:()=>{},printErr:()=>{}}),elf=fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url)),r=new ArmRuntime(uc,elf),other=new ArmRuntime(uc,elf),P=0x700000;let profile=0;
const flush=runtime=>assert.equal(uc.ccall('uc_ctl','number',['pointer','number','pointer'],[uc.getValue(runtime.engine.handle_ptr,'*'),0x4000000a,0]),0);
try{
 assert(uc._ou_profile_create);for(const runtime of[r,other]){runtime.map(P,8192);runtime.write(P,new Uint8Array(Uint32Array.of(0xe2800001,0xe2511001,0xe5820000,0x1afffffb,0xe12fff1e).buffer));runtime.write(P+0x100,new Uint8Array(Uint16Array.of(0x3001,0x3901,0x6010,0xd1fb,0x4770).buffer));}
 const cases=[[P,31],[P,10000],[P,250000],[P+0x101,17000]],expected=[];
 async function run(address,n){r.write(P+4096,new Uint8Array(4096).fill(0xa5));const result=await r.call(address,[7,n,P+4096]);return{result,registers:Array.from({length:16},(_,i)=>r.reg(i)),flags:r.cpuRegister(uc.ARM_REG_CPSR),fpscr:r.cpuRegister(uc.ARM_REG_FPSCR),memory:r.read(P+4096,4096)};}
 for(const[address,n]of cases)expected.push(await run(address,n));
 const handle=uc.getValue(r.engine.handle_ptr,'*');profile=uc._ou_profile_create(handle,P,P+4095,67);assert(profile);flush(r);uc._ou_profile_enable(profile,1);
 for(let i=0;i<cases.length;i++)assert.deepEqual(await run(...cases[i]),expected[i]);
 const used=uc._ou_profile_count(profile,0),seen=uc._ou_profile_count(profile,1),sampled=uc._ou_profile_count(profile,2),dropped=uc._ou_profile_count(profile,3),data=uc._ou_profile_data(profile),rows=new Uint32Array(uc.HEAPU8.buffer,data,used*3).slice();assert(used>1&&seen>250000&&sampled>1000);assert.equal(dropped,0);let hits=0;for(let i=0;i<rows.length;i+=3){assert(rows[i]>=P&&rows[i]<P+4096);assert(rows[i+1]>0);hits+=rows[i+2];}assert.equal(hits,sampled);
 await other.call(P,[0,10000,P+4096]);assert.equal(uc._ou_profile_count(profile,1),seen);
 uc._ou_profile_enable(profile,0);assert.deepEqual(await run(...cases[1]),expected[1]);assert.equal(uc._ou_profile_count(profile,1),seen);uc._ou_profile_clear(profile);assert.equal(uc._ou_profile_count(profile,0),0);assert.equal(uc._ou_profile_count(profile,1),0);
 uc._ou_profile_destroy(profile);profile=0;flush(r);assert.deepEqual(await run(...cases[1]),expected[1]);
 const report={passed:true,bundle,arm_and_thumb_memory_registers_flags_unchanged:true,independent_engines:true,enable_disable_clear_and_destroy:true,used,seen,sampled,dropped};fs.writeFileSync(new URL('../../analysis/native-profile-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{if(profile)uc._ou_profile_destroy(profile);r.close();other.close();}
