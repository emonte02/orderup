#!/usr/bin/env python3
"""Original region searches and handle operations, including stack aliases."""
from pathlib import Path
import base64,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x10000;SP=P+0xff00
u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0xf000000,4096)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
symbols={s.name:s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()};names=['_ZN3Mem6Region22GetFirstAvailableBlockEjb','_ZN3CSL15HandleInterface7AcquireEv','_ZN3CSL15HandleInterface7ReleaseEv'];regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];cases=[]
def put(p,*values):u.mem_write(p,struct.pack('<'+'I'*len(values),*[v&0xffffffff for v in values]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
for kind in range(3):
 for seed in range(1024 if not kind else 256):
  rng=random.Random(62437+seed+kind*1024);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));region=P+0x1000;count=seed%9;nodes=[P+0x2000+i*0x80 for i in range(count)];rng.shuffle(nodes);sizes=[0,1,15,16,31,64,0x7fffffff,0x80000000,0xffffffff];wanted=sizes[(seed//9)%9];direction=[0,1,2,255][(seed//81)%4];put(region+0x48,nodes[0]if nodes else 0,nodes[-1]if nodes else 0)
  for i,node in enumerate(nodes):put(node,nodes[i-1]if i else 0,nodes[i+1]if i+1<count else 0,sizes[(seed+i)%len(sizes)],0x12345678)
  args=[region,wanted,direction,0x2468ace0]
  if kind:
   obj=[P+0x8000,SP-8,SP-6,SP-4,SP-2,SP][seed%6];put(obj,0xa1b2c3d4,0x12340000|[0,1,2,0x7fff,0x8000,0xfffe,0xffff][seed%7]);args[0]=obj
  control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);flags=((seed&15)<<28)|0x10;before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,reg in enumerate(regs):u.reg_write(reg,args[i])
  u.emu_start(symbols[names[kind]],0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,(kind,seed)
  cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'flags':flags,'registers':[u.reg_read(reg)for reg in regs],'cpsr':u.reg_read(UC_ARM_REG_CPSR),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/region-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'sp':SP,'cases':cases},separators=(',',':'))+'\n');print('Original region/handle cases',len(cases))
