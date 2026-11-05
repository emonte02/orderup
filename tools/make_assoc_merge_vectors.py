#!/usr/bin/env python3
"""Full original associative merges, with real scalar copies and complex callbacks."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x1e000;SP=0x200fff00;SH=P+0x8000;DH=P+0x8100
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3CVM5Assoc8MergeCVMEPPS0_5xboolS3_PNS_6ThreadE';copy='_ZN3CVM7Variant4CopyERKS0_PNS_6ThreadE';getters=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'];regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[];copies=0;count=0;src_offset=0;dst_offset=0
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def move_objects():
 for handle,dest,owner in [(SH,P+0x10000,P+0xe500),(DH,P+0x12000,P+0xe510)]:
  old=get(handle);u.mem_write(dest,bytes(u.mem_read(old,0x900)));put(dest-12,owner);u.mem_write(dest-2,struct.pack('<H',16));put(owner+4,handle);put(handle,dest)
def hook(uc,pc,n,o):
 global copies
 if pc==syms[copy]:
  a=[uc.reg_read(r)for r in regs];tag=get(a[2]);complex_copy=bool(tag&0x600)or(tag&31)in [8,9,10,12]
  if not complex_copy:return
  kind='copy'
 elif pc in [P+0x1f000,P+0x1f020,P+0x1f040]:a=[uc.reg_read(r)for r in regs];kind={P+0x1f000:'resize',P+0x1f020:'getter',P+0x1f040:'error'}[pc]
 else:return
 args=a[:1]if kind=='getter'else a;calls.append({'kind':kind,'args':args,'sp':uc.reg_read(UC_ARM_REG_SP),'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()})
 if kind=='copy':
  copies+=1
  if seed%23==0:put(a[0],0)
  else:
   put(a[1]+4,0x12340000+copies);put(a[1],3);put(a[0],1)
   if seed%7==0 and copies==1:move_objects()
  result=a[0]
 elif kind=='resize':
  if seed%11==0:put(a[0],0)
  else:
   put(a[1]+0x18,max(a[2],64));put(a[0],1)
   if seed%13==0:move_objects()
  result=a[0]
 elif kind=='getter':
  is_source=a[0]==get(SH);offset=src_offset if is_source else dst_offset
  if is_source and seed%17==0:put(a[0]+0x1c,max(1,count//2))
  result=a[0]+offset
 else:put(P+0xe700,get(P+0xe700)+1);result=0
 uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);put(P+0x1f100,0xe590001c,0xe12fff1e)
for pc in [P+0x1f000,P+0x1f020,P+0x1f040]:put(pc,0xe12fff1e)
cases=[]
for seed in range(512):
 rng=random.Random(883521+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));src=P+0x2000;dst=P+0x6000;count=[0,1,2,7,16,31][seed%6];used=[0,1,3,7][(seed//6)%4];capacity=min(64,used+[0,1,3,64][(seed//24)%4]);sw=seed%6;dw=(seed//6)%6;src_offset=0x24 if sw==3 else 0x2c if sw==4 else 0x20;dst_offset=0x24 if dw==3 else 0x2c if dw==4 else 0x20
 def initialize(obj,handle,owner,which,offset,n,cap,tag):
  vt=P+0x400+(obj%0x10000)//4;put(obj,vt,0,P+0xe800);put(obj+0x14,tag,cap,n);put(obj-12,owner);u.mem_write(obj-2,struct.pack('<H',16));put(owner+4,handle);put(handle,obj);put(vt+0x38,P+0x1f100);put(vt+0x70,P+0x1f020 if which==5 else syms[getters[which]]);put(vt+0x74,P+0x1f000)
  for i in range(64):put(obj+offset+i*16,6,i,3,rng.getrandbits(32))
 initialize(src,SH,P+0xe500,sw,src_offset,count,64,9);initialize(dst,DH,P+0xe510,dw,dst_offset,used,capacity,2 if seed&1 else 9)
 # Proper nested associative objects permit the original recursive branch.
 for obj,handle,owner in [(P+0xa000,P+0xe300,P+0xe520),(P+0xb000,P+0xe304,P+0xe530)]:initialize(obj,handle,owner,2,0x20,1,64,9)
 put(P+0xa020,6,777,3,10);put(P+0xb020,6,777,0x103,20)
 put(P+0xc000,P+0xc100);put(P+0xc104,0x12340000|[0,1,0xffff,0xfffe][seed%4]);put(P+0xc114,0x40);put(P+0xe800,P+0xe900);put(P+0xe91c,P+0x1f040);put(P+0xe700,0)
 overwrite=P+0xe100;recursive=P+0xe104;put(overwrite,[0,1,0xffffffff][(seed//96)%3]);put(recursive,(seed//32)&1)
 for i in range(count):
  selector=i%3 if seed%3==0 else(i+seed)%9;tag,value=[(0x103,rng.getrandbits(32)),(4,rng.getrandbits(32)),(0x104,rng.getrandbits(32)),(0x505,P+0xc000),(0x508,P+0xc000),(0x2509,P+0xe304),(0x2409,P+0xe304),(0x1103,P+0xc000),(0,0)][selector];key=(i+seed%4)%35;put(src+src_offset+i*16,6,key,tag,value)
  if selector in [5,6] and key<used:put(dst+dst_offset+key*16+8,0x2509,P+0xe300)
 if seed%43==0 and count:put(src+src_offset,3,123)
 if seed%41==0:overwrite=dst+0x1c
 out=P+0xe000
 if seed%47==0:out=dst+dst_offset+8
 args=[out,dst,SH,overwrite,recursive,0];before=bytes(u.mem_read(P,SIZE));cpu=((seed%16)<<28)|0x10;control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);put(SP,recursive,0);u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate(regs):u.reg_write(r,args[i])
 for i in range(4,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 calls.clear();copies=0
 try:u.emu_start(syms[name],0xf000000,count=4000000)
 except Exception:print('Failed',seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'count':count,'src_offset':src_offset,'dst_offset':dst_offset,'args':args,'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy()})
pathlib.Path('analysis/assoc-merge-native-vectors.json').write_text(json.dumps({'name':name,'copy':copy,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original complete table-merge cases',len(cases),flush=True)
