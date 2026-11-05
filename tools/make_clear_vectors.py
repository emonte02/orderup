#!/usr/bin/env python3
"""Independent original ARM array/associative entry cleanup cases."""
from pathlib import Path
import json,struct,base64
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols()};names=['_ZN3CVM11ArrayObject9ClearItemEv','_ZN3CVM5Assoc9ClearItemEv'];getters=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'];calls=[];mutate=False
P=0x700000
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def hook(uc,address,size,data):
 if address==0x704200:
  calls.append(dict(object=uc.reg_read(UC_ARM_REG_R0)));put(P+0x40,get(P+0x40)+1)
  if mutate:put(P+0x1c,3)
  uc.reg_write(UC_ARM_REG_R0,P+0x1000);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[]
for kind in range(7):
 for count in [0,1,2,17,65,129,-1,-2]:
  for mutate in [False,True]:
   array=kind==0;name=names[0 if array else 1];u.mem_write(P,bytes((i*31+kind*13+7)&255 for i in range(0x4000)));put(P,0x704000);put(P+0x18,count);put(P+0x1c,count);put(P+0x40,0);put(0x704070,0x704200 if kind==6 else symbols[getters[max(0,kind-1)]])
   before=bytes(u.mem_read(P,0x4000));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_R4,0x12345678);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,P);u.emu_start(symbols[name],0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;after=bytes(u.mem_read(P,0x4000));changes=[dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]];cases.append(dict(kind=kind,count=count,mutate=mutate,name=name,changes=changes,calls=calls.copy()))
(root/'analysis/clear-native-vectors.json').write_text(json.dumps(dict(symbols={n:symbols[n] for n in names+getters},prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},cases=cases),separators=(',',':'))+'\n');print(len(cases),'original ARM cleanup cases')
