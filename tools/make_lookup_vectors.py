#!/usr/bin/env python3
"""Untouched ARM tagged equality and virtual-getter associative lookup."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZNK3CVM7VarianteqERKS0_','_ZNK3CVM5Assoc8GetEntryERKNS_7VariantERi'];symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names};P=0x700000;rng=random.Random(9016);calls=[];seed=0
callee=[UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def packed(b):return base64.b64encode(zlib.compress(b)).decode()
def run(kind,args,control=0):
 u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2]):u.reg_write(r,args[i] if i<len(args) else 0)
 for i,r in enumerate(callee):u.reg_write(r,0x12340000+i)
 u.emu_start(symbols[names[kind]],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_SP)==0x200fff00
 for i,r in enumerate(callee):assert u.reg_read(r)==0x12340000+i
 assert u.reg_read(UC_ARM_REG_FPSCR)&0x3c00000==control&0x3c00000
 return u.reg_read(UC_ARM_REG_R0)
def eq_case(a,b,control):
 put(P+0x100,*a);put(P+0x200,*b);before=bytes(u.mem_read(P+0x100,0x108));result=run(0,[P+0x100,P+0x200],control);assert bytes(u.mem_read(P+0x100,0x108))==before;return dict(a=a,b=b,control=control,result=result)
equalities=[]
for ta in range(32):
 for tb in range(32):
  for equal in [False,True]:
   value=rng.getrandbits(32);other=value if equal else value^1;equalities.append(eq_case([ta|(rng.getrandbits(27)<<5),value],[tb|(rng.getrandbits(27)<<5),other],0))
integers=[0,1,0xffffffff,2,0xfffffffe,0x7fffffff,0x80000000,0x80000001,0xffffff,0x1000000,0x1000001,0x1000003,0xfeffffff]+[rng.getrandbits(32) for _ in range(27)]
for integer in integers:
 signed=integer if integer<0x80000000 else integer-0x100000000;rounded=struct.unpack('<I',struct.pack('<f',signed))[0];floating=[0,0x80000000,rounded,rounded^1,0x7fc01234,0x7fa01234,1,0x807fffff]
 for value in floating:
  for mode in range(4):
   for fz in range(2):
    for dn in range(2):
     control=(mode<<22)|(fz<<24)|(dn<<25)
     for reverse in [False,True]:
      a=[3|(rng.getrandbits(27)<<5),integer];b=[4|(rng.getrandbits(27)<<5),value];equalities.append(eq_case(b if reverse else a,a if reverse else b,control))
# Virtual getter must run once, including a negative initial count; it may
# replace the table, mutate count/key and make an out-index alias observable.
def getter(uc,address,size,data):
 if address!=P+0x1f000:return
 obj=uc.reg_read(UC_ARM_REG_R0);calls.append(dict(object=obj,memory=hashlib.sha256(bytes(u.mem_read(P,0xd000))).hexdigest()));table=P+(0x6000 if seed&32 else 0x2000)
 if seed&8:put(obj+0x1c,[0,1,9,17][seed%4])
 if seed&16:put(P+0x1200,get(table+(seed%17)*16),get(table+(seed%17)*16+4))
 uc.reg_write(UC_ARM_REG_R0,table);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,getter,begin=P+0x1f000,end=P+0x1f000);associative=[]
for seed in range(256):
 u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(0xd000)));obj=P+0x400;key=P+0x1200;output=obj+0x1c if seed%7==0 else key+4 if seed%9==0 else P+0x1400;put(obj,P+0x1000);put(P+0x1070,P+0x1f000);put(obj+0x1c,[0,1,3,9,17,65,0xffffffff,0x80000000][seed%8]);put(key,[3,4,6,0][seed%4],[0,0x3f800000,7,0x7fc01234][(seed//4)%4])
 if output==P+0x1400:put(output,0xfeedbeef)
 for table in [P+0x2000,P+0x6000]:
  for i in range(65):put(table+i*16,([3,4,6,0][(seed+i)%4])|((i&3)<<5),[i,i+0x3f800000,7,0x7fc01234][(seed+i)%4],0xa5a5a5a5,0x5a5a5a5a)
 args=[obj,key,output];control=((seed%4)<<22)|((seed&4)<<22);before=bytes(u.mem_read(P,0xd000));calls.clear();result=run(1,args,control);after=bytes(u.mem_read(P,0xd000));associative.append(dict(seed=seed,args=args,control=control,result=result,before=packed(before),after=packed(after),calls=calls.copy()))
(root/'analysis/lookup-native-vectors.json').write_text(json.dumps(dict(names=names,symbols=symbols,prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},equalities=equalities,associative=associative),separators=(',',':'))+'\n');print(len(equalities),'original equality cases;',len(associative),'virtual-getter lookup cases')
