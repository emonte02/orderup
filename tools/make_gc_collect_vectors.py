#!/usr/bin/env python3
"""Untouched ARM collection orchestration, with bounded original-ABI callbacks."""
from pathlib import Path
import json,struct
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3CVM10ModuleBank12MarkAllItemsEv','_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv','_ZN3CVM4Item12SweepGarbageEv','_ZN3CVM14FunctionObject12SweepGarbageEv','_ZN3CVM10ModuleBank5FlushEv','_ZN3CVM7Machine13flush_threadsEv','_ZN3CVM9ImageBank5FlushEv','_ZN3CVM13ImageInfoBank5FlushEv','_ZN3CVM12IndexMapBank5FlushEv','_ZN3CVM9IdentBank5FlushEv','_ZN3CVM10StringBank5FlushEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEEC1EPKNS_4ListIS2_EE','_ZN3XPL12ListIteratorIN3CVM6ThreadEE5FirstEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEE4NextEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEED1Ev'];mc='_ZN3CVM7Machine14CollectGarbageEN3CSL6GCModeE';symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names+[mc]};by_address={symbols[n]:i for i,n in enumerate(names)};calls=[];seed=0
prefix=bytes(u.mem_read(symbols[mc],8)).hex()
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def hook(uc,address,size,data):
 global seed
 if address in by_address:
  i=by_address[address]
  if i in [3,4]:return
  a=uc.reg_read(UC_ARM_REG_R0);b=uc.reg_read(UC_ARM_REG_R1);result=0
  if i==12:put(a,b,0);calls.append(dict(kind='iterator-ctor',list=b))
  elif i in [13,14]:
   owner=get(a);index=0 if i==13 else get(a+4)+1;put(a+4,index);result=get(get(owner)+index*4);calls.append(dict(kind='iterator-first' if i==13 else 'iterator-next',object=result))
  elif i==15:calls.append(dict(kind='iterator-dtor'))
  else:
   calls.append(dict(kind='callback',index=i,object=a))
   if i in [1,2]:put(a+(0x2c if i==1 else 0x14),get(a+(0x2c if i==1 else 0x14))|(8 if i==1 else 0x20))
   if i>=5:result=i-4
  uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
 elif address in [0x704400,0x704500,0x704600]:
  obj=uc.reg_read(UC_ARM_REG_R0)
  if address==0x704400:
   calls.append(dict(kind='mark',object=obj));put(obj+0x14,get(obj+0x14)|0x20)
   if obj==0x700400 and seed&16:put(obj+0xc,0x702028)
  elif address==0x704500:calls.append(dict(kind='purge',object=obj));put(obj+0x34,1);put(obj+0xc,0)
  else:
   calls.append(dict(kind='delete',object=obj));kind=get(obj+0x3c);put(0x700000+(0x260 if kind else 0x25c),get(obj+0xc));put(obj,0xdeadbeef)
  uc.reg_write(UC_ARM_REG_R0,0);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook)
cases=[]
for seed in range(32):
 for guarded in [False,True]:
  u.mem_write(0x700000,bytes(0x4000));put(0x700264,1 if guarded else 0);put(0x700138,0xfffffffe if seed&1 else 5);put(0x703310,0x704400,0x704500);put(0x703308,0x704600);put(0x703900,0x701600,0x701700,0);put(0x7000b0,0x703900)
  for off,obj in [(0x94,0x701000),(0x98,0x701100),(0xa0,0x701200),(0xa8,0x701300),(0xa4,0x701400),(0xac,0x701500)]:put(0x700000+off,obj)
  objects=[0x700400,0x700500,0x700600,0x700700,0x700800,0x700900,0x700a00,0x700b00,0x700c00,0x700d00,0x700f00]
  for i,obj in enumerate(objects):put(0x702000+i*4,obj);put(obj,0x703300);put(obj+4,1 if seed&(1<<(i%4)) else 0);put(obj+0x14,0x20);put(obj+0x2c,8)
  # Alternate strong root reached only if the callback mutates the current link.
  put(0x702028,0x700f00)
  for head,i in [(0x250,0),(0x254,2),(0x258,4),(0x25c,6),(0x260,8)]:put(0x700000+head,0x702000+i*4);put(objects[i]+0xc,0x702000+(i+1)*4)
  put(0x700a3c,0);put(0x700b3c,0);put(0x700c3c,1);put(0x700d3c,1)
  for i,obj in enumerate([0x701600,0x701700]):put(obj+4,1 if seed&(1<<i) else 0)
  before=bytes(u.mem_read(0x700000,0x4000));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,0x700000);u.reg_write(UC_ARM_REG_R1,0);u.emu_start(symbols[mc],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;result=u.reg_read(UC_ARM_REG_R0);after=bytes(u.mem_read(0x700000,0x4000));changes=[dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]];cases.append(dict(seed=seed,guarded=guarded,result=result,changes=changes,delegates=calls.copy()))
(root/'analysis/gc-collect-native-vectors.json').write_text(json.dumps(dict(symbols=symbols,callbacks=names,machine=mc,original_prefix=prefix,cases=cases),separators=(',',':'))+'\n');print(len(cases),'original collection ordering/mutation/reentry-guard cases')
