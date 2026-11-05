#!/usr/bin/env python3
"""Original dish cleanliness: all alpha bits, dirty maps, stack and FP modes."""
import pathlib,json,random,struct,zlib,base64
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x20000;SP=0x200fff00;f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN15CleanupMinigame7Manager22is_current_plate_cleanEv'
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
regs=[UC_ARM_REG_R0+i for i in range(4)];palette=[0,0x80000000,1,0x007fffff,0x00800000,0x3f800000,0x3c23d70a,0x7f7fffff,0x7f800000,0xff800000,0x7fc12345,0x7fa00001];cases=[]
for seed in range(512):
 rng=random.Random(813841+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));u.mem_write(SP-0x100,rng.randbytes(0x100));obj=P+0x1000;comp=P+0x2000;grid=comp+20;manager=P+0x3000;vt=P+0x4000;node=P+0x4800;bits=P+0x5000;bits2=P+0x5100;bitdata=P+0x6000;bitdata2=P+0x6100;vertices=P+0x8000;width=[0,1,3,7,17,32][seed%6];height=[0,1,2,9,16,32][(seed//6)%6]
 if seed%13==0:width=height=1;bitdata=vertices+44
 if seed%17==0:bitdata2=bitdata+seed%2
 if seed%19==0:width=height=1;bitdata=SP-32
 if seed%23==0:width=height=1;vertices=SP-0x60
 put(manager+0x30,0 if seed%31==0 else obj);put(obj+0xc4,node);put(node,obj+0xc4,comp,obj+0xc4);put(comp,vt);put(vt+8,syms['_ZN3Obj15GridMeshElement11GetBaseNameEv']);put(vt+12,syms['_ZN3Obj15GridMeshElement11GetBaseNameEv']);put(grid+0x168,vertices);put(grid+0x180,bits,0 if seed%3==0 else bits2);put(grid+0x18c,width,height);put(bits,0,128,bitdata);put(bits2,0,128,bitdata2)
 for i in range(width*height):
  alpha=palette[(seed+i)%len(palette)] if seed%5==0 else struct.unpack('<I',struct.pack('<f',rng.uniform(-.1,1.1)))[0];put(vertices+64*i+44,alpha)
 before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(SP-0x100,0x100));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(regs):u.reg_write(r,manager if i==0 else 0x12340000+i)
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 for i in range(16,32):u.reg_write(UC_ARM_REG_S0+i,0x12345600+i)
 try:u.emu_start(syms[name],0xf000000,count=1000000)
 except Exception:print('Failed',seed,width,height,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':[manager,0x12340001,0x12340002,0x12340003],'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(SP-0x100,0x100))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'float_callee':[u.reg_read(UC_ARM_REG_S0+i)for i in range(16,32)]})
pathlib.Path('analysis/cleanup-vertex-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original dish cleanliness cases',len(cases))
