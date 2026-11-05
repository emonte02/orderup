#!/usr/bin/env python3
"""Full original dynamic-mesh finalize: raw vertices, callbacks and stack."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x50000;SP=0x200fff00;f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x60000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3Gfx11DynamicMesh14FinalizeMeshesEv';getter='_ZN3Gfx15AndroidMaterial22GetNumStaticUVChannelsEv';write=syms['_ZN3Gfx11DynamicMesh19WriteToVertexBufferEPhPNS0_6VertexEj'];get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
slot=write+0x3c+get(write+0x2a8);quant=write+0x110+get(write+0x2ac);assert quant==0x474e80
calls=[];seed=0;output=0;custom=False
regs=[UC_ARM_REG_R0+i for i in range(4)]
def callback(uc,pc,n,o):
 global output
 a=[uc.reg_read(r)for r in regs];sp=uc.reg_read(UC_ARM_REG_SP)
 if pc==P+0x5f080:
  # Deliberately stateful replacement: the batch must retain every invocation.
  put(P+0x41000,get(P+0x41000)+1);put(P+0x30000+((seed%8)*4),seed*987);uc.reg_write(UC_ARM_REG_FPSCR,uc.reg_read(UC_ARM_REG_FPSCR)^0x11);uc.reg_write(UC_ARM_REG_R0,seed%3);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR));return
 calls.append({'kind':'lock'if pc==P+0x5f000 else'unlock','args':a[:3],'sp':sp,'callee':[uc.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)],'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest(),'stack':enc(bytes(uc.mem_read(SP-0x100,0x100))),'quant':enc(bytes(uc.mem_read(quant,48)))})
 if pc==P+0x5f000:
  if seed%13==0:put(P+0x30000+32,seed*23)
  uc.reg_write(UC_ARM_REG_R0,output)
 else:uc.reg_write(UC_ARM_REG_R0,0x12300000+seed)
 uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,callback,begin=P+0x5f000,end=P+0x5f080)
for a in [P+0x5f000,P+0x5f040,P+0x5f080]:put(a,0xe12fff1e)
cases=[]
for seed in range(512):
 rng=random.Random(813741+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));u.mem_write(SP-0x100,rng.randbytes(0x100));u.mem_write(quant,bytes(48));put(slot,P+0x40000);u.mem_write(P+0x40000,bytes([0 if seed%11==0 else 1]));dynamic=P+0x1000;mesh=P+0x2000;handle=P+0x3000;material=P+0x4000;vt=P+0x5000;meshvt=P+0x6000;bits=P+0x7000;bitdata=P+0x8000;indices=P+0x9000;vertices=P+0x30000;output=P+0x10000;count=[0,1,2,7,32,127,576][seed%7];uv=[0,1,2,4,8][(seed//7)%5];flags=[0x40,0x48,0,8,0x9040][seed%5];custom=seed%17==0
 if seed%19==0:count=1;output=vertices+[0,4,16,32][seed%4]
 if seed%23==0:count=1;output=indices
 if seed%29==0:count=1;vertices=SP-0x70
 put(dynamic+0x168,vertices,indices,mesh);put(dynamic+0x17c,count<<16);put(dynamic+0x180,bits);put(bits,0,0 if seed%7==0 else 128,bitdata);put(mesh,meshvt);put(mesh+0x14,0xbf800000,0xc0000000,0xc0400000,0x3f800000,0x3f800000,0x40000000,0x40400000,0x3f800000);put(mesh+0x44,flags);put(mesh+0x54,handle);put(handle+8,material);put(material,vt);put(material+0x44,uv);put(vt+0x38,P+0x5f080 if custom else syms[getter]);put(meshvt+0x28,P+0x5f000);put(meshvt+0x2c,P+0x5f040);u.mem_write(mesh+0x5e,struct.pack('<h',[0,1,2,3][seed%4]))
 for i in range(count):u.mem_write(indices+2*i,struct.pack('<H',rng.randrange(32)))
 for i in range(1 if vertices>0x20000000 else 32):put(vertices+64*i,*[rng.getrandbits(32)for _ in range(16)])
 if vertices>0x20000000:u.mem_write(indices,bytes(2))
 put(P+0x41000,0);before=bytes(u.mem_read(P,SIZE));stack_before=bytes(u.mem_read(SP-0x100,0x100));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(regs):u.reg_write(r,dynamic if i==0 else 0x12340000+i)
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 for i in range(16,32):u.reg_write(UC_ARM_REG_S0+i,0x12345600+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=3000000)
 except Exception:print('Failed',seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':[dynamic,0x12340001,0x12340002,0x12340003],'output':output,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'stack_before':enc(stack_before),'stack_after':enc(bytes(u.mem_read(SP-0x100,0x100))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'quant':enc(bytes(u.mem_read(quant,48))),'calls':calls.copy(),'float_callee':[u.reg_read(UC_ARM_REG_S0+i)for i in range(16,32)]})
pathlib.Path('analysis/dynamic-vertex-native-vectors.json').write_text(json.dumps({'name':name,'getter':getter,'base':P,'size':SIZE,'slot':slot,'quant':quant,'cases':cases},separators=(',',':'))+'\n');print('Original dynamic vertex cases',len(cases))
