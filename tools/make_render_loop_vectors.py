#!/usr/bin/env python3
"""Untouched ARM references for per-frame vector, material and queue helpers."""
from pathlib import Path
import json,struct,random
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3Gfx21AndroidManager3DGLES218SetProgramConstantEiRKN4Math7Vector4E','_ZN3Gfx21AndroidManager3DGLES218SetProgramConstantEiRKN4Math6VectorE','_ZN3Gfx11MaterialLib25GetMaterialByNameChecksumE10checksum32','_ZN2OT5Table5ResetEv','_ZN2OT8Iterator7GetNextEv'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols()};P=0x700000
special=[0,0x80000000,0x7fc01234,0x7f800000,0xff800000,1,0x80000001,0x3f800000,0x358637bd,0x3a83126f]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def setup(kind,seed):
 u.mem_write(P,bytes((i*31+seed*13+7)&255 for i in range(0x8000)));args=[P,0,0]
 if kind<2:
  index=seed%39;args=[P,index,P+0x4000];dst=P+0x5e0+index*24;values=[special[(seed+k)%len(special)] for k in range(4)];other=values.copy()
  if seed%3:other[seed%4]=special[(seed+7)%len(special)]
  put(dst,*values,0xffffffff);put(args[2],*other);put(0x461e18,P if seed&1 else P+0x2000);put((P if seed&1 else P+0x2000)+0xb28,0xffffffff if seed%5==0 else 100)
 elif kind==2:
  heads=P+0x1000;put(P+0x14,0 if seed==0 else heads);target=seed%11;args=[P,target,0]
  for group in range(2):
   head=heads+group*12;nodes=[P+0x2000+group*0x100+i*12 for i in range(seed%9)];put(head,nodes[0] if nodes else head)
   for i,node in enumerate(nodes):
    value=P+0x3000+group*0x200+i*48;put(node,nodes[i+1] if i+1<len(nodes) else head,0 if seed%4==0 and i==1 else value);put(value+0x1c,(i+group*3)%11)
 elif kind==3:
  buckets=[1,2,17,65,128,1025][seed%6];pool=[0,1,2,17,129][seed%5];put(P,P+0x1000,0x12345678,buckets,pool)
 else:
  count=[0,1,3,17,65,257][seed%6];nodes=[P+0x1000+i*8 for i in range(count+1)];put(P,nodes[0])
  for i,node in enumerate(nodes):put(node,0 if i<2 or seed%3==0 else 0x12340000+i,nodes[i+1] if i+1<len(nodes) else 0)
 return args
cases=[]
for kind,name in enumerate(names):
 for seed in range(48):
  args=setup(kind,seed);before=bytes(u.mem_read(P,0x8000));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,0);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_R4,0x12345678);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for register,value in zip([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2],args):u.reg_write(register,value)
  u.emu_start(symbols[name],0xf000000,count=2000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_R4)==0x12345678;after=bytes(u.mem_read(P,0x8000));changes=[dict(offset=i,value=after[i]) for i in range(len(after)) if before[i]!=after[i]];cases.append(dict(kind=kind,seed=seed,args=args,result=u.reg_read(UC_ARM_REG_R0) if kind in [2,4] else None,changes=changes))
(root/'analysis/render-loop-native-vectors.json').write_text(json.dumps(dict(names=names,symbols={n:symbols[n] for n in names},prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},cases=cases),separators=(',',':'))+'\n');print(len(cases),'original ARM per-frame helper cases')
