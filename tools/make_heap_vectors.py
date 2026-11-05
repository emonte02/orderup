#!/usr/bin/env python3
"""Independent original ARM allocator references over fragmented heaps."""
from pathlib import Path
import json,struct,random,base64,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3XPL4Heap6insertEPvj','_ZN3XPL12HBMemManager4FreeEPv'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols()};P=0x700000;heap=P+0x1800;data=P+0x4000;output=P+0x300;calls=[];seed=0

def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def packed(a):return base64.b64encode(zlib.compress(a,9)).decode()
def hook(uc,address,size,opaque):
 if address in [P+0x3800,P+0x3804]:
  args=[uc.reg_read(i) for i in [UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2]];kind='foreign-free' if address==P+0x3800 else 'diagnostic';calls.append(dict(kind=kind,args=args));put(P+0x380,0x12345678)
  if kind=='foreign-free':put(args[0],seed&1)
  uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[]
for kind,name in enumerate(names):
 for seed in range(128):
  rng=random.Random(seed);u.mem_write(P,bytes((i*31+seed*13+7)&255 for i in range(0x10000)));index=seed%16;block=data+index*64;free=[rng.random()<0.45 and i!=index for i in range(16)];runs=[];i=0
  while i<16:
   if not free[i]:i+=1;continue
   start=i
   while i<16 and free[i]:i+=1
   runs.append((data+start*64,(i-start)*64))
  put(heap+0x14,runs[0][0] if runs else 0,runs[-1][0] if runs else 0);put(heap+0x24,data,data+16*64);put(heap+0x34,P+0x2800 if seed%8==0 else 0);put(heap+0x40,8,512);put(heap+8,P);put(P+4,P+0x3900);put(P+0x3910,P+0x3804);put(P+0x2800,P+0x2900);put(P+0x2904,P+0x3800);put(P+0x3800,0xe12fff1e,0xe12fff1e)
  for i,(node,size) in enumerate(runs):put(node,runs[i+1][0] if i+1<len(runs) else 0,runs[i-1][0] if i else 0,size,node+size)
  put(P+0x14,9999,33);put(P+0x7c,16);put(P+0x68,P+0x2200 if seed&1 else 0,P+0x2208 if seed&1 else 0);put(P+0x2208,0,0);put(P+0x2004,P+0x2100);put(P+0x2100,block+16,P+0x2108 if seed&2 else 0);put(P+0x2108,P+0xe010,0);put(P+0xe004,P+0x2100);u.mem_write(P+0xe00e,struct.pack('<H',16));put(block,64,P+0x2000);u.mem_write(block+14,struct.pack('<H',16));put(heap+0xc,0)
  first=heap
  for i in reversed(range(seed%7)):
   dummy=P+0x1000+i*0x80;put(dummy+0xc,first);put(dummy+0x24,P+0xc000,P+0xd000);first=dummy
  put(P+0x4c,0 if kind==1 and seed%17==0 else first)
  if kind==0 and seed%19==0:put(heap+0x28,block+32)
  args=[output,heap,block,64] if kind==0 else [output,P,0 if seed%23==0 else block+16,0];before=bytes(u.mem_read(P,0x10000));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_R4,0x12345678);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for register,value in zip([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3],args):u.reg_write(register,value)
  u.emu_start(symbols[name],0xf000000,count=2000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_R4)==0x12345678;after=bytes(u.mem_read(P,0x10000));cases.append(dict(kind=kind,seed=seed,args=args,before=packed(before),after=packed(after),result=u.reg_read(UC_ARM_REG_R0),calls=calls.copy()))
(root/'analysis/heap-native-vectors.json').write_text(json.dumps(dict(names=names,symbols={n:symbols[n] for n in names},prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},cases=cases),separators=(',',':'))+'\n');print(len(cases),'original ARM fragmented-heap / fallback cases')
