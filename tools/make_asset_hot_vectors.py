#!/usr/bin/env python3
"""Untouched ARM references for the profiled asset-name/menu hot paths."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1]
f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f)
u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3XPL7ToLowerEc','_ZN3XPL12StrNoCaseCmpEPKcS1_','_ZN3XPL12StrNoCaseCmpEPKcS1_j','_ZN3XPL11StringCRC32EPKcj','_ZN3XPL12StringiCRC32EPKcj','_ZN4Menu7Element9MarkDirtyEv','_ZN4Menu9Container9MarkDirtyEv','_ZN4Menu9Container16GetElementByNameE10checksum32b']
symbols={s.name:s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name in names or s.name=='_ZN4Menu7Element16GetElementByNameE10checksum32b'};P=0x700000
registers=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2];callee=[UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def execute(kind,args):
 u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(callee):u.reg_write(r,0x12340000+i)
 for r,v in zip(registers,args):u.reg_write(r,v)
 u.emu_start(symbols[names[kind]],0xf000000,count=10000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
 assert u.reg_read(UC_ARM_REG_SP)==0x200fff00
 for i,r in enumerate(callee):assert u.reg_read(r)==0x12340000+i
 return u.reg_read(UC_ARM_REG_R0)
rng=random.Random(4217);strings=[]
for value in list(range(256))+[0xffffff00+i for i in range(256)]+[rng.getrandbits(32) for i in range(64)]:strings.append(dict(kind=0,args=[value,0,0],result=execute(0,[value,0,0])))
examples=[b'',b'ABC',b'abc',b'WAD/global.WAD',bytes([0xff,0x80,0x41]),b'prefix',b'prefix-long',b'z'*1024]
for seed in range(160):
 a=examples[seed%len(examples)] if seed<64 else bytes(rng.randrange(1,256) for _ in range(seed%129));b=a.swapcase() if seed%4==0 else a if seed%4==1 else a+b'x' if seed%4==2 else a[:-1]+b'Z';n=[0,1,2,7,31,1024,0xffffffff][seed%7]
 u.mem_write(P,bytes([0xa5])*0x3000);u.mem_write(P+0x100,a+b'\0');u.mem_write(P+0x1800,b+b'\0');before=bytes(u.mem_read(P,0x3000))
 for kind in [1,2]:
  args=[P+0x100,P+0x1800,n]
  if kind==2 and seed==0:args=[0,0,0]
  result=execute(kind,args);assert bytes(u.mem_read(P,0x3000))==before;strings.append(dict(kind=kind,args=args,a=a.hex(),b=b.hex(),result=result))
for seed in range(160):
 a=examples[seed%len(examples)] if seed<64 else bytes(rng.randrange(1,256) for _ in range(seed%513));initial=[0,0xffffffff,0x12345678,rng.getrandbits(32)][seed%4];u.mem_write(P,bytes([0xa5])*0x3000);u.mem_write(P+0x100,a+b'\0');before=bytes(u.mem_read(P,0x3000));args=[0 if seed%17==0 else P+0x100,initial,0]
 for kind in [3,4]:
  result=execute(kind,args);assert bytes(u.mem_read(P,0x3000))==before;strings.append(dict(kind=kind,args=args,a=a.hex(),b='',result=result))
# Original virtual callback: observe every byte, mutate links after invocation.
root_object=P+0x1000;child=P+0x2000;leaves=[P+0x3000+i*0x200 for i in range(4)];nodes=[P+0x6000+i*16 for i in range(8)];seed=0;calls=[]
def callback(uc,address,size,data):
 if address==P+0x9300:
  obj=uc.reg_read(UC_ARM_REG_R0);query=uc.reg_read(UC_ARM_REG_R1);direction=uc.reg_read(UC_ARM_REG_R2);calls.append(dict(object=obj,args=[query,direction],memory=hashlib.sha256(bytes(u.mem_read(P,0x8800))).hexdigest()))
  if obj==leaves[1] and seed&16:put(nodes[1],root_object+0x18c);put(nodes[1]+8,root_object+0x18c)
  if obj==leaves[3] and seed&32:put(nodes[4],nodes[6]);put(nodes[4]+8,child+0x18c)
  result=leaves[2] if seed&64 else obj if struct.unpack('<I',u.mem_read(obj+0x14c,4))[0]==query else 0
  uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR));return
 if address!=P+0x9200:return
 obj=uc.reg_read(UC_ARM_REG_R0);calls.append(dict(object=obj,memory=hashlib.sha256(bytes(u.mem_read(P,0x8800))).hexdigest()))
 u.mem_write(obj+0x180,bytes([u.mem_read(obj+0x180,1)[0]|0x80]))
 if obj==leaves[1] and seed&16:put(nodes[1],root_object+0x18c)
 if obj==leaves[3] and seed&32:put(nodes[4],nodes[6])
 uc.reg_write(UC_ARM_REG_R0,seed+17);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,callback,begin=P+0x9200,end=P+0x9300);menus=[]
for kind in [5,6]:
 for seed in range(128):
  u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(0x9000)));put(P+0x803c,symbols[names[5]]);put(P+0x823c,symbols[names[6]]);put(P+0x843c,P+0x9200)
  for obj,vt in [(root_object,P+0x8200),(child,P+0x8200)]+[(o,P+(0x8400 if i&1 else 0x8000)) for i,o in enumerate(leaves)]:put(obj,vt)
  head=root_object+0x18c;put(head,head if seed%11==0 else nodes[0]);put(nodes[0],nodes[1],0 if seed%13==0 else child);put(nodes[1],nodes[2],leaves[1]);put(nodes[2],head,0 if seed%7==0 else leaves[0]);sub=child+0x18c;put(sub,nodes[4]);put(nodes[4],nodes[5],leaves[3]);put(nodes[5],nodes[6],0 if seed%5==0 else leaves[2]);put(nodes[6],sub,leaves[0]);before=bytes(u.mem_read(P,0x9000));calls.clear();execute(kind,[root_object,0,0]);after=bytes(u.mem_read(P,0x9000));menus.append(dict(kind=kind,seed=seed,args=[root_object,0,0],before=base64.b64encode(zlib.compress(before)).decode(),after=base64.b64encode(zlib.compress(after)).decode(),calls=calls.copy()))
for seed in range(192):
 u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(0x9000)));put(P+0x8120,symbols['_ZN4Menu7Element16GetElementByNameE10checksum32b']);put(P+0x8320,symbols[names[7]]);put(P+0x8520,P+0x9300)
 for obj,vt in [(root_object,P+0x8200),(child,P+0x8200)]+[(o,P+(0x8400 if i&1 else 0x8000)) for i,o in enumerate(leaves)]:put(obj,vt)
 head=root_object+0x18c;sub=child+0x18c;put(head,head if seed%17==0 else nodes[0],0,head if seed%17==0 else nodes[2]);put(nodes[0],nodes[1],0 if seed%19==0 else child,head);put(nodes[1],nodes[2],leaves[1],nodes[0]);put(nodes[2],head,0 if seed%7==0 else leaves[0],nodes[1]);put(sub,nodes[4],0,nodes[6]);put(nodes[4],nodes[5],leaves[3],sub);put(nodes[5],nodes[6],0 if seed%5==0 else leaves[2],nodes[4]);put(nodes[6],sub,leaves[0],nodes[5]);query=0x12340000+seed%5
 for i,obj in enumerate([root_object,child,*leaves]):put(obj+0x14c,0x12340000+i%5)
 if seed%11==0:put(root_object+0x14c,query)
 args=[root_object,query,[0,1,0x100,0xffffffff][seed%4]];before=bytes(u.mem_read(P,0x9000));calls.clear();result=execute(7,args);after=bytes(u.mem_read(P,0x9000));menus.append(dict(kind=7,seed=seed,args=args,result=result,before=base64.b64encode(zlib.compress(before)).decode(),after=base64.b64encode(zlib.compress(after)).decode(),calls=calls.copy()))
record=dict(names=names,symbols=symbols,prefixes={n:bytes(u.mem_read(symbols[n],8)).hex() for n in names},strings=strings,menus=menus)
(root/'analysis/asset-hot-native-vectors.json').write_text(json.dumps(record,separators=(',',':'))+'\n');print(len(strings),'original string cases;',len(menus),'menu/callback mutation cases')
