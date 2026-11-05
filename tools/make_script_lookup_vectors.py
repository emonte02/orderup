#!/usr/bin/env python3
"""Untouched ARM script-value, identifier-bank and gesture-CRC references."""
from pathlib import Path
import json,struct,random,zlib,base64,hashlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);P=0x700000;SIZE=0x10000;u.mem_map(P,SIZE);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for s in e.iter_segments():
 if s['p_type']=='PT_LOAD':u.mem_write(s['p_vaddr'],s.data())
symbols={s.name:s['st_value']for s in e.get_section_by_name('.dynsym').iter_symbols()};names=['_ZNK3CVM5Assoc11GetCVMValueERKNS_7VariantERS1_','_ZN3CVM9IdentBank14GetIdentHandleEPKcPNS_6ThreadE','_ZN3Crc21GenerateCRCFromStringEPKcj'];getter_names=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'];nil_string=symbols['_ZN3CVM7Machine12GetCVMStringEPKcPNS_6ThreadE'];calls=[];seed=0
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3];callee=[UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def crc(text,initial=0xffffffff):
 value=initial
 for c in text:
  if 65<=c<=90:c+=32
  value^=c
  for k in range(8):value=(value>>1)^(0xedb88320 if value&1 else 0)
 return value
def hook(uc,pc,size,data):
 if pc not in [P+0xf000,P+0xf020,P+0xf040,nil_string]:return
 args=[uc.reg_read(x)for x in regs];snapshot=bytearray(uc.mem_read(P,SIZE))
 for offset in [0xf000,0xf020,0xf040]:snapshot[offset:offset+8]=bytes(8)
 memory=hashlib.sha256(snapshot).hexdigest()
 if pc==P+0xf000:
  calls.append({'name':'table','object':args[0],'memory':memory})
  if seed&8:put(args[0]+0x1c,7)
  if seed&16:put(P+0x1200,6,0x89)
  result=P+0x4000
 elif pc==P+0xf020:calls.append({'name':'text','object':args[0],'memory':memory});put(P+0x100c,get(P+0x100c)+1);result=args[0]+0x1c
 elif pc==nil_string:calls.append({'name':'nil_string','machine':args[1],'text':args[2],'memory':memory});put(args[0],0);result=args[0]
 else:calls.append({'name':'error','machine':args[0],'text':args[3],'memory':memory});put(P+0x1010,get(P+0x1010)+1);result=0
 uc.reg_write(UC_ARM_REG_R0,result);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook);cases=[]
for kind,n in [(0,384),(1,256),(2,512)]:
 for seed in range(n):
  rng=random.Random(91331+kind*1000+seed);u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(256))*(SIZE//256));control=((seed%4)<<22)|(((seed>>2)&3)<<24)|([0,0x81,0x1f,0][(seed>>4)%4])
  if kind==0:
   obj=P+0x1000;key=P+0x1200;out=P+0x1400;result=P+0x1600;which=seed%6;offset=0x24 if which==3 else 0x2c if which==4 else 0x20;put(obj,P+0x800);put(P+0x870,P+0xf000 if which==5 else symbols[getter_names[which]]);put(obj+0x14,[2,7,8][seed%3]);put(obj+0x1c,[0,1,3,7,9,0xffffffff][seed%6]);put(key,6|(seed<<5),0x80+seed%9)
   if seed%17==0:put(obj+0x14,2);put(key,3,0x80+seed%9)
   for table in [obj+offset,P+0x4000]:
    for i in range(10):
     tag=[3,0x203,0x406,0x608][(seed+i)%4];value=P+0x8000+i*0x40;put(value+4,0x12340000|[0,1,0xffff,0xfffe][i%4]);put(P+0x9000+i*4,value)
     put(table+i*16,[6,3][seed%17==0],0x80+i,tag,(P+0x9000+i*4)if tag&0x400 else value)
   if seed%11==0:out=P+0x4008 if which==5 else obj+offset+8
   if seed%13==0:result=key
   if seed%19==0:result=out+4
   if seed%23==0:out=obj+offset+12;put(obj+offset+8,3)
   args=[result,obj,key,out]
  elif kind==1:
   bank=P+0x1000;query=P+0x9000;query_data=b'tArGeT_Name';u.mem_write(query,query_data+b'\0');hash=crc(query_data);capacity=[1,2,3,8,17][seed%5];put(bank,P+0x2000,capacity,P+0xb000,0,0);u.mem_write(P+0x2000,b'\0'*128);put(P+0x2000+(hash%capacity)*4,P+0x3000);put(P+0xb000,P+0xb100);put(P+0xb11c,P+0xf040)
   for i,text in enumerate([b'first',b'hash_collision',query_data,b'target_name']):
    obj=P+0x4000+i*0x40;string=P+0x6000+i*0x100;put(P+0x3000+i*4,obj);put(obj+8,0 if i==1 and seed&4 else P+0x5000+i*4);put(obj+0x10,hash^1 if i==0 else hash);put(obj+0x14,P+0x3000+(i+1)*4 if i<3 else 0);put(P+0x5000+i*4,string);put(string,P+0x8000);u.mem_write(string+0x1c,text+b'\0')
   put(P+0x800c,P+0xf020 if seed&8 else symbols['_ZNK3CVM12StringObject4TextEv'])
   if seed%11==0:put(bank+4,0)
   if seed%13==0:query=0
   if seed%17==0 and query:u.mem_write(query,b'absent\0')
   args=[bank,query,0]
  else:
   text=P+0x1000;data=bytes(rng.randrange(1,256)for i in range(seed%129));u.mem_write(text,data+b'\0');args=[0 if seed%23==0 else text,rng.getrandbits(32)]
  before=bytes(u.mem_read(P,SIZE));calls.clear();u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,reg in enumerate(regs):u.reg_write(reg,args[i]if i<len(args)else 0)
  for i,reg in enumerate(callee):u.reg_write(reg,0x12340000+i)
  try:u.emu_start(symbols[names[kind]],0xf000000,count=3000000)
  except Exception:print('failed',kind,seed,hex(u.reg_read(UC_ARM_REG_PC)));raise
  assert u.reg_read(UC_ARM_REG_PC)==0xf000000
  cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'calls':calls.copy()})
(root/'analysis/script-lookup-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'nil_string':nil_string,'cases':cases},separators=(',',':'))+'\n');print('Original script lookup cases',len(cases))
