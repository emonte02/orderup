#!/usr/bin/env python3
"""Untouched ARM graphics-cache references, including callback mutations."""
from pathlib import Path
import base64,hashlib,json,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZNK4Math6Matrix8ApproxEqERKS0_','_ZN3Gfx21AndroidManager3DGLES210GetProgramEj','_ZN3Gfx21AndroidManager3DGLES221EnableVertexAttributeEjb','_ZN3Gfx21AndroidManager3DGLES210SetTextureEij'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names};P=0x700000;SLOT=0x43b8bc;calls=[];seed=0
callbacks={0xde000:'glDisableVertexAttribArray',0xde12c:'glEnableVertexAttribArray',0xde15c:'glActiveTexture',0xde24c:'glBindTexture'}
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def hook(uc,address,size,data):
 if address not in callbacks:return
 name=callbacks[address];args=[uc.reg_read(UC_ARM_REG_R0)]+([uc.reg_read(UC_ARM_REG_R1)] if name=='glBindTexture' else [])
 calls.append(dict(name=name,args=args,cache_pointer=get(SLOT),memory=hashlib.sha256(bytes(u.mem_read(P,0x18000))).hexdigest()))
 if name=='glActiveTexture' and seed&16:put(SLOT,P+0x5000)
 if name=='glBindTexture' and seed&32:put(SLOT,P+0x7000)
 uc.reg_write(UC_ARM_REG_R0,seed+123);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=0xde000,end=0xde250)
special=[0,0x80000000,0x7fc01234,0x7fa01234,0x7f800000,0xff800000,1,0x80000001,0x3f800000,0x3a83126f,0x3a82f837,0x358637bd]
cases=[]
for kind in range(4):
 for seed in range(128):
  u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(0x18000)));put(SLOT,P+0x3000);args=[P,0,0]
  if kind==0:
   args=[P+0x10000,P+0x11000,0];a=[special[(seed+i)%len(special)] for i in range(16)] if seed<64 else [0]*16;b=a.copy()
   if seed%3:b[(seed//3)%16]=special[(seed+5)%len(special)]
   if seed>=64:b[seed%16]=[0x3a83126f,0x3a82f837,0x3a831270,0x3f800000][seed%4]
   put(args[0],*a);put(args[1],*b)
  elif kind==1:
   target=seed%11;args=[P,target,0];head=P+0x5a4;nodes=[P+0x1000+i*12 for i in range(seed%17)];put(head,nodes[0] if nodes else head)
   for i,node in enumerate(nodes):
    obj=P+0x2000+i*64;put(node,nodes[i+1] if i+1<len(nodes) else head,0 if seed%7==0 and i==1 else obj);put(obj+0x20,i%11)
  else:
   unit=[0,1,2,3,15,16,17,0xffffffff][seed%8];boolean=[0,1,0x100,0xffffffff][(seed//8)%4];args=[P,unit,boolean if kind==2 else 0x12340000+seed]
   for cache in [P+0x3000,P+0x5000,P+0x7000]:
    put(cache+0x114,[0,1,4,16][(seed//8)%4]);put(cache+0x328,unit if seed&2 else unit^1)
    for i in range(16):u.mem_write(cache+0x378+i,bytes([(boolean if seed&1 else boolean^1)&255]));put(cache+0x11c+i*4,0xabcdef00+i)
    if unit<16 or unit==0xffffffff:put((cache+((unit+0x46)*4+4))&0xffffffff,args[2] if seed&1 else args[2]^0xff)
  before=bytes(u.mem_read(P,0x18000));initial_slot=get(SLOT);calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,0);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,r in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2]):u.reg_write(r,args[i])
  for i,r in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):u.reg_write(r,0x12340000+i)
  u.emu_start(symbols[names[kind]],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_SP)==0x200fff00
  for i,r in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):assert u.reg_read(r)==0x12340000+i
  after=bytes(u.mem_read(P,0x18000));cases.append(dict(kind=kind,seed=seed,args=args,result=u.reg_read(UC_ARM_REG_R0) if kind<2 else None,before=base64.b64encode(zlib.compress(before)).decode(),after=base64.b64encode(zlib.compress(after)).decode(),initial_slot=initial_slot,final_slot=get(SLOT),calls=calls.copy()))
(root/'analysis/render-state-native-vectors.json').write_text(json.dumps(dict(names=names,symbols=symbols,cache_slot=SLOT,prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},cases=cases),separators=(',',':'))+'\n');print(len(cases),'original matrix/program/attribute/texture-cache cases')
