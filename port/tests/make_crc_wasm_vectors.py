#!/usr/bin/env python3
"""Generate expected outputs by executing the original ARM routine, not its C port."""
from pathlib import Path
import json,random,sys
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_LR,UC_ARM_REG_CPSR
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from recompile_crc import ElfImage,DEFAULT_ELF,ENTRY
size=8*1024*1024;string_address=0x700000;stop=0x7f0000
image=ElfImage(DEFAULT_ELF).flat_image(size)
uc=Uc(UC_ARCH_ARM,UC_MODE_ARM);uc.mem_map(0,size);uc.mem_write(0,bytes(image))
rng=random.Random(20261102)
strings=[b'',b'wad/global.wad',b'WAD/GLOBAL.WAD',b'Order Up!!',b'A\x00ignored',bytes(range(1,256))]
strings.extend(bytes(rng.randrange(1,256) for _ in range(rng.randrange(1,1000))) for _ in range(40))
cases=[]
for s in strings:
 for seed in [0,0xffffffff,0x12345678,rng.getrandbits(32)]:
  for null in [False,True] if not s else [False]:
   addr=0 if null else string_address
   uc.mem_write(string_address,s+b'\0');uc.reg_write(UC_ARM_REG_CPSR,0x10)
   uc.reg_write(UC_ARM_REG_R0,addr);uc.reg_write(UC_ARM_REG_R1,seed);uc.reg_write(UC_ARM_REG_LR,stop)
   uc.emu_start(ENTRY,stop,count=1000000)
   cases.append(dict(hex=s.hex(),seed=seed,address=addr,expected=uc.reg_read(UC_ARM_REG_R0)))
(ROOT/'port/build/crc-guest-image.bin').write_bytes(image)
(ROOT/'analysis/crc-wasm-vectors.json').write_text(json.dumps(cases,indent=2))
print('Original ARM reference vectors:',len(cases))
