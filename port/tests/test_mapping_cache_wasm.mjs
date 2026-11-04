/** A mapping lookup cache must preserve all public Unicorn memory semantics. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),create=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),uc=await create({print:()=>{},printErr:()=>{}}),e=new uc.Unicorn(uc.ARCH_ARM,uc.MODE_ARM);
const bytes=words=>new Uint8Array(Uint32Array.from(words).buffer),word=value=>bytes([value]);
let reads=0,writes=0;
const call=(address,p,value=0)=>{e.reg_write_i32(uc.ARM_REG_CPSR,0x10);e.reg_write_i32(uc.ARM_REG_R0,p);e.reg_write_i32(uc.ARM_REG_R1,value);e.reg_write_i32(uc.ARM_REG_LR,0x1080);e.emu_start(address,0x1080,0,0);return e.reg_read_i32(uc.ARM_REG_R0)>>>0;};
try{
 e.mem_map(0x1000,4096,uc.PROT_ALL);e.mem_write(0x1000,bytes([0xe5900000,0xe12fff1e]));e.mem_write(0x1020,bytes([0xe5801000,0xe12fff1e]));e.mem_map(0x2000,8192,uc.PROT_ALL);e.mem_write(0x2000,word(0x12345678));assert.equal(call(0x1000,0x2000),0x12345678);
 const hr=e.hook_add(uc.HOOK_MEM_READ,()=>reads++,null,0x2000,0x2fff),hw=e.hook_add(uc.HOOK_MEM_WRITE,()=>writes++,null,0x2000,0x2fff);for(let i=0;i<20;i++){call(0x1020,0x2000,i);assert.equal(call(0x1000,0x2000),i);}assert.equal(reads,20);assert.equal(writes,20);e.hook_del(hr);e.hook_del(hw);
 e.mem_protect(0x2000,4096,uc.PROT_READ);assert.equal(call(0x1000,0x2000),19);assert.throws(()=>call(0x1020,0x2000,7),/WRITE_PROT|write|code 12/i);
 e.mem_protect(0x2000,4096,uc.PROT_NONE);e.mem_write(0x2000,word(123));assert.deepEqual([...e.mem_read(0x2000,4)],[...word(123)]);assert.throws(()=>call(0x1000,0x2000),/READ_PROT|read|code 13/i);
 e.mem_protect(0x2000,4096,uc.PROT_ALL);call(0x1020,0x2000,99);assert.equal(call(0x1000,0x2000),99);
 e.mem_unmap(0x2000,4096);assert.throws(()=>call(0x1000,0x2000),/READ_UNMAPPED|read|code 6/i);e.mem_map(0x2000,4096,uc.PROT_ALL);e.mem_write(0x2000,word(42));assert.equal(call(0x1000,0x2000),42);e.mem_write(0x3000,word(77));assert.equal(call(0x1000,0x3000),77);
 e.mem_write(0x1000,bytes([0xe3a00007,0xe12fff1e]));uc._ou_memory_sync_code(uc.getValue(e.handle_ptr,'*'),0x1000,8);assert.equal(call(0x1000,0x2000),7);e.mem_write(0x1000,bytes([0xe3a00009,0xe12fff1e]));uc._ou_memory_sync_code(uc.getValue(e.handle_ptr,'*'),0x1000,8);assert.equal(call(0x1000,0x2000),9);
 console.log(JSON.stringify({passed:true,cached_read_write:true,read_hooks:reads,write_hooks:writes,permission_faults_preserved:true,unmap_remap_preserved:true,partial_unmap_preserved:true,code_invalidation_preserved:true},null,2));
}finally{e.close();}
