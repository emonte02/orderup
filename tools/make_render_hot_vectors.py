#!/usr/bin/env python3
"""Record original ARM render lookups, including the animation's unusual indexing."""
from pathlib import Path
import random,struct,json
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1]
f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM)
u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
def div_hook(uc,address,size,data):
 if address==0x3fae14:
  n=uc.reg_read(UC_ARM_REG_R0);d=uc.reg_read(UC_ARM_REG_R1);uc.reg_write(UC_ARM_REG_R0,n//d);uc.reg_write(UC_ARM_REG_R1,n%d);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,div_hook,begin=0x3fae14,end=0x3fae14)
def put(p,words):u.mem_write(p,struct.pack('<'+'I'*len(words),*[x&0xffffffff for x in words]))
def call(address,a,b):
 u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,a);u.reg_write(UC_ARM_REG_R1,b);u.emu_start(address,0xf000000,count=1000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;return u.reg_read(UC_ARM_REG_R0)
rng=random.Random(302026);animation=[]
for count in [0,1,2,3,8,32]:
 for period in [0,1,10,100,0xffffffff]:
  thresholds=sorted(rng.randrange(1,max(2,period)) for _ in range(count));images=[rng.getrandbits(32) for _ in range(count)];put(0x700000,[0,0,0,count,period,0x701000,0x702000]);put(0x701000,thresholds);put(0x702000,images)
  for time in [0,1,9,10,99,100,0x7fffffff,0xffffffff]+thresholds[:4]:animation.append(dict(count=count,period=period,thresholds=thresholds,images=images,time=time,expected=call(0x3423c8,0x700000,time)))
# Signed invalid counts must return zero before dereferencing arrays.
for count in [0xffffffff,0x80000000]:
 put(0x700000,[0,0,0,count,100,0,0]);animation.append(dict(count=count,period=100,thresholds=[],images=[],time=13,expected=call(0x3423c8,0x700000,13)))
cameras=[]
for count in [0,1,2,4,16]:
 for null_index in [-1]+list(range(count)):
  keys=[rng.getrandbits(32) for _ in range(count)];head=0x7033fc;put(head,[0x704000 if count else head])
  for i,key in enumerate(keys):put(0x704000+i*8,[0x704000+(i+1)*8 if i+1<count else head,0 if i==null_index else 0x705000+i*32]);put(0x705000+i*32,[0,0,0,0,key])
  for key in keys+[0,0xffffffff]:cameras.append(dict(keys=keys,null_index=null_index,key=key,expected=call(0x35f0ac,0x703000,key)))
(root/'analysis/render-hot-native-vectors.json').write_text(json.dumps(dict(animation=animation,cameras=cameras),separators=(',',':'))+'\n');print(len(animation),'original animation cases;',len(cameras),'camera lookups')
