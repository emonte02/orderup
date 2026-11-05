#!/usr/bin/env python3
"""Untouched ARM text-layout loop with exact float state and callback fallbacks."""
from pathlib import Path
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
import json,struct,random,zlib,base64
root=Path(__file__).resolve().parents[1];stream=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(stream);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0xf000000,4096)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11,UC_ARM_REG_R12,UC_ARM_REG_SP,UC_ARM_REG_LR];sr=[getattr(__import__('unicorn.arm_const',fromlist=['']),f'UC_ARM_REG_S{i}')for i in range(32)];calls=[];seed=0

def callback(uc,pc,size,data):
 if pc not in [0xde800,0xde820]:return
 args=[uc.reg_read(x)for x in regs[:3]];name='width'if pc==0xde800 else'kern';calls.append({'name':name,'args':args});put(args[0]+0xfc,get(args[0]+0xfc)+1);uc.reg_write(UC_ARM_REG_R0,(seed*19+7)&0xffffffff);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,callback);cases=[];special=[0,0x80000000,1,0x80000001,0x00800000,0x7f800000,0xff800000,0x7fc01234,0x7fa12345,0x7f7fffff,0x3f800000,0xbf800000,0x3f400000]
for seed in range(768):
 rng=random.Random(71181+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));font=P+0x1000;text=P+0x7000;scale=P+0x7400;out=P+0x8000;sp=P+0xe000;length=[1,2,5,16,24,40][seed%6];start=seed%(length//2+1);last=95;put(font,P+0x800);put(P+0x804,0xde800 if seed%19==0 else 0x3400a0);put(P+0x80c,0xde820 if seed%23==0 else 0x3400c0);u.mem_write(font+24,struct.pack('<H',last));put(font+0x28,P+0x5000,P+0x5400,P+0x5800,P+0x5c00,P+0x3000,P+0x2000,P+0x4000);put(font+0x110,rng.getrandbits(32) if seed>255 else seed%7);put(font+0x118,0 if seed&1 else P+0x6300,0 if seed&2 else P+0x6400)
 u.mem_write(P+0x2000,struct.pack('<'+'H'*(last+1),*range(32,128)))
 for i in range(last+1):
  put(P+0x3000+i*4,rng.getrandbits(32) if seed>255 else i%31);u.mem_write(P+0x4000+i,bytes([(i+seed)%3]))
  for base in [0x5000,0x5400,0x5800,0x5c00]:put(P+base+i*4,rng.getrandbits(32))
 letters=[rng.randrange(32,200) if seed%7 else rng.randrange(0,32)for i in range(length)]
 if seed%11==0:letters=list(map(ord,'/c0'))+letters;length=len(letters);start=0
 if seed%31==0:length=1;start=0;letters=[65];out=font+0x100
 if seed%37==0:length=1;start=0;letters=[65];out=text
 if seed%41==0:length=1;start=0;letters=[65];out=P+0x800
 put(text,*letters,0);put(scale,*[special[rng.randrange(len(special))]if seed>255 else 0x3f800000]);put(0x43b2e4,P+0x200);put(P+0x200,P+0xc000);put(P+0xc014,special[rng.randrange(len(special))]if seed>255 else 0x3f400000)
 put(sp+0xa0,P+0x7600);put(sp+0x28,sp+0x44);put(sp+0xc,0x7fff);put(sp+0x10,[0,1,2,255][seed%4]);put(sp+0x14,0x12345678);put(sp+0x1c,seed&1);put(sp+0x20,out);put(sp+0x2c,seed%9);put(sp+0x44,0xabcdef12)
 control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4]);flags=0x10|((seed%16)<<28);rv=[0x12340000+i for i in range(15)];rv[5]=font;rv[6]=start;rv[7]=text;rv[8]=length;rv[11]=scale;rv[13]=sp;rv[14]=0xf000000;sv=[rng.getrandbits(32)for i in range(32)]
 for i in range(16,21):sv[i]=special[rng.randrange(len(special))]if seed>255 else 0x3f800000+i
 u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
 for reg,val in zip(regs,rv):u.reg_write(reg,val)
 for reg,val in zip(sr,sv):u.reg_write(reg,val)
 before=bytes(u.mem_read(P,SIZE));calls.clear()
 try:u.emu_start(0x34039c,0x340480,count=3000000)
 except Exception:
  print({'seed':seed,'pc':hex(u.reg_read(UC_ARM_REG_PC)),'regs':[hex(u.reg_read(x))for x in regs],'text':letters});raise
 assert u.reg_read(UC_ARM_REG_PC)==0x340480
 cases.append({'seed':seed,'registers_before':rv,'floats_before':sv,'control':control,'flags':flags,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'registers':[u.reg_read(x)for x in regs],'floats':[u.reg_read(x)for x in sr],'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy()})
(root/'analysis/font-layout-native-vectors.json').write_text(json.dumps({'base':P,'size':SIZE,'site':0x34039c,'end':0x340480,'ui_slot':0x43b2e4,'cases':cases},separators=(',',':'))+'\n');print('Original font layout cases',len(cases))
