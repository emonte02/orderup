#!/usr/bin/env python3
"""Original ARM animation keys, interpolation, aliases and changed key callbacks."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x10000;SP=0x200fff00;f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};names=['_ZNK3Gfx8AnimQKey7GetQuatERN4Math4QuatEi','_ZNK3Gfx8BoneAnim7GetQuatEjRN4Math4QuatE','_ZNK3Gfx8BoneAnim14GetTranslationEjRN4Math6VectorE','_ZNK3Gfx8BoneAnim8GetScaleEjRN4Math6VectorE'];helper=syms[names[0]];prefix=bytes(u.mem_read(helper,8));get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def fl(x):return struct.unpack('<I',struct.pack('<f',x))[0]
regs=[UC_ARM_REG_R0+i for i in range(4)];seed=0;calls=[];bone=P+0x1000

def hook(uc,pc,n,o):
 a=[uc.reg_read(r)for r in regs];calls.append({'args':a[:3],'sp':uc.reg_read(UC_ARM_REG_SP),'callee':[uc.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)],'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()});put(P+0xf000,get(P+0xf000)+1);put(a[0],get(a[0])+1)
 for i in range(4):put(a[1]+i*4,fl((seed%19+i+1)/23))
 u.mem_write(bone+6,struct.pack('<H',20));uc.reg_write(UC_ARM_REG_FPSCR,uc.reg_read(UC_ARM_REG_FPSCR)^0x11);uc.reg_write(UC_ARM_REG_CPSR,uc.reg_read(UC_ARM_REG_CPSR)^0x20000000);uc.reg_write(UC_ARM_REG_R0,0x12340000+seed);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x1f000,end=P+0x1f000);put(P+0x1f000,0xe12fff1e)
palette=[0,0x80000000,1,0x007fffff,0x00800000,0x3f800000,0xbf800000,0x7f7fffff,0x7f800000,0xff800000,0x7fc12345,0x7fa00001];cases=[]
for kind in range(4):
 for seed in range(512):
  rng=random.Random(815041+kind*10000+seed);u.mem_write(P,bytes((i*17+seed*23+kind*11)&255 for i in range(256))*(SIZE//256));u.mem_write(SP-0x200,rng.randbytes(0x200));u.mem_write(helper,prefix);bone=P+0x1000;out=P+0x2000;base=P+0x4000;count=[0,1,2,3,7,16,31,64][seed%8];stride=8 if seed%2==0 else 20
  if kind==1 and seed%47==0:stride=12
  if kind==0 and seed%29==0:stride=[0,4,12,0xffffffff][(seed//29)%4]
  step=stride if kind==1 and stride in[8,12,20] else 20;times=[]
  for i in range(max(1,count)+1):
   tm=17+i*37;times.append(tm)
   if kind<2:
    p=base+i*step;put(p,tm)
    if (kind==1 and stride==8)or(kind==0 and stride==8):u.mem_write(p+4,bytes([0,0,0,0]if seed%17==0 else[rng.randrange(256)for _ in range(4)]))
    else:put(p+4,*[(palette[(seed+i+k)%len(palette)]if seed%13==0 else fl(rng.uniform(-2,2)))for k in range(4)])
   else:put(base+i*16,*[(palette[(seed+i+k)%len(palette)]if seed%13==0 else fl(rng.uniform(-100,100)))for k in range(3)],tm)
  put(bone,0,0,base,base,base);u.mem_write(bone+(0 if kind==1 else 2 if kind==2 else 4),struct.pack('<H',count));u.mem_write(bone+6,struct.pack('<H',stride&65535));time=[0,17,18,times[max(0,count//2)],times[max(0,count-1)]+1,0xffffffff][(seed//8)%6]
  if seed%7==0:out=base+[0,4,8,12,16][seed%5]
  if kind and seed%19==0:out=bone+4
  if seed%23==0:out=SP-0x30
  changed=kind==1 and seed%11==0
  if changed:put(helper,0xe51ff004,P+0x1f000)
  u.ctl_remove_cache(helper,helper+216)
  put(P+0xf000,0);args=[base,out,stride,0x12345678]if kind==0 else[bone,time,out,0x12345678];before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(SP-0x200,0x200));output_before=bytes(u.mem_read(out,16));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|(0x08000000 if seed%2 else 0)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,r in enumerate(regs):u.reg_write(r,args[i])
  for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
  for i in range(16,32):u.reg_write(UC_ARM_REG_S0+i,0x12345600+i)
  calls.clear()
  try:u.emu_start(syms[names[kind]],0xf000000,count=1000000)
  except Exception:print('Failed',kind,seed,count,stride,hex(u.reg_read(UC_ARM_REG_PC)));raise
  assert u.reg_read(UC_ARM_REG_PC)==0xf000000,(kind,seed)
  assert bool(calls)==changed,(kind,seed,'changed callback was not executed')
  cases.append({'kind':kind,'seed':seed,'args':args,'out':out,'changed_helper':changed,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'output_before':enc(output_before),'output_after':enc(bytes(u.mem_read(out,16))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'float_callee':[u.reg_read(UC_ARM_REG_S0+i)for i in range(16,32)],'calls':calls.copy()})
pathlib.Path('analysis/animation-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original animation cases',len(cases))
