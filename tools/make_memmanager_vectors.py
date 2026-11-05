#!/usr/bin/env python3
"""Reference heap-chain selection, tags, aliases and foreign allocator calls."""
from pathlib import Path
import base64,hashlib,json,random,struct,zlib
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
root=Path(__file__).resolve().parents[1];f=(root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so').open('rb');elf=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM)
P=0x700000;SIZE=0x1e000;u.mem_map(0,0x500000);u.mem_map(P,0x20000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for p in elf.iter_segments():
    if p['p_type']=='PT_LOAD':u.mem_write(p['p_vaddr'],p.data())
names=['_ZN3XPL10MemManager5allocERjjPPNS_4HeapE','_ZN3XPL10MemManager7get_tagEPKv'];symbols={s.name:s['st_value'] for s in elf.get_section_by_name('.dynsym').iter_symbols()};calls=[];seed=0
regs=[UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3]
def put(p,*v):u.mem_write(p,struct.pack('<'+'I'*len(v),*[x&0xffffffff for x in v]))
def enc(b):return base64.b64encode(zlib.compress(b)).decode()
def hook(uc,pc,size,data):
    calls.append({'args':[uc.reg_read(r)for r in regs[:3]],'memory':hashlib.sha256(bytes(uc.mem_read(P,SIZE))).hexdigest()});uc.reg_write(UC_ARM_REG_R0,0 if seed&1 else P+0x18000);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=P+0x1f000,end=P+0x1f000)
cases=[]
for kind in range(2):
    for seed in range(768 if kind==0 else 256):
        rng=random.Random(913317+seed);u.mem_write(P,bytes((i*19+seed*17)&255 for i in range(256))*(SIZE//256));manager=P;heaps=[P+0x1000+i*0x100 for i in range(3)];size_ref=[P+0x800,manager+0x14,heaps[0]+0x44][seed%3];heap_ref=[P+0x900,size_ref,manager+0x14][(seed//3)%3]
        put(manager+0x14,0xffffffe0 if seed&8 else 8192,0xffffffff if seed&16 else 13);put(manager+0x2c,16);u.mem_write(manager+0x30,struct.pack('<H',[8,12,16,32,256][seed%5]));put(manager+0x4c,heaps[0],heaps[-1])
        for i,heap in enumerate(heaps):
            begin=P+0x3000+i*0x4000;end=begin+0x3000;put(heap+8,manager,heaps[i+1]if i<2 else 0,heaps[i-1]if i else 0);count=[0,1,2,3,7][(seed+i)%5];nodes=[(begin+j*512,[32,64,128,256][(seed+i+j)%4])for j in range(count)];put(heap+0x14,nodes[0][0]if nodes else 0,nodes[-1][0]if nodes else 0);put(heap+0x24,begin,end);put(heap+0x34,0,0);put(heap+0x40,0xffffffff if seed&2 else 7,0xffffff00 if seed&4 else 4096)
            for j,(node,size)in enumerate(nodes):put(node,nodes[j+1][0]if j+1<count else 0,nodes[j-1][0]if j else 0,size,node+size)
        if seed%13==0:
            heap=heaps[seed%3];put(heap+0x34,P+0x17000);put(P+0x17000,P+0x17100);put(P+0x17100,P+0x1f000)
        if seed%17==0:put(manager+0x4c,0)
        flags=((seed//3)%10)<<6|((seed&1)<<16);put(size_ref,[0,1,4,16,31,32,64,128,255,512,2048][(seed//5)%11]);args=[manager,size_ref,flags,heap_ref]
        if kind==1:
            pointer=0 if seed%11==0 else P+0x10000+seed%4;u.mem_write(pointer-2 if pointer else P+0x10000,struct.pack('<H',[0,2,8,256,0xffff][seed%5]));args=[pointer]
        before=bytes(u.mem_read(P,SIZE));control=((seed%4)<<22)|(((seed>>2)&3)<<24)|(seed&31);u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_FPEXC,0x40000000);u.reg_write(UC_ARM_REG_FPSCR,control);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
        for i,reg in enumerate(regs):u.reg_write(reg,args[i]if i<len(args)else 0)
        calls.clear();u.emu_start(symbols[names[kind]],0xf000000,count=2000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000,(kind,seed)
        cases.append({'kind':kind,'seed':seed,'args':args,'control':control,'result':u.reg_read(UC_ARM_REG_R0),'fpscr':u.reg_read(UC_ARM_REG_FPSCR),'before':enc(before),'after':enc(bytes(u.mem_read(P,SIZE))),'calls':calls.copy()})
(root/'analysis/memmanager-native-vectors.json').write_text(json.dumps({'names':names,'base':P,'size':SIZE,'cases':cases},separators=(',',':'))+'\n');print('Original memory manager cases',len(cases),flush=True)
