#!/usr/bin/env python3
from pathlib import Path
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_CPSR,UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_PC
from elftools.elf.elffile import ELFFile
import hashlib,json,random
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f)
u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x2000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
rng=random.Random(20261102);initial=bytes(rng.getrandbits(8) for _ in range(4096));cases=[]
for kind,entry,symbol in [('set',0x3a4b88,'_ZN3XPL6MemSetEPvij'),('copy',0x3a4b0c,'_ZN3XPL6MemCpyEPvPKvj'),('move',0x3e05e8,'_ZN3XPL7MemMoveEPvPKvj')]:
 for n in [0,1,2,7,16,31,64,255,512,1000]:
  for offset in [-17,-1,0,1,17,1200]:
   dest=0x700400;source=dest+offset
   args=[dest, rng.choice([0,1,0xabcdef80,0xffffffff]) if kind=='set' else source,n]
   u.mem_write(0x700000,initial);u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
   for reg,value in zip([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2],args):u.reg_write(reg,value)
   u.emu_start(entry,0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
   cases.append(dict(symbol=symbol,args=args,expected=hashlib.sha256(bytes(u.mem_read(0x700000,4096))).hexdigest()))
(root/'analysis/memory-native-vectors.json').write_text(json.dumps(dict(initial=initial.hex(),cases=cases),indent=2)+'\n')
print(len(cases),'original ARM memory-helper reference cases generated.')
