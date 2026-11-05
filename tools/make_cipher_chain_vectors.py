#!/usr/bin/env python3
"""Reference the full original SVS cipher chain, links, RNG, aliases and callbacks."""
import pathlib,json,random,struct,zlib,base64,hashlib
from unicorn import *
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
P=0x700000;SIZE=0x1e000;SP=0x200fff00
f=open('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so','rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
syms={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};name='_ZN6Crypto6SVSEnc7processERNS0_5BlockE';types=['16BlockCipherAdd32','17BlockCipherAddKey','22BlockCipherCharShuffle','18BlockCipherCharSub','23BlockCipherMask8Shuffle','24BlockCipherMask32Shuffle','16BlockCipherNoise','19BlockCipherRotate32'];keys=['_ZN6Crypto'+x+'16SetEncryptionKeyEj'for x in types];processes=['_ZN6Crypto'+x+'7ProcessEPhNS_4ModeE'for x in types];regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];seed=0;calls=[]
get=lambda p:struct.unpack('<I',u.mem_read(p,4))[0]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,n,o):
 kind='key'if pc==P+0x1f000 else 'process';a=[uc.reg_read(r)for r in regs][:2 if kind=='key'else 3];calls.append({'kind':kind,'args':a,'sp':uc.reg_read(UC_ARM_REG_SP),'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()})
 if kind=='key':put(a[0]+0x14,a[1]^0x12345678);result=a[0]
 else:put(a[1],get(a[1])^seed);result=0 if seed%7==0 else 1
 uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x1f000,end=P+0x1f020);put(P+0x1f000,0xe12fff1e);put(P+0x1f020,0xe12fff1e);cases=[]
for seed in range(512):
 rng=random.Random(812913+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));obj=P+0x1000;head=obj+0x328;objects=[P+0x4000+i*0x800 for i in range(8)];count=[0,1,4][seed%3]if seed%11==0 else 8;put(obj+0xc,[0,1,2,0xffffffff][seed%4]);put(obj+0x2c,*[rng.getrandbits(32)for _ in range(8)]);put(obj+0x4c,rng.getrandbits(32));put(obj+0x324,count);put(obj+0x328,head,1,head);put(obj+0x2a4,*objects)
 for i,cipher in enumerate(objects):
  table=P+0xa000+i*0x1200;vt=P+0x2000+i*0x20;u.mem_write(cipher,bytes(0x440));put(cipher,vt,cipher+4,cipher,cipher+4,0x7fffffff);put(vt+8,syms[keys[i]],syms[processes[i]])
  if 2<=i<=5:
   bins=64 if i==5 else 256;put(cipher+0x128,table,table+bins*8,bins,bins);put(cipher+0x138,0)
   if bins==64:put(cipher+0x28,*range(64))
   else:u.mem_write(cipher+0x28,bytes(range(256)))
   for j in range(bins*2):put(table+j*8,0,0 if j in [bins-1,bins*2-1]else table+(j+1)*8)
 if seed&1 and count:
  order=list(range(count));rng.shuffle(order)
  if seed%17==0:order=order[::-1]
  for position,i in enumerate(order):put(objects[i]+4,objects[order[position+1]]+4 if position+1<count else head,objects[i],objects[order[position-1]]+4 if position else head,0xffff0000-position*12345)
  put(head,objects[order[0]]+4,1,objects[order[-1]]+4)
 if seed%23==0:put(P+0x2000+3*0x20+8,P+0x1f000)
 if seed%29==0:put(P+0x2000+6*0x20+12,P+0x1f020)
 if seed%37==0:u.mem_write(objects[3]+0x28,bytes((i+1)%256 for i in range(256)))
 block=[obj+0x90,obj+0x190,P+0x19000][seed%3]
 if seed%31==0:block=objects[3]+0x14
 before=bytes(u.mem_read(P,SIZE));control=((seed%4)<<22)|(((seed>>2)%4)<<24)|(seed&0x9f);cpu=((seed%16)<<28)|0x10;u.reg_write(UC_ARM_REG_CPSR,cpu);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,SP);u.reg_write(UC_ARM_REG_LR,0xf000000);u.reg_write(UC_ARM_REG_R0,obj);u.reg_write(UC_ARM_REG_R1,block)
 for i in range(2,12):u.reg_write(UC_ARM_REG_R0+i,0x12340000+i)
 calls.clear()
 try:u.emu_start(syms[name],0xf000000,count=3000000)
 except Exception:print('Failed',seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0xf000000,seed
 cases.append({'seed':seed,'args':[obj,block],'control':control,'flags':cpu,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'cpsr':u.reg_read(UC_ARM_REG_CPSR),'calls':calls.copy()})
pathlib.Path('analysis/cipher-chain-native-vectors.json').write_text(json.dumps({'name':name,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original full cipher-chain cases',len(cases),flush=True)
