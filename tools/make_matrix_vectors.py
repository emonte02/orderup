#!/usr/bin/env python3
"""Original ARM matrix state/uniform references with callback mutations and FPSCR."""
from pathlib import Path
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
import struct,json,random,hashlib,zlib,base64
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;M=P+0x1000;SIZE=0x1f000;u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
symbols={s.name:s['st_value'] for s in elf.get_section_by_name('.dynsym').iter_symbols()};names=['_ZN3Gfx21AndroidManager3DGLES29SetMatrixENS_10MatrixTypeERKN4Math6MatrixEb','_ZN3Gfx13UniformMatrix8SetValueERKN4Math6MatrixE'];program=symbols['_ZN3Gfx21AndroidManager3DGLES216SetProgramMatrixEiRKN4Math6MatrixE'];entry=symbols['_ZN3Gfx7Program15UpdateConstantsEv'];slot=0x43b8bc;calls=[];seed=0
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
manager_global=get((entry+0x30+get(entry+0x350))&0xffffffff)
def callback(uc,pc,size,data):
 if pc!=program:return
 obj=uc.reg_read(UC_ARM_REG_R0);index=uc.reg_read(UC_ARM_REG_R1);source=uc.reg_read(UC_ARM_REG_R2);calls.append({'object':obj,'index':index,'matrix':bytes(uc.mem_read(source,64)).hex(),'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest(),'slot':get(slot),'control':uc.reg_read(UC_ARM_REG_FPSCR)})
 if index and seed&8:put(obj+0xc+(seed%48)*4,0x3f800001+seed)
 if index and seed&16:uc.reg_write(UC_ARM_REG_FPSCR,uc.reg_read(UC_ARM_REG_FPSCR)^0x00c00000)
 if index and seed&32:put(slot,P+0x16000)
 uc.reg_write(UC_ARM_REG_R0,0x1234+seed);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,callback,begin=program,end=program);cases=[];special=[0,0x80000000,0x7f800000,0xff800000,0x7fc01234,0x7fa12345,1,0x80000001,0x7f7fffff,0x00800000,0x3f800000,0xbf800000,0x3f000001]
for kind in range(2):
 for seed in range(512):
  rng=random.Random(7000+seed+kind*512);pattern=bytes((i*17+seed*23)&255 for i in range(256));u.mem_write(P,pattern*(SIZE//256));put(manager_global,M);put(slot,P+0x10000);put(M+0xb28,[0,500,0xfffffffe,0xffffffff][seed%4]);control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4]);source=P+0x18000;destination=P+0x6000
  def values():return [struct.unpack('<I',struct.pack('<f',rng.uniform(-4,4)))[0] if seed<256 else special[rng.randrange(len(special))] if seed<448 else rng.getrandbits(32) for _ in range(16)]
  for i in range(3):put(M+0xc+i*64,*values())
  put(source,*values())
  if kind==0:
   matrix_type=[0,1,2,0,1,2,3,7,0xffffffff][seed%9];args=[M,matrix_type,source,[0,1,0x100,0xffffffff][seed%4]]
   if seed%11==0:args[2]=M+0xc+(seed%3)*64
  else:
   if seed%4==0:source=destination+[-16,-4,0,4,16][(seed//4)%5]
   if seed%17==0:destination=M+0xb28-16 # Stamp reads occur after sequential source copies.
   args=[destination,source]
  before=bytes(u.mem_read(P,SIZE));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,reg in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3]):u.reg_write(reg,args[i]&0xffffffff if i<len(args) else 0)
  for i,reg in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):u.reg_write(reg,0x12340000+i)
  u.emu_start(symbols[names[kind]],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_SP)==0x200fff00
  cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy(),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'slot':get(slot),'result':u.reg_read(UC_ARM_REG_R0) if kind==0 else None})
(root/'analysis/matrix-native-vectors.json').write_text(json.dumps({'names':names,'symbols':{n:symbols[n] for n in names},'program_matrix':program,'base':P,'size':SIZE,'manager':M,'manager_global':manager_global,'cache_slot':slot,'cases':cases},separators=(',',':'))+'\n');print('Original matrix state/uniform cases',len(cases))
