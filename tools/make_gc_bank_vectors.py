#!/usr/bin/env python3
"""Original bank pruning and sweep effects, with original ABI delegate stubs."""
from pathlib import Path
import json,struct
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3CVM10StringBank5FlushEv','_ZN3CVM9IdentBank5FlushEv','_ZN3CVM4Item12SweepGarbageEv','_ZN3XPL12HBMemManager9GetHandleEPKv'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names};calls=[]
def put(p,*words):u.mem_write(p,struct.pack('<'+'I'*len(words),*[x&0xffffffff for x in words]))
def free_obj(obj):
 put(obj,0xdeadbeef)
 for i in range(5):
  if obj==0x700200+i*0x100:put(0x701800+i*4,0)
def hook(uc,address,size,data):
 if address==symbols[names[3]]:uc.reg_write(UC_ARM_REG_R0,0x702000);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
 elif address in [0x704100,0x704200,0x704300]:
  a=uc.reg_read(UC_ARM_REG_R0);b=uc.reg_read(UC_ARM_REG_R1);c=uc.reg_read(UC_ARM_REG_R2)
  if address==0x704100:calls.append(dict(kind='destructor',object=a));put(a+0x10,0x1234)
  elif address==0x704200:calls.append(dict(kind='delete',object=a));free_obj(a)
  else:calls.append(dict(kind='free',manager=b,object=c));free_obj(c);u.mem_write(a,bytes(12))
  uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook)
def run(name,args):
 calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for reg,val in zip([UC_ARM_REG_R0,UC_ARM_REG_R1],args):u.reg_write(reg,val)
 u.emu_start(symbols[name],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;return u.reg_read(UC_ARM_REG_R0)
def changes(before):
 after=bytes(u.mem_read(0x700000,0x4000));return [dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]]
banks=[]
for kind in ['string','ident']:
 for seed in range(32):
  u.mem_write(0x700000,bytes(0x4000));put(0x703100,0x704100,0,0x704200);put(0x703004,0x704300);put(0x7021c8,0x703000)
  if kind=='string':put(0x700004,0x701000,5)
  else:put(0x700000,0x701000,5,0x702000)
  buckets=[[0,1],[],[2,3],[],[4]]
  for b,indices in enumerate(buckets):
   put(0x701000+b*4,0x701800+indices[0]*4 if indices else 0)
   for j,i in enumerate(indices):
    obj=0x700200+i*0x100;put(0x701800+i*4,obj);put(obj,0x703100);put(obj+4,0 if seed&(1<<i) else 2);put(obj+0x18,1 if (seed+i)%3==0 else 0);put(obj+0x14,0x701800+indices[j+1]*4 if j+1<len(indices) else 0)
  before=bytes(u.mem_read(0x700000,0x4000));result=run(names[0 if kind=='string' else 1],[0x700000]);banks.append(dict(kind=kind,seed=seed,result=result,changes=changes(before),delegates=calls.copy()))
sweeps=[]
for flags in [0,0x20,0x800,0x820,0x80,0x100,0x180,0x200,0x220,0xa00,0xffffffff]:
 for neighbors in [False,True]:
  u.mem_write(0x700000,bytes(0x4000));put(0x700100,0xaaaaaaaa);put(0x700200+8,0x701000);put(0x700200+0x14,flags);put(0x702000,0x700200);put(0x702004,0x700300);put(0x702008,0x700400);put(0x702010,0x700500);head=0x25c if flags&0x200 else 0x254 if flags&0x180 else 0x250;put(0x701000+head,0x702000)
  if neighbors:put(0x70020c,0x702004,0x702008);put(0x700310,0x702000);put(0x70040c,0x702000)
  if not flags&0x200:put(0x70125c,0x702010)
  before=bytes(u.mem_read(0x700000,0x4000));run(names[2],[0x700100,0x700200]);sweeps.append(dict(flags=flags,neighbors=neighbors,changes=changes(before)))
(root/'analysis/gc-bank-native-vectors.json').write_text(json.dumps(dict(symbols=symbols,banks=banks,sweeps=sweeps),separators=(',',':'))+'\n');print(len(banks),'original bank scans;',len(sweeps),'sweep cases')
