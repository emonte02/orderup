#!/usr/bin/env python3
"""Original Variant::Mark effects and exact delegation, with bounded child stubs."""
from pathlib import Path
import json,struct
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3CVM7Variant4MarkEv','_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv'];syms={s.name:s['st_value'] for section in elf.iter_sections() if section.name=='.dynsym' for s in section.iter_symbols() if s.name in names};delegates=set(syms[n] for n in names[1:])|{0x704000};calls=[]
def hook(uc,address,size,data):
 if address in delegates:calls.append(dict(target=address,object=uc.reg_read(UC_ARM_REG_R0)));uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook)
def put(p,*words):u.mem_write(p,struct.pack('<'+'I'*len(words),*words))
cases=[]
for kind in range(32):
 for item_flag in [0,0x1000]:
  for initial_mark in [0,1,0x12345678]:
   initial=bytearray(0x1000);u.mem_write(0x700000,bytes(initial));put(0x700000,kind|item_flag,0x700100);put(0x700100,0x700200);put(0x700200,0x700500);put(0x700500+0x10,0x704000);put(0x700200+0x18,initial_mark);put(0x700200+8,0x700300);put(0x700300,0x700400);put(0x700400+0x18,initial_mark);before=bytes(u.mem_read(0x700000,0x1000));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,0x700000);u.emu_start(syms[names[0]],0xf000000,count=100000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;after=bytes(u.mem_read(0x700000,0x1000));changes=[dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]];cases.append(dict(kind=kind,item_flag=item_flag,initial_mark=initial_mark,changes=changes,delegates=calls.copy()))
(root/'analysis/cvm-mark-native-vectors.json').write_text(json.dumps(dict(symbols=syms,cases=cases),separators=(',',':'))+'\n');print(len(cases),'original Variant::Mark cases')
