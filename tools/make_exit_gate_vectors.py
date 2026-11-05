#!/usr/bin/env python3
"""Untouched ARM/Thumb stop, fault and conditional-execution boundaries."""
from pathlib import Path
import base64,json,struct,zlib
import unicorn
from unicorn import *
from unicorn.arm_const import *
P=0x700000;D=P+0x10000;STACK=P+0x20000;RET=0xf000000
regs=[UC_ARM_REG_R0+i for i in range(13)]+[UC_ARM_REG_SP,UC_ARM_REG_LR,UC_ARM_REG_PC]
loop=[0xe3a04000,0xea000005]+[0xe1a00000]*6+[0xe2944001,0xe5814000,0xe3540003,0x1afffffb,0xe12fff1e]
def arm(words):return struct.pack('<'+'I'*len(words),*words)
def thumb(words):return struct.pack('<'+'H'*len(words),*words)
specs=[]
for kind,offset,occurrence in [('block',0x20,1),('block',0x20,2),('code',0x20,1),('code',0x28,1),('code',0x2c,2)]:specs.append(dict(name='stop-'+kind+'-'+str(offset)+'-'+str(occurrence),code=arm(loop),stop_kind=kind,stop_address=P+offset,stop_occurrence=occurrence))
for count in [1,2,3,4,5,8,12]:specs.append(dict(name='instruction-count-'+str(count),code=arm(loop),count=count))
specs.append(dict(name='arm-loop-completion',code=arm(loop)))
for mode in ['arm','thumb']:
 for value in [0,1]:specs.append(dict(name=mode+'-conditional-load-'+str(value),thumb=mode=='thumb',code=arm([0xe3500000,0x15912000,0xe2833001,0xe12fff1e])if mode=='arm'else thumb([0x2800,0xbf08,0x680a,0x3301,0x4770]),r0=value,r1=0x730000))
 specs.append(dict(name=mode+'-unmapped-read',thumb=mode=='thumb',code=arm([0xe5910000,0xe12fff1e])if mode=='arm'else thumb([0x6808,0x4770]),r1=0x730000))
 specs.append(dict(name=mode+'-cross-page-read',thumb=mode=='thumb',code=arm([0xe5910000,0xe12fff1e])if mode=='arm'else thumb([0x6808,0x4770]),r1=D+4094))
 specs.append(dict(name=mode+'-protected-write',thumb=mode=='thumb',code=arm([0xe5810000,0xe12fff1e])if mode=='arm'else thumb([0x6008,0x4770]),readonly=True))
 specs.append(dict(name=mode+'-undefined-instruction',thumb=mode=='thumb',code=arm([0xe7f000f0])if mode=='arm'else thumb([0xde00])))
cases=[]
for seed,spec in enumerate(specs):
 u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(P,4096);u.mem_map(D,4096);u.mem_map(STACK,4096);u.mem_map(RET,4096);u.mem_write(P,spec['code']);data=bytes((i*19+seed)&255 for i in range(4096));u.mem_write(D,data)
 if spec.get('readonly'):u.mem_protect(D,4096,UC_PROT_READ)
 initial=[(0x12340000+i*0x111+seed)&0xffffffff for i in range(13)]+[STACK+4080,RET,P];initial[0]=spec.get('r0',0x13579bdf);initial[1]=spec.get('r1',D);flags=((seed&15)<<28)|((seed&16)<<23)|((seed&15)<<16)|0x10;control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);u.reg_write(UC_ARM_REG_CPSR,flags);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control)
 for reg,value in zip(regs,initial):u.reg_write(reg,value)
 for i in range(32):u.reg_write(UC_ARM_REG_S0+i,(seed*31+i*17)&0xffffffff)
 trace={'code':[],'block':[],'invalid':[]};seen={'code':0,'block':0}
 def instruction(uc,pc,size,kind):
  trace[kind].append([pc,size])
  if spec.get('stop_kind')==kind and pc==spec.get('stop_address'):
   seen[kind]+=1
   if seen[kind]==spec['stop_occurrence']:uc.emu_stop()
 def invalid(uc,kind,address,size,value,user):trace['invalid'].append([kind,address,size,str(value&0xffffffffffffffff)]);return False
 u.hook_add(UC_HOOK_CODE,instruction,'code');u.hook_add(UC_HOOK_BLOCK,instruction,'block');u.hook_add(UC_HOOK_MEM_INVALID,invalid)
 error=0
 try:u.emu_start(P|int(spec.get('thumb',False)),RET,count=spec.get('count',1000))
 except UcError as exc:error=exc.errno
 cases.append(dict(spec={k:v for k,v in spec.items()if k!='code'},code=base64.b64encode(spec['code']).decode(),initial=initial,flags=flags,control=control,data_before=base64.b64encode(zlib.compress(data)).decode(),data_after=base64.b64encode(zlib.compress(bytes(u.mem_read(D,4096)))).decode(),registers=[u.reg_read(reg)for reg in regs],cpsr=u.reg_read(UC_ARM_REG_CPSR),fpscr=u.reg_read(UC_ARM_REG_FPSCR),s=[u.reg_read(UC_ARM_REG_S0+i)for i in range(32)],error=error,trace=trace))
root=Path(__file__).resolve().parents[1];(root/'port/tests/fixtures').mkdir(parents=True,exist_ok=True);(root/'port/tests/fixtures/exit-gate-native.json').write_text(json.dumps(dict(reference_engine='Unicorn '+unicorn.__version__,data_encoding='zlib_base64',code=P,data=D,stack=STACK,ret=RET,cases=cases),separators=(',',':'))+'\n');print('Original boundary cases',len(cases))
