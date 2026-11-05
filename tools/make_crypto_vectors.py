#!/usr/bin/env python3
"""Capture the original Android save-cipher state, output and alias behavior."""
from pathlib import Path
import json,struct,zlib,base64,random
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1]
f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f)
u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
    if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value'] for s in elf.get_section_by_name('.dynsym').iter_symbols()}
names=['_ZN6Random15NumberGenerator9GetNumberEj']+['_ZN6Crypto'+x+'16SetEncryptionKeyEj' for x in ['22BlockCipherCharShuffle','18BlockCipherCharSub','23BlockCipherMask8Shuffle','24BlockCipherMask32Shuffle']]+['_ZN6Crypto'+x+'7ProcessEPhNS_4ModeE' for x in ['16BlockCipherAdd32','17BlockCipherAddKey','22BlockCipherCharShuffle','18BlockCipherCharSub','23BlockCipherMask8Shuffle','24BlockCipherMask32Shuffle','16BlockCipherNoise','19BlockCipherRotate32']]
def put(p,*values):u.mem_write(p,struct.pack('<'+'I'*len(values),*[v&0xffffffff for v in values]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
cases=[]
for kind in range(13):
    for seed in range(96):
        rng=random.Random(191113+kind*1000+seed)
        u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256))
        obj=P+0x1000;table=obj+0x33c if kind==2 and seed%3==0 else P+0x3000;target=P+0x6000
        u.mem_write(obj,bytes(rng.getrandbits(8) for _ in range(0x800)))
        bins=64 if kind in [4,10] else 256
        perm=list(range(bins));rng.shuffle(perm);inverse=[0]*bins
        for i,v in enumerate(perm):inverse[v]=i
        if bins==64:
            put(obj+0x28,*range(64));put(obj+0x13c,*perm);put(obj+0x23c,*inverse)
        else:
            u.mem_write(obj+0x28,bytes(range(256)));u.mem_write(obj+0x13c,bytes(perm));u.mem_write(obj+0x23c,bytes(inverse))
        put(obj+0x128,table,table+bins*8,bins,bins);put(obj+0x138,0)
        for i in range(bins*2):put(table+i*8,0,0 if i in [bins-1,bins*2-1] else table+(i+1)*8)
        if 1<=kind<=4:
            if seed%11==0:put(obj+0x12c,table+bins*8+8)
            if seed%13==0:
                if bins==64:put(obj+0x28,*[(i+7)%64 for i in range(64)])
                else:u.mem_write(obj+0x28,bytes((i+7)%256 for i in range(256)))
            args=[obj,rng.getrandbits(32)]
        elif kind==0:
            obj+=seed%4;put(obj,*[rng.getrandbits(32) for _ in range(5)])
            args=[obj,[0,1,2,14,31,254,0x80000000,0xfffffffe,0xffffffff][seed%9]]
        else:
            if seed%9==0:target=obj+(0x33c if kind==10 else 0x14)
            args=[obj,target,[0,1,2,0xffffffff][seed%4]]
        control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4])
        before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
        for i,reg in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3]):u.reg_write(reg,args[i] if i<len(args) else 0)
        u.emu_start(symbols[names[kind]],0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,(kind,seed)
        cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/crypto-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n')
print('Original cipher cases',len(cases),flush=True)
