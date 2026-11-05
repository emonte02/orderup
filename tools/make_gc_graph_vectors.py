#!/usr/bin/env python3
"""Original ARM weak/cyclic graph marking, with real getters and bounded delegates."""
from pathlib import Path
import json,struct
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3CVM5Assoc12MarkAllItemsEv','_ZN3CVM11ArrayObject12MarkAllItemsEv','_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv','_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names};calls=[];delegates={symbols[n] for n in names[-3:]}|{0x704100}
def put(p,*words):u.mem_write(p,struct.pack('<'+'I'*len(words),*words))
def hook(uc,address,size,data):
 if address in delegates:
  object=uc.reg_read(UC_ARM_REG_R0);calls.append(dict(target=address,object=object));put(object+0x1c,1);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook)
cases=[]
for getter in names[2:7]+['unknown']:
 for weak in [0,0x80,0x100,0x180]:
  for root_kind in ['array','assoc']:
   for already_marked in [False,True]:
    u.mem_write(0x700000,bytes(0x3000));offset=0x24 if getter==names[5] else 0x2c if getter==names[6] else 0x40 if getter=='unknown' else 0x20
    put(0x702010,symbols[names[1]]);put(0x702110,symbols[names[0]]);put(0x702170,0x704200 if getter=='unknown' else symbols[getter]);put(0x702210,0x704100);put(0x704100,0xe12fff1e);put(0x704200,0xe2800040,0xe12fff1e)
    objects=[0x700000,0x700400,0x700800,0x700c00,0x700d00,0x700e00,0x700f00]
    for i,obj in enumerate(objects):put(0x701800+i*4,obj)
    put(0x700000,0x702000);put(0x700018,9);put(0x700400,0x702100);put(0x700414,weak);put(0x70041c,2);put(0x700800,0x702000);put(0x700818,2);put(0x700820,0x1008,0x701800,1,33);put(0x700d08,0x70180c);put(0x700f00,0x702200)
    variants=[(1,123),(5,0x70180c),(6,0x701810),(7,0x701814),(0x1008,0x701808),(0x1009,0x701804),(15,0x701100),(16,0x701200),(0x100a,0x701818)]
    for i,(kind,value) in enumerate(variants):put(0x700020+i*8,kind,value)
    put(0x700400+offset,5,0x70180c,0x1008,0x701808,0x100a,0x701818,7,0x701814)
    root_object=0x700000 if root_kind=='array' else 0x700400
    if already_marked:put(root_object+0x14,(0 if root_kind=='array' else weak)|0x20)
    before=bytes(u.mem_read(0x700000,0x3000));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,root_object);u.emu_start(symbols[names[1] if root_kind=='array' else names[0]],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;after=bytes(u.mem_read(0x700000,0x3000));changes=[dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]];cases.append(dict(getter=getter,weak=weak,root_kind=root_kind,already_marked=already_marked,changes=changes,delegates=calls.copy()))
(root/'analysis/gc-graph-native-vectors.json').write_text(json.dumps(dict(symbols=symbols,cases=cases),separators=(',',':'))+'\n');print(len(cases),'original cyclic/weak GC graph cases')
