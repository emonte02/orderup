#!/usr/bin/env python3
"""Original xbool and script-value helpers, including word-order aliases."""
from pathlib import Path
import json,struct,zlib,base64,random
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
    if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()}
names=['_ZN5xboolC1Ev','_ZN5xboolC1ERKS_','_ZN5xboolC1Ei','_ZN5xboolC1Ej','_ZN5xboolC1Eb','_ZN5xboolaSERKS_','_ZN5xboolaSERKi','_ZN5xboolaSERKb','_ZNK5xboolcvbEv','_ZNK5xboolntEv','_ZN3CVM7Variant16SetWithNoAcquireERKS0_','_ZN3CVM7Variant7ItemSetERKS0_','_ZN3CVM7Variant11MakeLiteralEv','_ZNK3CVM7Variant9IsLiteralEv','_ZNK3CVM7Variant11IsConstItemEv','_ZNK3CVM4Item11IsConstItemEv','_ZN3CVM7Variant10ItemAssignERKS0_j']
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
cases=[]
for kind in range(len(names)):
    for seed in range(192):
        rng=random.Random(155441+seed+kind*512);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));src=P+0x2000+seed%4;dst=src+[-8,-4,-1,0,1,4,8,0x1000][seed%8];tag=rng.getrandbits(32) if seed%5 else 0;put(src,tag,rng.getrandbits(32));args=[dst,src,rng.getrandbits(32)]
        if kind in [2,3,4]:args[1]=[0,1,2,255,256,0xffffffff,rng.getrandbits(32)][seed%7]
        if kind==14:
            handle=P+0x4000;obj=P+0x5000;put(src,tag,handle);put(handle,obj);put(obj+0x14,rng.getrandbits(32))
        control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
        for i,reg in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3]):u.reg_write(reg,args[i]if i<len(args)else 0)
        u.emu_start(symbols[names[kind]],0xf000000,count=10000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,(kind,seed)
        cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/value-helper-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original value helper cases',len(cases),flush=True)
