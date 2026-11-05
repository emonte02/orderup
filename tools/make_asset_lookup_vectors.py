#!/usr/bin/env python3
"""Run untouched ARM resource searches with the existing host-bsearch contract."""
from pathlib import Path
import base64,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x10000;SP=0x200fff00;STACK=SP-512;STACK_SIZE=768;RET=0xf000000;COMPARE=0x3905b0;BSEARCH=0xde204
names=['_ZN3Gfx10TextureLib20GetTextureByChecksumE10checksum32','_ZN3Gfx11MaterialLib21GetMaterialByChecksumE10checksum32','_ZN3Wad9WADLoader9get_indexEj','_ZN3XPL6StrLenEPKc','_ZN3XPL6StrCpyEPcPKcj'];symbols={s.name:s['st_value'] for section in elf.iter_sections()if section['sh_type']in ['SHT_DYNSYM','SHT_SYMTAB']for s in section.iter_symbols()};entries=[symbols[n]for n in names]
u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(RET,4096)
for segment in elf.iter_segments():
 if segment['p_type']=='PT_LOAD':u.mem_write(segment['p_vaddr'],segment.data())
regs=[UC_ARM_REG_R0+i for i in range(13)]+[UC_ARM_REG_SP,UC_ARM_REG_LR]
def put(p,*vs):u.mem_write(p,struct.pack('<'+'I'*len(vs),*[v&0xffffffff for v in vs]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
need=False;comparisons=0
# Stop at the imported service. Its comparator executes as original ARM code,
# in a saved guest context, exactly as the current JavaScript host invokes it.
def hook(uc,pc,size,data):
 global need
 if pc==BSEARCH:need=True;uc.emu_stop()
u.hook_add(UC_HOOK_CODE,hook,begin=BSEARCH,end=BSEARCH)
def run(entry):
 global need,comparisons
 pc=entry
 while True:
  need=False;u.emu_start(pc,RET,count=1000000)
  if not need:assert u.reg_read(UC_ARM_REG_PC)==RET;return
  key,base,count,width=[u.reg_read(x)for x in regs[:4]];callback=get(u.reg_read(UC_ARM_REG_SP));lo=0;hi=count;found=0;caller=u.context_save()
  while lo<hi:
   mid=(lo+hi)>>1;point=base+mid*width
   u.reg_write(UC_ARM_REG_CPSR,0x10)
   for reg in regs[:13]:u.reg_write(reg,0)
   u.reg_write(UC_ARM_REG_R0,key);u.reg_write(UC_ARM_REG_R1,point);u.reg_write(UC_ARM_REG_LR,RET);u.emu_start(callback,RET,count=1000);result=u.reg_read(UC_ARM_REG_R0);result=result if result<0x80000000 else result-0x100000000;comparisons+=1;u.context_restore(caller)
   if not result:found=point;break
   if result<0:hi=mid
   else:lo=mid+1
  u.reg_write(UC_ARM_REG_R0,found);pc=u.reg_read(UC_ARM_REG_LR)
cases=[]
for kind in range(5):
 for seed in range(640):
  rng=random.Random(74191+kind*1000+seed);u.mem_write(P,bytes((i*13+seed*7)&255 for i in range(256))*(SIZE//256));u.mem_write(STACK,bytes((i*11+seed*3)&255 for i in range(STACK_SIZE)));this=P+0x100;wanted=[0,1,0x7fffffff,0x80000000,0xffffffff,rng.getrandbits(32)][seed%6]
  if kind<2:
   first=P+0x1000;put(this+4,first if kind==0 else 0);head=this+4 if kind==0 else first
   if kind:put(this+0x14,0 if seed%23==0 else first)
   for group in range(1 if kind==0 else 2):
    sentinel=head+12*group;count=(seed+group*17)%49;nodes=[P+0x2000+group*0x1000+i*8 for i in range(count)];put(sentinel,nodes[0]if nodes else sentinel)
    for i,node in enumerate(nodes):
     obj=P+0x5000+group*0x1000+i*32;null=(seed%17==0 and i==seed%max(1,count));put(node,nodes[i+1]if i+1<count else sentinel,0 if null else obj);key=wanted if (i==seed%max(1,count) or seed%11==0 and i==count//2)else rng.getrandbits(32);put(obj+0x18,key)
  elif kind==2:
   header=P+0x1000;base=P+0x2000;count=seed%65;keys=sorted(rng.getrandbits(32)for i in range(count))
   if count and seed%3:keys[seed%count]=wanted;keys.sort()
   if count>2 and seed%7==0:keys=[wanted]*count
   if seed%5==0: rng.shuffle(keys)
   put(this+0x13c,header,base);put(header+8,count)
   for i,key in enumerate(keys):put(base+i*8,key,(0x12340000+i*17)&0xffffffff)
   if seed%31==0:
    # An original local-stack write can alter the table; preserve fallback.
    base=SP-24;count=5;put(this+0x140,base);put(header+8,count)
    for i in range(count):put(base+i*8,wanted+i,i+100)
  if kind>=3:
   source=P+0x8000;destination=P+0x9000;length=[0,1,2,3,7,31,64,128,1024][seed%9];raw=bytes(rng.randrange(1,256)for i in range(length))+b'\0';u.mem_write(source,raw);limit=[0,1,2,3,8,32,128,1024,0xffffffff,0x80000000][seed%10]
   if seed%13==0:destination=source+1;limit=32
   elif seed%13==1:destination=source
   elif seed%13==2:destination=source-1
   if seed%17==0:source=SP-16;u.mem_write(source,b'ab\0Z');limit=3
   elif seed%17==1 and kind==4:destination=SP-16;limit=3
   if kind==4 and seed%29==0:source=0xffffffff;destination=0xffffffff;limit=0
  initial=[rng.getrandbits(32)for i in range(13)]+[SP,RET];initial[0]=this;initial[1]=wanted;
  if kind==3:initial[0]=source
  if kind==4:initial[0]=destination;initial[1]=source;initial[2]=limit
  flags=((seed&15)<<28)|((seed&16)<<23)|((seed&15)<<16)|0x10;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(STACK,STACK_SIZE));u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
  for reg,value in zip(regs,initial):u.reg_write(reg,value)
  for i in range(32):u.reg_write(UC_ARM_REG_S0+i,(seed*31+i*17)&0xffffffff)
  run(entries[kind]);cases.append({'kind':kind,'seed':seed,'initial':initial,'flags':flags,'control':control,'registers':[u.reg_read(reg)for reg in regs],'cpsr':u.reg_read(UC_ARM_REG_CPSR),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'s':[u.reg_read(UC_ARM_REG_S0+i)for i in range(32)],'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(STACK,STACK_SIZE)))})
(root/'analysis/asset-lookup-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'sp':SP,'stack':STACK,'stack_size':STACK_SIZE,'comparator':COMPARE,'cases':cases},separators=(',',':'))+'\n');print('Original ARM cases',len(cases),'original comparator calls',comparisons,flush=True)
