#!/usr/bin/env python3
"""References from the untouched ARM material texture-binding loop."""
from pathlib import Path
import json,struct,hashlib,random,zlib,base64
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
symbols={s.name:s['st_value'] for s in e.get_section_by_name('.dynsym').iter_symbols()};setter=symbols['_ZN3Gfx21AndroidManager3DGLES210SetTextureEij'];site=0x380948;end=0x38095c;SLOT=0x43b8bc;GLOBAL=P+0x200;ARRAY=P+0x6000;seed=0;calls=[]
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def event(name,args):
 calls.append({'name':name,'args':args,'cache_pointer':get(SLOT),'memory':hashlib.sha256(bytes(u.mem_read(P,SIZE))).hexdigest()})
 if name=='glActiveTexture' and seed&16:put(SLOT,P+0x4000)
 if name=='glBindTexture' and seed&32:put(SLOT,P+0x5000)
 if name=='glBindTexture' and seed&64:put(ARRAY+((args[1]+seed)%10)*4,P+0x7000+((seed//2)%10)*0x100)
 if name=='glBindTexture' and seed&128:put(GLOBAL,P+0x1400)
 if name=='foreign' and seed&8:put(ARRAY+((args[1]+1)%10)*4,0)
def hook(uc,pc,size,data):
 if pc==end:uc.reg_write(UC_ARM_REG_PC,0xf000000);return
 if pc not in [0xde15c,0xde24c,0xde800]:return
 if pc==0xde15c:name='glActiveTexture';args=[uc.reg_read(UC_ARM_REG_R0)]
 elif pc==0xde24c:name='glBindTexture';args=[uc.reg_read(UC_ARM_REG_R0),uc.reg_read(UC_ARM_REG_R1)]
 else:name='foreign';args=[uc.reg_read(UC_ARM_REG_R0),uc.reg_read(UC_ARM_REG_R1),uc.reg_read(UC_ARM_REG_R2)]
 event(name,args);uc.reg_write(UC_ARM_REG_R0,seed+123);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[]
for seed in range(768):
 rng=random.Random(20261104+seed);pattern=bytes((i*17+seed*23)&255 for i in range(256));u.mem_write(P,pattern*(SIZE//256));put(GLOBAL,P+0x1000);put(SLOT,P+0x3000);put(P+0x1000,P+0xf000);put(P+0x1400,P+0xf400);put(P+0xf000+0xec,0xde800 if seed%11==0 else setter);put(P+0xf400+0xec,0xde800 if seed%7==0 else setter)
 cap=[-1,0,1,4,8,10,16,32][seed%8]
 for cache in [P+0x3000,P+0x4000,P+0x5000]:
  put(cache+0x114,cap);put(cache+0x328,[0,1,9,15][seed%4])
  for i in range(16):put(cache+0x11c+i*4,0 if seed%4<2 else i%4+1)
 for i in range(10):
  obj=P+0x7000+i*0x100;resource=P+0x8000+i*0x100;backend=P+0x9000+i*0x100;kind=(seed+i)%5;texture=[0,i%4+1,0x1234+i][seed%3]
  put(ARRAY+i*4,0 if kind==0 or seed<32 else obj);put(obj+8,0 if kind==1 else resource);put(resource+0x20,0 if kind==2 else backend);put(backend+0x40,texture)
 before=bytes(u.mem_read(P,SIZE));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,0);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,reg in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):u.reg_write(reg,0x12340000+i)
 u.reg_write(UC_ARM_REG_R7,0);u.reg_write(UC_ARM_REG_R8,GLOBAL);u.reg_write(UC_ARM_REG_R10,ARRAY-4);u.emu_start(site,0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
 registers=[u.reg_read(reg) for reg in [UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]];cases.append({'seed':seed,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy(),'slot':get(SLOT),'registers':registers,'cpsr_flags':u.reg_read(UC_ARM_REG_CPSR)&0xf8000000})
(root/'analysis/texture-loop-native-vectors.json').write_text(json.dumps({'site':site,'end':end,'setter':setter,'base':P,'size':SIZE,'global':GLOBAL,'array':ARRAY,'cache_slot':SLOT,'cases':cases},separators=(',',':'))+'\n');print('Original material texture-loop cases',len(cases))
