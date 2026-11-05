#!/usr/bin/env python3
"""Original mesh attribute call streams and cache state, with callback mutations."""
import pathlib,json,random,struct,zlib,base64
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x18000;SP=0x200fff00;SLOT=0x43b8bc;MANAGER=0x461e18
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3Gfx16AndroidMeshGLES213setup_buffersEv';callbacks={0xde12c:'glEnableVertexAttribArray',0xde000:'glDisableVertexAttribArray',0xde4bc:'glVertexAttribPointer'};regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[];mesh=0;buffer=0
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,n,o):
 if pc not in callbacks:return
 kind=callbacks[pc];a=[uc.reg_read(r)for r in regs];a=a+[get(uc.reg_read(UC_ARM_REG_SP)+i*4)for i in range(2)]if kind=='glVertexAttribPointer'else a[:1];calls.append({'name':kind,'args':a})
 if seed%13==0 and kind=='glVertexAttribPointer':
  put(buffer+0x18,get(buffer+0x18)+4);u.mem_write(mesh+0x62,b'\0');put(mesh+0xec,32 if len(calls)&1 else 0)
 uc.reg_write(UC_ARM_REG_R0,0);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=0xde000,end=0xde500);cases=[]
for seed in range(768):
 rng=random.Random(913887+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));mesh=P+0x1000;buffer=P+0x6000;cache=P+0x3000;u.mem_write(mesh,bytes(0x110));normals=[-1,0,1,2,3,4][seed%6];uv=[0,1,2,4,8,9][(seed//6)%6];maximum=[0,1,8,16,17][(seed//36)%5];stride=[0,16,20,32,64][(seed//180)%5]
 put(SLOT,cache);put(MANAGER,P+0x5000);put(cache+0x104,maximum);u.mem_write(cache+0x378,bytes(rng.randrange(4)for _ in range(16)));put(mesh+0xc4,stride);put(mesh+0xcc,buffer);u.mem_write(mesh+0x60,struct.pack('<h',normals));u.mem_write(mesh+0x62,bytes([uv]));put(mesh+0xd8,16);put(mesh+0xe0,32);put(mesh+0xec,[0,48,0xffffffff][seed%3]);put(mesh+0xe8,[0,64,0xffffffff][(seed//3)%3]);put(mesh+0xf4,[0,96,0xffffffff][(seed//9)%3]);u.mem_write(mesh+0xf8,bytes(rng.randrange(256)for _ in range(16)))
 put(buffer,*[0]*20);put(buffer,seed%4);put(buffer+0x10,(seed>>2)&1);put(buffer+0x18,[0,P+0x8000][(seed>>3)&1]);put(buffer+0x1c,0x1406);put(buffer+0x20,0x1401);put(buffer+0x24,0x1406);put(buffer+0x28,0x1403);put(buffer+((seed%4)+2)*4,[0,123][(seed>>4)&1])
 if seed%31==0:buffer=cache+0x360;put(mesh+0xcc,buffer);put(buffer,0);put(buffer+0x10,1);put(buffer+0x1c,0x1406);put(buffer+0x20,0x1401);put(buffer+0x24,0x1406);put(buffer+0x28,0x1403)
 before=bytes(u.mem_read(P,SIZE));cpu=((seed%16)<<28)|0x10;control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,mesh)
 for i in range(1,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=1000000)
 except Exception:print('Failed',seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':[mesh],'mutating':seed%13==0,'buffer':buffer,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy()})
pathlib.Path('analysis/mesh-buffers-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'cache_slot':SLOT,'manager':MANAGER,'cases':cases},separators=(',',':'))+'\n');print('Original mesh-buffer cases',len(cases))
