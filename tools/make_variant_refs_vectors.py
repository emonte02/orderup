#!/usr/bin/env python3
"""Original reference-count, wrap and alias behavior for Variant lifecycle."""
from pathlib import Path
import json,struct,zlib,base64,random
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()};names=['_ZNK3CVM7Variant7ReleaseEv','_ZNK3CVM7Variant7AcquireEv','_ZN3CVM7Variant5ClearEv'];cases=[]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
for kind in range(3):
 for seed in range(512):
  rng=random.Random(15541+seed+kind*512);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));var=P+0x1000;obj=P+0x2000;handle=P+0x3000;tag=(rng.getrandbits(32)&~0x600)|[0,0x200,0x400,0x600][seed%4]
  if seed%7==0:obj=var-4
  elif seed%11==0:obj=var
  elif seed%13==0:obj=var+4
  put(obj+4,0x12340000|[0,1,2,0x7fff,0x8000,0xfffe,0xffff][seed%7]);put(handle,obj);put(var,tag,handle if tag&0x400 else obj)
  if seed%23==0 and tag&0x400:put(var+4,var+4)
  control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4]);before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,var)
  for i,reg in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):u.reg_write(reg,0x12340000+i)
  u.emu_start(symbols[names[kind]],0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
  cases.append({'kind':kind,'seed':seed,'args':[var],'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/variant-refs-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original variant lifecycle cases',len(cases))
