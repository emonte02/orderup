#!/usr/bin/env python3
"""Untouched ARM allocator references: split direction, tags, stats and fallbacks."""
from pathlib import Path
import base64,hashlib,json,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
 if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
name='_ZN3XPL4Heap5allocERjj';address=next(s['st_value'] for sec in elf.iter_sections() if sec.name=='.dynsym' for s in sec.iter_symbols() if s.name==name);P=0x700000;seed=0;calls=[]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def get(p):return struct.unpack('<I',u.mem_read(p,4))[0]
def packed(data):return base64.b64encode(zlib.compress(data)).decode()
def hook(uc,pc,size,data):
 if pc!=P+0x1f000:return
 calls.append(dict(args=[uc.reg_read(r) for r in [UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2]],memory=hashlib.sha256(bytes(u.mem_read(P,0x1e000))).hexdigest()));uc.reg_write(UC_ARM_REG_R0,0 if seed&1 else P+0x18000);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x1f000,end=P+0x1f000)
def run(args):
 u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
 for i,r in enumerate([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2]):u.reg_write(r,args[i])
 for i,r in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):u.reg_write(r,0x12340000+i)
 u.emu_start(address,0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000;assert u.reg_read(UC_ARM_REG_SP)==0x200fff00
 for i,r in enumerate([UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11]):assert u.reg_read(r)==0x12340000+i
 return u.reg_read(UC_ARM_REG_R0)
cases=[]
for seed in range(768):
 u.mem_write(P,bytes((i*17+seed*23)&255 for i in range(0x1e000)));heap=P;manager=P+0x400;size_ref=[P+0x800,manager+0x14,heap+0x44][(seed//32)%3];count=[0,1,2,3,7,17,63][seed%7];nodes=[];cursor=P+0x2000
 for i in range(count):
  size=[32,48,64,128,256,512,1024][(seed+i)%7];nodes.append((cursor,size));cursor+=size+64
 put(heap+8,manager);put(heap+0x14,nodes[0][0] if nodes else 0,nodes[-1][0] if nodes else 0);put(heap+0x24,P+0x2000,P+0x18000);put(heap+0x34,0,0x20000000);put(heap+0x40,0xffffffff if seed&2 else 7,0xffffff00 if seed&4 else 4096);put(manager+0x14,0xffffffe0 if seed&8 else 8192,0xffffffff if seed&16 else 13);put(manager+0x2c,[0,4,8,16,32,64][(seed//7)%6]);tag=[4,8,12,16,24,32,256][(seed//11)%7];u.mem_write(manager+0x30,struct.pack('<H',tag))
 for i,(node,size) in enumerate(nodes):put(node,nodes[i+1][0] if i+1<len(nodes) else 0,nodes[i-1][0] if i else 0,size,node+size)
 if not nodes and seed&8:put(heap+0x18,P+0x2000);put(P+0x2000,0,0,128,P+0x2080)
 flags=((seed//3)%16)<<6
 if seed&1:flags|=0x10000
 if seed&32:flags|=0x40000004
 if seed%13==0:put(heap+0x34,P+0x1000);put(P+0x1000,P+0x1100);put(P+0x1100,P+0x1f000)
 requested=[0,1,4,15,16,31,32,48,63,64,96,128,255,512,2048,0xfffffff0][(seed//5)%16];put(size_ref,requested);before=bytes(u.mem_read(P,0x1e000));calls.clear();args=[heap,size_ref,flags];result=run(args);after=bytes(u.mem_read(P,0x1e000));cases.append(dict(seed=seed,args=args,result=result,before=packed(before),after=packed(after),calls=calls.copy()))
# Each sequence keeps prior split headers/counters/tags for later allocations.
sequences=[]
for seed in range(32):
 u.mem_write(P,bytes([0xa5])*0x1e000);heap=P;manager=P+0x400;put(heap+8,manager);put(heap+0x14,P+0x2000,P+0x2000);put(heap+0x24,P+0x2000,P+0x18000);put(heap+0x34,0,0);put(heap+0x40,0,0);put(manager+0x14,0,0);put(manager+0x2c,16);u.mem_write(manager+0x30,struct.pack('<H',16));put(P+0x2000,0,0,0x16000,P+0x18000);before=bytes(u.mem_read(P,0x1e000));steps=[]
 for i in range(48):
  requested=[1,16,33,64,257,1024][(seed+i)%6];flags=((seed+i)%8)<<6|((i&1)<<16);put(P+0x800,requested);result=run([heap,P+0x800,flags]);steps.append(dict(requested=requested,flags=flags,result=result,after=packed(bytes(u.mem_read(P,0x1e000)))))
 sequences.append(dict(seed=seed,before=packed(before),steps=steps))
(root/'analysis/alloc-native-vectors.json').write_text(json.dumps(dict(name=name,address=address,prefix=bytes(u.mem_read(address,8)).hex(),cases=cases,sequences=sequences),separators=(',',':'))+'\n');print(len(cases),'original allocator cases;',sum(len(s['steps']) for s in sequences),'stateful allocation steps')
