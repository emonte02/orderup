#!/usr/bin/env python3
"""Original material zero-texture iterations, including GL/virtual mutation."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);P=0x700000;SIZE=0x18000;SP=0x200fff00;ENTRY=0x380954;SLOT=0x43b8bc
u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000)
for seg in elf.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
def put(p,*vs):u.mem_write(p,struct.pack('<'+'I'*len(vs),*[v&0xffffffff for v in vs]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
callbacks={0xde15c:'glActiveTexture',0xde24c:'glBindTexture',P+0x1f000:'customSetTexture'};calls=[];stop=[];seed=0
regs=[UC_ARM_REG_R0+i for i in range(13)]+[UC_ARM_REG_SP,UC_ARM_REG_LR]
def hook(uc,pc,n,data):
 if pc in [0x38095c,0x380908]:stop.append(pc);uc.emu_stop();return
 if pc not in callbacks:return
 name=callbacks[pc];args=[uc.reg_read(UC_ARM_REG_R0),uc.reg_read(UC_ARM_REG_R1)]+([uc.reg_read(UC_ARM_REG_R2)]if name=='customSetTexture'else[]);args=args[:1]if name=='glActiveTexture'else args
 calls.append({'name':name,'args':args,'cache_pointer':get(SLOT),'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()})
 if seed&16:put(SLOT,P+0x6000)
 if seed&32:put(P+0x8000+min(9,seed%10+1)*4,0)
 uc.reg_write(UC_ARM_REG_R0,seed+123);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=0,end=0xffffffff);cases=[]
for seed in range(512):
 rng=random.Random(32871+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));manager=P+0x1000;vtable=P+0x3000;slot=P+0x9000;array=P+0x8000;index=seed%10;put(slot,manager);put(manager,vtable);put(vtable+0xec,P+0x1f000 if seed%13==0 else 0x33c06c);put(SLOT,P+0x4000)
 for cache in [P+0x4000,P+0x6000]:
  put(cache+0x114,[0,1,2,4,8,10,16,0xffffffff][(seed//10)%8]);put(cache+0x328,0xffffffff)
  for i in range(16):put(cache+0x11c+i*4,0 if (seed+i)%7 else 0x12340000+i)
 for i in range(10):put(array+i*4,0 if i<=index or (seed+i)%5 else P+0xa000+i*0x80)
 for i in range(10):put(P+0xa000+i*0x80+0x40,1);put(P+0xa000+i*0x80+0x44,0x45670000+i)
 initial=[rng.getrandbits(32)for _ in range(13)]+[SP,0x12345678];initial[7]=index;initial[8]=slot;initial[10]=array+index*4;flags=((seed&15)<<28)|0x10;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);before=bytes(u.mem_read(P,SIZE));u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
 for reg,value in zip(regs,initial):u.reg_write(reg,value)
 calls.clear();stop.clear();u.emu_start(ENTRY,0xffffffff,count=1000000);assert len(stop)==1,(seed,hex(u.reg_read(UC_ARM_REG_PC)))
 cases.append({'seed':seed,'initial':initial,'flags':flags,'control':control,'registers':[u.reg_read(reg)for reg in regs],'pc':u.reg_read(UC_ARM_REG_PC),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy(),'final_slot':get(SLOT)})
(root/'analysis/material-native-vectors.json').write_text(json.dumps({'entry':ENTRY,'cache_slot':SLOT,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original material-loop cases',len(cases),flush=True)
