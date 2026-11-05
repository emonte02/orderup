#!/usr/bin/env python3
"""Original script-table assignments, including resize and error callbacks."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0xe000;SP=0x200fff00
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3CVM5Assoc11SetCVMValueERKNS_7VariantES3_jPNS_6ThreadE';getters=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'];regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[];which=0;offset=0
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,n,opaque):
 if pc not in [P+0xf000,P+0xf020,P+0xf040]:return
 a=[uc.reg_read(r)for r in regs];kind={P+0xf000:'resize',P+0xf020:'error',P+0xf040:'getter'}[pc];calls.append({'kind':kind,'args':a,'sp':uc.reg_read(UC_ARM_REG_SP),'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()})
 if kind=='error':put(P+0xd000,get(P+0xd000)+1);result=0
 elif kind=='getter':
  if seed%13==0:put(a[0]+0x1c,2)
  if seed%17==0:put(P+0x8000,6,2)
  result=P+0x5000
 else:
  if seed%7==0:put(a[0],0)
  else:
   obj=a[1];put(obj+0x18,max(16,a[2]));put(a[0],1)
   if seed%11==0:
    u.mem_write(P+0x3000,bytes(u.mem_read(obj,0x200)));put(P+0xb004,P+0x3000)
  result=a[0]
 uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook)
for a in [P+0xf000,P+0xf020,P+0xf040]:put(a,0xe12fff1e)
cases=[]
for seed in range(1152):
 rng=random.Random(311831+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));obj=P+0x1000;which=seed%6;offset=0x24 if which==3 else 0x2c if which==4 else 0x20;vtable=P+0x400;tag=[2,7,9,10][seed%4];count=[0,1,3,7][(seed//4)%4];capacity=count if seed%3==0 else 16
 put(obj,vtable,0,P+0xc000);put(obj+0x14,tag,capacity,count);put(vtable+0x70,P+0xf040 if which==5 else syms[getters[which]]);put(vtable+0x74,P+0xf000);put(obj-12,P+0xa000);u.mem_write(obj-2,struct.pack('<H',16));put(P+0xa004,P+0xb004);put(P+0xb004,obj);put(P+0xc000,P+0xc100);put(P+0xc11c,P+0xf020);put(P+0xd000,0)
 for table in [obj+offset,P+0x3000+offset,P+0x5000]:
  for i in range(16):put(table+i*16,6|(i<<5),i,3|(0x20 if seed%5==0 else 0),rng.getrandbits(32))
 key=P+0x8000;value=P+0x8100;out=P+0x8200;put(key,6|((seed%16)<<5),seed%11);put(value,[0,3,6,0x103,0x208][(seed//16)%5],P+0x9000);put(P+0x9004,0x1234)
 if seed%19==0:put(key,3,seed%11)
 if seed%23==0:value=key
 if seed%29==0:value=obj+offset+8
 if seed%31==0:value=obj+offset+12
 if seed%37==0:out=obj+0x1c
 if seed%41==0:out=key
 if seed%43==0:key=obj+offset
 flags=[0,1,2,3,0x100,0x4960,0xffffffff][(seed//64)%7];args=[out,obj,key,value,flags,0];control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&31);cpu=((seed%16)<<28)|0x10;before=bytes(u.mem_read(P,SIZE));put(SP,flags,0)
 u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(regs):u.reg_write(r,args[i])
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=500000)
 except Exception:print('Failed seed',seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':args,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy(),'callee':[u.reg_read(UC_ARM_REG_R0+i)for i in range(4,12)]})
pathlib.Path('analysis/assoc-set-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original table-assignment cases',len(cases))
