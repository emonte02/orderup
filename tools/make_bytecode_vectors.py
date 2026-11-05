#!/usr/bin/env python3
"""Run the original decoder through every opcode, width and signed boundary."""
from pathlib import Path
import base64,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x10000;SP=P+0xf000;ENTRY=0x3b5ef4
u.mem_map(0,0x500000);u.mem_map(P,SIZE)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
def word(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def branch(p):
 v=word(p)&0xffffff;v=v-0x1000000 if v&0x800000 else v;return p+8+v*4
targets=sorted({branch(p+i*4)for p,n in [(0x3b5f2c,87),(0x3b89e0,28),(0x3b5f28,1),(0x3b89dc,1)]for i in range(n)})
regs=[UC_ARM_REG_R0+i for i in range(13)]+[UC_ARM_REG_SP,UC_ARM_REG_LR];cases=[];stop=[]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,n,data):
 if pc in targets:stop.append(pc);uc.emu_stop()
u.hook_add(UC_HOOK_CODE,hook,begin=0x3b5c60,end=0x3b9eb8)
for seed in range(2304):
 opcode=seed%256;pattern=seed//256;rng=random.Random(81527+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));pc=P+0x1000
 if pattern==8:pc=SP+[0x360,0x35f,0x380,0x37f,0x198,0x197][seed%6]
 value=[b'\x00\x00\x00\x00',b'\x7f\xff\xff\xff',b'\x80\x00\x00\x00',b'\xff\xff\xff\xff',b'\x01\x80\x00\xff',b'\xff\x7f\xff\x00',bytes(rng.getrandbits(8)for _ in range(4)),bytes(rng.getrandbits(8)for _ in range(4)),b'\x80\x7f\xff\x00'][pattern];u.mem_write(pc,bytes([opcode])+value)
 initial=[rng.getrandbits(32)for _ in range(13)]+[SP,0x12345678];initial[5]=pc
 flags=((seed&15)<<28)|((seed&16)<<23)|((seed&15)<<16)|0x10;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);floats=[rng.getrandbits(32)for _ in range(32)];before=bytes(u.mem_read(P,SIZE))
 u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
 for reg,v in zip(regs,initial):u.reg_write(reg,v)
 for i,v in enumerate(floats):u.reg_write(UC_ARM_REG_S0+i,v)
 stop.clear();u.emu_start(ENTRY,0xffffffff,count=1000);assert len(stop)==1,(seed,hex(u.reg_read(UC_ARM_REG_PC)))
 cases.append({'seed':seed,'initial':initial,'flags':flags,'control':control,'floats':floats,'registers':[u.reg_read(reg)for reg in regs],'pc':u.reg_read(UC_ARM_REG_PC),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE)))})
(root/'analysis/bytecode-native-vectors.json').write_text(json.dumps({'entry':ENTRY,'targets':targets,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original decoder cases',len(cases),flush=True)
