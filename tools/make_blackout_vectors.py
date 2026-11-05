#!/usr/bin/env python3
"""Run the untouched ARM blackout-range bookkeeping, including duplicate starts."""
from pathlib import Path
import base64,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x10000;SP=0x200fff00;STACK=SP-0x5000;STACK_SIZE=0x5100;RET=0xf000000
names=['_ZN3Mem7Manager16AddBlackoutRangeEPKvjb','_ZN3Mem7Manager19RemoveBlackoutRangeEPKv'];symbols={s.name:s['st_value'] for section in elf.iter_sections()if section['sh_type']in ['SHT_DYNSYM','SHT_SYMTAB']for s in section.iter_symbols()};entries=[symbols[n]for n in names]
u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(RET,4096)
for segment in elf.iter_segments():
 if segment['p_type']=='PT_LOAD':u.mem_write(segment['p_vaddr'],segment.data())
regs=[UC_ARM_REG_R0+i for i in range(13)]+[UC_ARM_REG_SP,UC_ARM_REG_LR]
def put(p,*vs):u.mem_write(p,struct.pack('<'+'I'*len(vs),*[v&0xffffffff for v in vs]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
cases=[]
for kind in range(2):
 for seed in range(1108):
  rng=random.Random(119187+kind*2048+seed);u.mem_write(P,bytes((i*13+seed*7)&255 for i in range(256))*(SIZE//256));u.mem_write(STACK,bytes((i*11+seed*3)&255 for i in range(STACK_SIZE)));owner=P+0x100;count=(seed%1024)if not kind else(seed%1025);starts=sorted(rng.getrandbits(32)for i in range(count));wanted=[0,1,0x7fffffff,0x80000000,0xffffffff,rng.getrandbits(32)][seed%6]
  if count and seed%3:wanted=starts[seed%count]
  if seed%11==0:starts=[wanted]*count
  if seed%13==0:rng.shuffle(starts)
  if seed>=1100:
   owner=[P+0x101,SP-0x3864,SP-0x3860,SP-0x3874][(seed-1100)%4];count=0 if seed<1104 else 1;starts=[wanted]*count
  put(owner+0x3860,count)
  for i,x in enumerate(starts):put(owner+0x860+i*12,x,(x+rng.getrandbits(12))&0xffffffff,rng.getrandbits(32))
  initial=[rng.getrandbits(32)for i in range(13)]+[SP,RET];initial[0]=owner;initial[1]=wanted;initial[2]=[0,1,2,4096,0x7fffffff,0x80000000,0xffffffff][seed%7];initial[3]=[0,1,0xffff,0x12345678,0xffffffff][seed%5]
  if seed>=1100:initial[4:12]=[0]*8
  flags=((seed&15)<<28)|((seed&16)<<23)|((seed&15)<<16)|0x10;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(STACK,STACK_SIZE));u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
  for reg,value in zip(regs,initial):u.reg_write(reg,value)
  for i in range(32):u.reg_write(UC_ARM_REG_S0+i,(seed*31+i*17)&0xffffffff)
  u.emu_start(entries[kind],RET,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==RET
  cases.append({'kind':kind,'seed':seed,'initial':initial,'flags':flags,'control':control,'registers':[u.reg_read(reg)for reg in regs],'cpsr':u.reg_read(UC_ARM_REG_CPSR),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'s':[u.reg_read(UC_ARM_REG_S0+i)for i in range(32)],'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(STACK,STACK_SIZE)))})
(root/'analysis/blackout-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'sp':SP,'stack':STACK,'stack_size':STACK_SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original blackout ARM cases',len(cases),flush=True)
