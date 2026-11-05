#!/usr/bin/env python3
"""Original optimized bounding-box transform, all memory/float results."""
from pathlib import Path
import base64,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x10000;u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
name='_ZNK3Gfx4BboxmlERN4Math6MatrixE';entry=next(s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()if s.name==name)
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def bits(x):return struct.unpack('<I',struct.pack('<f',x))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];sregs=[getattr(__import__('unicorn.arm_const',fromlist=['x']),'UC_ARM_REG_S'+str(i))for i in range(16,32)];palette=[0,0x80000000,0x3f800000,0xbf800000,1,0x007fffff,0x00800000,0x7f7fffff,0x7fc12345,0x7fa00001,0x7f800000,0xff800000];cases=[]
for seed in range(1024):
 rng=random.Random(287117+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));source=P+0x1000;matrix=P+0x2000;out=P+0x3000;b=[bits(rng.uniform(-1e4,1e4))for _ in range(8)];m=[bits(rng.uniform(-4,4))for _ in range(16)]
 if seed%3==0:
  for i in [3,7,11]:m[i]=0
  m[15]=0x3f800000
  for i in [12,13,14]:m[i]=bits(rng.uniform(-1e4,1e4))
 if seed%11==0:b=[palette[(seed+i)%len(palette)]for i in range(8)]
 if seed%13==0:m=[palette[(seed+i)%len(palette)]for i in range(16)]
 if seed%17==0:b=[0,0x80000000,0,0x7fc12345,0x80000000,0,0x80000000,0xff800000]
 put(source,*b);put(matrix,*m)
 if seed%7==0:out=source+[-8,-4,0,4,16][seed%5]
 elif seed%19==0:out=matrix+[0,4,32,60][seed%4]
 control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&0x9f);control=(control&0x0fffffff)|([0,0x20000000,0x60000000,0x90000000][(seed//16)%4]);before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);args=[out,source,matrix]
 for i,reg in enumerate(regs):u.reg_write(reg,args[i]if i<len(args)else 0)
 for i,reg in enumerate(sregs):u.reg_write(reg,0x12345600+i)
 u.emu_start(entry,0xf000000,count=100000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'callee_float':[u.reg_read(reg)for reg in sregs]})
(root/'analysis/bbox-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original bounding-box cases',len(cases),flush=True)
