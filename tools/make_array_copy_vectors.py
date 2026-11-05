#!/usr/bin/env python3
"""Original full ArrayObject copy, with observed allocation/recursive callbacks."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0xe000;u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()};name='_ZNK3CVM11ArrayObject7CopyCVMEPNS_6ThreadE';new='_ZN3CVM7Machine11NewCVMArrayEiPNS_6ThreadE';copy='_ZN3CVM7Variant4CopyERKS0_PNS_6ThreadE'
assert copy in symbols
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[];copies=0;count=0;dest_handle=P+0x8100;src_handle=P+0x8000
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def refs(tag,value,delta):
 if tag&0x600:
  obj=get(value)if tag&0x400 else value;old=struct.unpack('<H',u.mem_read(obj+4,2))[0];u.mem_write(obj+4,struct.pack('<H',(old+delta)&0xffff))
def hook(uc,pc,size,data):
 global copies
 args=[uc.reg_read(r)for r in regs];kind='new'if pc==P+0xf020 else 'copy';tag=get(args[2])if kind=='copy'else 0;complex_copy=bool(tag&0x600)or(tag&31)in [8,9,10,12]
 if kind=='new'or complex_copy:calls.append({'kind':kind,'args':args,'memory':hashlib.sha256(bytes(u.mem_read(P,SIZE))).hexdigest()})
 if kind=='new':
  if seed%19==0:put(args[0],0)
  else:
   if seed%17==0 and count:put(get(src_handle)+0x20,0x103,0x98765432)
   put(args[0],dest_handle);obj=get(dest_handle);old=struct.unpack('<H',u.mem_read(obj+4,2))[0];u.mem_write(obj+4,struct.pack('<H',(old+1)&0xffff))
 else:
  copies+=int(complex_copy)
  if complex_copy and seed%11==0:put(args[0],0)
  else:
   tag,value=get(args[2]),get(args[2]+4)
   if (tag&31)in [8,9,10,12]:tag,value=3,0x12340000+copies
   put(args[1]+4,value);put(args[1],tag);refs(tag,value,1);put(args[0],1)
   if complex_copy and seed%7==0 and copies==1:
    old_src,old_dst=get(src_handle),get(dest_handle);u.mem_write(P+0xa000,bytes(u.mem_read(old_src,0x20+count*8)));u.mem_write(P+0xb000,bytes(u.mem_read(old_dst,0x20+count*8)));put(src_handle,P+0xa000);put(dest_handle,P+0xb000)
 uc.reg_write(UC_ARM_REG_R0,args[0]);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0xf020,end=P+0xf040)
put(P+0xf000,0xe5900018,0xe12fff1e)
for n,target in [(new,P+0xf020),(copy,P+0xf040)]:put(symbols[n],0xe51ff004,target);put(target,0xe12fff1e)
cases=[]
for seed in range(384):
 rng=random.Random(411303+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));src=P+0x2000;dst=src if seed%23==0 else P+0x6000;count=[0,1,2,7,16,31,64][seed%7];vtable=P+0x400;out=P+0x9000
 for obj,handle,owner in [(src,src_handle,P+0x5000),(dst,dest_handle,P+0x5100)]:
  put(obj,vtable,[0,1,0xfffe,0xffff][seed%4],P+0xc000);put(obj+0x14,0,count);put(obj-12,owner);put(owner+4,handle);put(handle,obj);u.mem_write(obj-2,struct.pack('<H',16))
 if src==dst:put(src-12,P+0x5000);put(P+0x5004,src_handle)
 put(vtable+0x38,P+0xf000);put(P+0x7000,P+0x7100);put(P+0x7104,0xfffe if seed&1 else 1);put(P+0x7114,0x40 if seed&2 else 0)
 for i in range(count):
  kind=(i+seed)%10 if seed%3 else i%4;tag,value=[(0,0),(3,rng.getrandbits(32)),(0x104,rng.getrandbits(32)),(0x103,rng.getrandbits(32)),(0x505,P+0x7000),(0x508,P+0x7000),(0x509,P+0x7000),(0x1508,P+0x7000),(0x408,P+0x7000),(0x1103,P+0x7000)][kind];put(src+0x20+i*8,tag,value)
 if seed%29==0:out=dst+4
 before=bytes(u.mem_read(P,SIZE));control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);args=[out,src,P+0xc800]
 for i,reg in enumerate(regs):u.reg_write(reg,args[i]if i<len(args)else 0)
 calls.clear();copies=0;u.emu_start(symbols[name],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'count':count,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy()})
(root/'analysis/array-copy-native-vectors.json').write_text(json.dumps({'name':name,'new':new,'copy':copy,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original array-copy cases',len(cases),flush=True)
