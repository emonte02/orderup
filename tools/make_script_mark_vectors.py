#!/usr/bin/env python3
"""Untouched ARM function/module graph marks and original module-bank iterators."""
from pathlib import Path
import json,struct,hashlib,base64,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM10ModuleBank12MarkAllItemsEv'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols()};P=0x700000;functions=[P+0x400,P+0x600,P+0x800];modules=[P+0x1000,P+0x1100,P+0x1200];objects=[P+0x2000,P+0x2100,P+0x2200];nodes=[P+0x3800+i*16 for i in range(3)];calls=[];seed=0

def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def packed(a):return base64.b64encode(zlib.compress(a,9)).decode()
def hook(uc,address,size,opaque):
 if address!=P+0x5200:return
 obj=uc.reg_read(UC_ARM_REG_R0);calls.append(dict(object=obj,memory=hashlib.sha256(bytes(uc.mem_read(P,0x4000))).hexdigest()));put(obj+0x38,get(obj+0x38)+1)
 if obj==objects[0] and seed&16:put(functions[0]+0x40,1)
 if obj==objects[1] and seed&32:put(functions[0]+0x74+0x20+4,P+0x3000)
 if obj==objects[0] and seed&64:put(nodes[0],nodes[2])
 uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[]
for kind,name in enumerate(names):
 for seed in range(128):
  u.mem_write(P,bytes(0x6000));put(P+0x5010,P+0x5200);put(P+0x5200,0xe12fff1e);head=P+8;put(head,nodes[0] if seed%11 else head,nodes[-1] if seed%11 else head,head+8)
  for i in range(3):
   put(P+0x3000+i*4,functions[i]);put(P+0x3100+i*4,objects[i]);put(objects[i],P+0x5000);put(objects[i]+0x38,0);put(modules[i]+4,1 if seed&(1<<i) else 0);put(modules[i]+0x10,P+0x3100+i*4);put(modules[i]+0x2c,[0,1,2,0xffffffff][(seed+i)%4]);put(functions[i]+0x2c,[0,8,0x10,0x18][(seed+i)%4]);put(functions[i]+0x18,modules[i] if (seed+i)%3 else 0);put(functions[i]+0x40,0 if i==2 else 2);put(functions[i]+0x68,0x20);put(functions[i]+0x94,P+0x3000+(i+1)%3*4,P+0x3000);put(nodes[i],nodes[i+1] if i<2 else head,nodes[i-1] if i else head,modules[i])
  if kind==1 and seed&8:put(modules[0]+0x10,0)
  before=bytes(u.mem_read(P,0x4000));calls.clear();argument=functions[0] if kind==0 else modules[0] if kind==1 else P;u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_R4,0x12345678);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,argument);u.emu_start(symbols[name],0xf000000,count=2000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_R4)==0x12345678;after=bytes(u.mem_read(P,0x4000));cases.append(dict(kind=kind,seed=seed,argument=argument,before=packed(before),after=packed(after),calls=calls.copy()))
(root/'analysis/script-mark-native-vectors.json').write_text(json.dumps(dict(names=names,symbols={n:symbols[n] for n in names},prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},cases=cases),separators=(',',':'))+'\n');print(len(cases),'original ARM script graph / iterator-mutation cases')
