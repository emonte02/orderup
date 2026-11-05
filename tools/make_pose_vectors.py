#!/usr/bin/env python3
"""Original skeleton transforms: float modes, hierarchy, scales and fallbacks."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x20000;u.mem_map(0,0x500000);u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in elf.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value']for s in elf.get_section_by_name('.dynsym').iter_symbols()};name='_ZN3Gfx4Pose24ConvertToObjectSpaceFastEPNS_8SkeletonE';procedure='_ZN3Gfx4Bone19GetProceduralMatrixEb';calls=[]
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];sregs=[getattr(__import__('unicorn.arm_const',fromlist=['x']),'UC_ARM_REG_S'+str(i))for i in range(16,32)]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def bits(x):return struct.unpack('<I',struct.pack('<f',x))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,size,data):
 args=[uc.reg_read(r)for r in regs[:3]];calls.append({'args':args,'memory':hashlib.sha256(bytes(u.mem_read(P,SIZE))).hexdigest()});u.mem_write(args[0],bytes(u.mem_read(args[1]+0x60,64)));uc.reg_write(UC_ARM_REG_R0,args[0]);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=symbols[procedure],end=symbols[procedure]);cases=[]
palette=[0,0x80000000,0x3f800000,0xbf800000,0x3f000000,0xbf000000,1,0x007fffff,0x00800000,0x7f7fffff,0x7fc12345,0x7fa00001,0x7f800000,0xff800000]
for seed in range(768):
 rng=random.Random(671303+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));pose=P+0x1000;skeleton=P+0x5000;bones=P+0x6000;count=[0,1,2,3,7,16,32,94,95][seed%9];put(skeleton+0x88,bones,count);put(pose+0x2920,1 if seed&1 else 0)
 for i in range(count):
  q=[bits(rng.uniform(-1,1))for _ in range(4)];t=[bits(rng.uniform(-50,50))for _ in range(4)];scale=[bits(rng.uniform(-1,2))for _ in range(4)];bone_scale=[bits(rng.uniform(-1,2))for _ in range(3)]
  if seed%11==0:q=[palette[(seed+i+k)%len(palette)]for k in range(4)]
  if seed%13==0:q=[0,0x80000000,0,0x80000000];bone_scale=[0,0x80000000,0x3f800000]
  if seed%19==0:scale=[palette[(seed+i+k)%len(palette)]for k in range(4)]
  put(pose+i*16,*q);put(pose+0x5e0+i*16,*t);put(pose+0xbc0+i*16,*scale);put(bones+i*0x140+0x1c,4 if seed%17==0 and i==count-1 else 0);put(bones+i*0x140+0x120,*bone_scale);parent=rng.randrange(i)if i else 0
  if seed%23==0 and i==count-1:parent=i
  if seed%37==0 and i==count-1 and i>1:parent=-1
  u.mem_write(bones+i*0x140+0x130,struct.pack('<h',parent));put(bones+i*0x140+0x60,*[bits(rng.uniform(-2,2))for _ in range(16)])
 control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&0x9f);control=(control&0x0fffffff)|([0,0x20000000,0x60000000,0x90000000][(seed//16)%4]);before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000);args=[pose,skeleton]
 for i,reg in enumerate(regs):u.reg_write(reg,args[i]if i<len(args)else 0)
 for i,reg in enumerate(sregs):u.reg_write(reg,0x12345600+i)
 calls.clear();u.emu_start(symbols[name],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'count':count,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy(),'callee_float':[u.reg_read(reg)for reg in sregs]})
(root/'analysis/pose-native-vectors.json').write_text(json.dumps({'name':name,'procedure':procedure,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original pose cases',len(cases),flush=True)
