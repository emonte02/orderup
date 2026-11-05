#!/usr/bin/env python3
"""Original bone-matrix upload preparation, including source/stack aliases."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x1c000;SP=0x200fff00;BUFFER=SP-0xe10
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3Gfx16AndroidMeshGLES210bind_bonesEPNS_8SkeletonEPNS_7ProgramE';upload='_ZN3Gfx7Program18SetBoneMatrixArrayEPKN4Math6MatrixEj';assert upload in syms
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[]
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,n,o):
 a=[uc.reg_read(r)for r in regs];calls.append({'args':a[:3],'sp':uc.reg_read(UC_ARM_REG_SP),'data':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest(),'matrices':enc(bytes(uc.mem_read(a[1],0xe00))),'callee':[uc.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)]})
 put(P+0x1b000,get(P+0x1b000)+1);put(a[1]+(seed%896)*4,seed*1777);uc.reg_write(UC_ARM_REG_FPSCR,uc.reg_read(UC_ARM_REG_FPSCR)^0x11);uc.reg_write(UC_ARM_REG_R0,(a[0]+seed)&0xffffffff);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x1f000,end=P+0x1f000);put(syms[upload],0xe51ff004,P+0x1f000);put(P+0x1f000,0xe12fff1e)
cases=[]
for seed in range(768):
 rng=random.Random(582719+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));stack_before=rng.randbytes(0xf00);u.mem_write(BUFFER,stack_before);mesh=P+0x1000;skeleton=P+0x2000;base=P+0x6000;count=[0,1,2,7,16,31,56][seed%7]
 if seed%17==0 and count<=2:base=BUFFER-0xa0
 if seed%19==0:mesh=BUFFER+0x200
 if seed%23==0:skeleton=BUFFER+0x800
 # Stack aliases become identities before the original reads the count/base.
 # Make the overlapped count word zero so this remains an ordinary valid call.
 put(mesh+0x5c,count);put(skeleton+0x88,base)
 for i in range(count):u.mem_write(mesh+0x64+i,bytes([0 if base>0x20000000 else rng.randrange(256)]))
 for i in range(256):
  if base<=0x20000000:put(base+i*0x140+0xa0,*[rng.getrandbits(32)for _ in range(16)])
 put(P+0x1b000,0);args=[mesh,skeleton,P+0x4000];before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(BUFFER,0xf00));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(regs):u.reg_write(r,args[i]if i<3 else 0x12345678)
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=1000000)
 except Exception:print('Failed',seed,count,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':args,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(BUFFER,0xf00))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy()})
pathlib.Path('analysis/bone-matrix-native-vectors.json').write_text(json.dumps({'name':name,'upload':upload,'base':P,'size':SIZE,'buffer':BUFFER,'cases':cases},separators=(',',':'))+'\n');print('Original bone-matrix cases',len(cases))
