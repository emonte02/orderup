#!/usr/bin/env python3
"""Untouched ARM font helpers and glyph-copy block reference cases."""
from pathlib import Path
import json,struct,random,zlib,base64
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0xf000000,4096)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
symbols={s.name:s['st_value'] for s in elf.get_section_by_name('.dynsym').iter_symbols()};names=['_ZN4Font4Font13get_char_typeEPKcRi','_ZN4Font4Font13get_char_typeEPKwRi','_ZN4Font4Font13GetKernOffsetEww'];site=0x340664;end=0x340820
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11,UC_ARM_REG_R12,UC_ARM_REG_SP,UC_ARM_REG_LR];sr=[getattr(__import__('unicorn.arm_const',fromlist=['']),f'UC_ARM_REG_S{i}') for i in range(32)]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
cases=[];shapes=[[10],[13],[0],[65,0],[47,0],[47,99,48,0],[47,99,57,0],[47,99,97,0],[47,99,102,0],[47,99,103,0],[47,98,48,57,0],[47,98,57,65,0],[47,98,47,0],[47,65,0],[0x12f,99,48,0]]
for kind in range(4):
 for seed in range(384):
  rng=random.Random(9137+kind*1000+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));font=P+0x1000;sp=P+0xe000;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4]);u.reg_write(UC_ARM_REG_CPSR,0x10|((seed%16)<<28));u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
  rv=[0x12340000+i for i in range(15)];rv[13]=sp;rv[14]=0xf000000;sv=[rng.getrandbits(32) for i in range(32)]
  if kind<2:
   text=P+0x2000;length=P+0x3000;words=shapes[seed%len(shapes)]+[0]*8
   if seed%4==3:words=[rng.getrandbits(32) for i in range(4)]+[0]*8
   if kind==0:u.mem_write(text,bytes(x&255 for x in words))
   else:put(text,*words)
   if seed%9==0:length=text+(seed%4)*(1 if kind==0 else 4)
   args=[font,text,length];rv[:3]=args
  elif kind==2:
   last=[0,1,4,100,255,65535][seed%6];u.mem_write(font+24,struct.pack('<H',last));put(font+0x118,0 if seed&1 else P+0x4000,0 if seed&2 else P+0x5000);args=[font,[0,1,last,max(last-1,0),0xffffffff][seed%5],[0,1,last,max(last-1,0),0xffffffff][(seed//5)%5]];rv[:3]=args
   # The synthetic largest table is kept within the mapped native region.
   if last==65535:args[1]=0xffffffff;args[2]=0xffffffff;rv[:3]=args
  else:
   out=P+0x6000;glyph=seed%17;ptrs=[P+0x2000,P+0x2800,P+0x3000,P+0x3800]
   if seed%11==0:out=font+0x100
   if seed%13==0:ptrs[seed%4]=out+((seed%20)*4)-glyph*4
   if seed%17==0:out=sp+0x20;sv[17]=out
   put(font+0x28,*ptrs);put(sp+0x20,out);rv[4]=glyph;rv[5]=font
   if seed%19==0:out=P+0x6001;put(sp+0x20,out)
   args=[]
  for reg,val in zip(regs,rv):u.reg_write(reg,val)
  for reg,val in zip(sr,sv):u.reg_write(reg,val)
  before=bytes(u.mem_read(P,SIZE));u.emu_start(symbols[names[kind]] if kind<3 else site,0xf000000 if kind<3 else end,count=1000000)
  afterregs=[u.reg_read(x)for x in regs];afters=[u.reg_read(x)for x in sr];cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'flags':0x10|((seed%16)<<28),'registers_before':rv,'floats_before':sv,'registers':afterregs,'floats':afters,'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/font-native-vectors.json').write_text(json.dumps({'names':names,'site':site,'end':end,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original font reference cases',len(cases))
