#!/usr/bin/env python3
"""Original dynamic-mesh update, including every callback and stack byte."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x20000;SP=0x200fff00;f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x30000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3Gfx11DynamicMesh6UpdateERKN4Math6MatrixE';callbacks=['_ZN3Gfx8Instance9SetMatrixERKN4Math6MatrixE','_ZN3Gfx8Instance14GetBoundingBoxEv','_ZNK3Gfx4BboxmlERN4Math6MatrixE']
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0];calls=[];seed=0
regs=[UC_ARM_REG_R0+i for i in range(4)]
def hook(uc,pc,n,o):
 kind=(pc-P-0x2f000)//64;a=[uc.reg_read(r)for r in regs];calls.append({'kind':kind,'args':a[:3],'sp':uc.reg_read(UC_ARM_REG_SP),'callee':[uc.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)],'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest(),'stack':enc(bytes(uc.mem_read(SP-0x120,0x120)))})
 put(P+0x1f000,get(P+0x1f000)+1);uc.reg_write(UC_ARM_REG_FPSCR,uc.reg_read(UC_ARM_REG_FPSCR)^0x11)
 if kind==2:
  put(a[0],*[seed*12345+i*77 for i in range(8)]);answer=a[0]
 elif kind==1:answer=P+0x6000
 else:answer=a[0]
 uc.reg_write(UC_ARM_REG_R0,answer);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
for i,n in enumerate(callbacks):put(syms[n],0xe51ff004,P+0x2f000+i*64);put(P+0x2f000+i*64,0xe12fff1e)
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x2f000,end=P+0x2f080)
palette=[0,0x80000000,1,0x007fffff,0x00800000,0x3f800000,0x3c23d70a,0x7f7fffff,0x7f800000,0xff800000,0x7fc12345,0x7fa00001];cases=[]
for seed in range(512):
 rng=random.Random(813941+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));u.mem_write(SP-0x120,rng.randbytes(0x120));dynamic=P+0x1000;mesh=P+0x2000;vertices=P+0x8000;model=P+0x4000;matrix=P+0x5000;count=[0,1,2,9,32,127,1024][seed%7]
 if seed%19==0:count=1;mesh=vertices-0x14
 if seed%23==0:mesh=dynamic-0x14
 if seed%29==0:count=1;vertices=SP-0x40
 for i in range(count):put(vertices+64*i,*[(palette[(seed+i+k)%len(palette)] if seed%11==0 else struct.unpack('<I',struct.pack('<f',rng.uniform(-100,100)))[0])for k in range(3)]);put(vertices+64*i+0x38,0 if seed%17==0 else rng.randrange(4))
 put(dynamic+0x168,vertices,0,mesh,seed%3 if seed%13==0 else 0);u.mem_write(dynamic+0x17a,struct.pack('<H',count));u.mem_write(dynamic+0x189,bytes([seed%2 if seed%7==0 else 1]));put(mesh+0x58,model);put(P+0x1f000,0);before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(SP-0x120,0x120));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 args=[dynamic,matrix,0x12340002,0x12340003]
 for i,r in enumerate(regs):u.reg_write(r,args[i])
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 for i in range(16,32):u.reg_write(UC_ARM_REG_S0+i,0x12345600+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=1000000)
 except Exception:print('Failed',seed,count,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':args,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(SP-0x120,0x120))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'float_callee':[u.reg_read(UC_ARM_REG_S0+i)for i in range(16,32)],'calls':calls.copy()})
pathlib.Path('analysis/dynamic-bounds-native-vectors.json').write_text(json.dumps({'name':name,'callbacks':callbacks,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original dynamic bounds cases',len(cases))
