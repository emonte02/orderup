#!/usr/bin/env python3
"""Capture the original digest with disjoint, overlapping and stack inputs."""
import pathlib,json,random,struct,zlib,base64
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x10000;SP=0x200fff00
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
name='_ZN6Crypto6SVSEnc5Block9GetDigestEPj';entry=next(s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()if s.name==name)
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
cases=[]
for seed in range(1024):
 rng=random.Random(718234+seed);before=rng.randbytes(SIZE);u.mem_write(P,before);stack=rng.randbytes(512);u.mem_write(SP-256,stack)
 block=P+0x4000+(seed%4);output=block+([-(seed%48),seed%288,0x2000][seed%3])
 if seed%31==0:block=SP-128+(seed%128)
 if seed%29==0:output=SP-32+(seed%40)
 flags=((seed%16)<<28)|0x10;control=((seed%4)<<22)|(((seed>>2)%4)<<24)|([0,0x81,0x1f,0][seed%4]);u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i in range(13):u.reg_write(UC_ARM_REG_R0+i,(0x87654321+i*0x11111111)&0xffffffff)
 u.reg_write(UC_ARM_REG_R0,block);u.reg_write(UC_ARM_REG_R1,output);u.emu_start(entry,0xf000000,count=2000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
 cases.append({'seed':seed,'args':[block,output],'control':control,'flags':flags,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack),'stack_after':enc(bytes(u.mem_read(SP-256,512))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'callee':[u.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)]})
pathlib.Path('analysis/digest-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'stack':SP,'cases':cases},separators=(',',':'))+'\n');print('Original digest cases',len(cases))
