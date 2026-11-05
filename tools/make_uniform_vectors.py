#!/usr/bin/env python3
"""Native ARM uniform traces, including NaN, infinities, signed zero and stamps."""
from pathlib import Path
import json,struct,random,base64,hashlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols()};entry=symbols['_ZN3Gfx7Program15UpdateConstantsEv'];calls=[];seed=0
P=0x700000;M=0x702000
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def fb(f):return struct.unpack('<I',struct.pack('<f',f))[0]
def b64(a):return base64.b64encode(a).decode()
# GOT uses a local symbol relocated with R_ARM_RELATIVE.
manager_global=get((entry+0x30+get(entry+0x350))&0xffffffff);put(manager_global,M)
imports={0xde624:('vector',16,2),0xde564:('float',4,2),0xde018:('matrix',64,3)}
def hook(uc,address,size,data):
 if address not in imports:return
 kind,n,arg=imports[address];location=uc.reg_read(UC_ARM_REG_R0);pointer=uc.reg_read([UC_ARM_REG_R2,UC_ARM_REG_R3][arg-2]);calls.append(dict(kind=kind,location=location,pointer=pointer,data=bytes(uc.mem_read(pointer,n)).hex(),memory=hashlib.sha256(bytes(uc.mem_read(P,0x13c0))+bytes(uc.mem_read(M,0xb2c))).hexdigest()))
 # Test that flags clear after callbacks and later uploads observe callback writes.
 if seed&32 and kind=='vector' and location==0:put(P+0x1318+38*4,123);u.mem_write(P+0x48+38*24+20,b'\1')
 uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[];special=[0,0x80000000,0x7fc01234,0x7f800000,0xff800000,1,0x80000001,0x3f800000,0x358637bd,0x3a83126f]
for seed in range(96):
 rng=random.Random(seed);u.mem_write(P,bytes(0x13c0));u.mem_write(M,bytes(0xb2c));put(manager_global,M);put(M+0xb28,0xfffffffe if seed&1 else 500)
 for i in range(39):
  a=P+0x48+i*24;b=M+0x5e0+i*24;values=[fb(rng.uniform(-4,4)) for _ in range(4)];other=values.copy()
  if (seed+i)%3:other[(seed+i)%4]=special[(seed+i)%len(special)]
  put(a,*values,8 if i%3 else 0xffffffff);put(b,*other,9 if i%3 else 0);put(P+0x1318+i*4,-1 if (seed+i)%5==0 else i);u.mem_write(a+20,bytes([128 if (seed+i)%11==0 else 0]))
 for i in range(2):
  a=P+0x30+i*12;b=M+0x5c8+i*12;put(a,special[(seed+i)%len(special)],1);put(b,special[(seed+i+1)%len(special)],2);put(P+0x1310+i*4,-1 if seed%7==0 else 80+i);u.mem_write(a+8,bytes([1 if seed%3==0 else 0]))
 for i in range(3):
  a=P+0x3f0+i*72;b=M+0x988+i*72;values=[fb(float(k%5==0)) for k in range(16)];other=values.copy();other[(seed+i)%16]=special[(seed+i)%len(special)];put(a,*values,1);put(b,*other,2);put(P+0x13b4+i*4,-1 if (seed+i)%5==0 else 90+i);u.mem_write(a+68,bytes([1 if seed%4==0 else 0]))
 before=bytes(u.mem_read(P,0x13c0));manager_before=bytes(u.mem_read(M,0xb2c));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,0);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_R4,0x12345678);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,P);u.emu_start(entry,0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_R4)==0x12345678
 cases.append(dict(seed=seed,before=b64(before),manager_before=b64(manager_before),after=b64(bytes(u.mem_read(P,0x13c0))),manager_after=b64(bytes(u.mem_read(M,0xb2c))),calls=calls.copy()))
(root/'analysis/uniform-native-vectors.json').write_text(json.dumps(dict(entry=entry,manager_global=manager_global,program=P,manager=M,original_prefix=bytes(u.mem_read(entry,8)).hex(),cases=cases),separators=(',',':'))+'\n');print(len(cases),'original ARM uniform traces')
