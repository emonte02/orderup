#!/usr/bin/env python3
"""Untouched original ARM references for the other ADPCM frame decoders."""
from pathlib import Path
from unicorn import Uc,UC_ARCH_ARM,UC_MODE_ARM
from unicorn.arm_const import *
from elftools.elf.elffile import ELFFile
import random,struct,json,hashlib
root=Path(__file__).resolve().parents[1];binary=root/'analysis/game-apk/lib/armeabi-v7a/libOrderUp.so';f=binary.open('rb');e=ELFFile(f);u=Uc(UC_ARCH_ARM,UC_MODE_ARM);u.mem_map(0,0x500000);u.mem_map(0x700000,0x10000);u.mem_map(0x20000000,0x100000);u.mem_map(0xf000000,4096)
for seg in e.iter_segments():
 if seg['p_type']=='PT_LOAD':u.mem_write(seg['p_vaddr'],seg.data())
names=['_ZN3Sys5Audio20DecodeMonoADPCMFrameEPKhPsi','_ZN3Sys5Audio20DecodeMonoADPCMFrameEPKhPsii','_ZN3Sys5Audio29DecodeMonoADPCMFrameMixStereoEPKhPsiii'];symbols={s.name:s['st_value'] for s in e.get_section_by_name('.dynsym').iter_symbols()};rng=random.Random(20261104);rows=[];P=0x700000
for mode,name in enumerate(names):
 for n in range(448):
  count=[0,1,2,3,4,27,28,29,63,64,127,128,511,512][n%14];predictor=[0,1,0x7f,0x80,0xfe,0xff][n%6];index=[0,1,20,40,87,88,rng.randrange(89)][n%7];source=P+0x100+(n%2);destination=P+0x1100+(n%3);left=[-2147483648,-1000000000,-100,-1,0,1,28,99,100,200,1000000000,2147483647][n%12];right=rng.randrange(-2**31,2**31);initial=bytearray(rng.randbytes(0x3000));data=bytes([predictor,rng.randrange(256),index])+rng.randbytes(count//2)
  if n>=416:
   count=28+(n%2);destination=source+[-12,-4,0,1,2,3,4,8][n%8];data=bytes([predictor,rng.randrange(256),index])+rng.randbytes(count//2)
  initial[source-P:source-P+len(data)]=data;u.mem_write(P,bytes(initial));args=[source,destination,count] if mode==0 else [source,destination,left,count] if mode==1 else [source,destination,left,right,count];u.reg_write(UC_ARM_REG_CPSR,0x10);u.reg_write(UC_ARM_REG_SP,0x200fff00);u.reg_write(UC_ARM_REG_LR,0xf000000)
  for i,a in enumerate(args[:4]):u.reg_write([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3][i],a&0xffffffff)
  if len(args)>4:u.mem_write(0x200fff00,struct.pack('<I',args[4]))
  u.emu_start(symbols[name],0xf000000,count=3000000);assert u.reg_read(UC_ARM_REG_PC)==0xf000000
  start=min(source,destination)-P-8;end=max(source+len(data),destination+(count//2)*(8 if mode==2 else 4))-P+8
  rows.append({'mode':mode,'args':args,'initial':bytes(initial[start:end]).hex(),'offset':start,'expected':bytes(u.mem_read(P+start,end-start)).hex(),'overlap_fallback':n>=416})
report={'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'names':names,'base':P,'cases':rows};(root/'analysis/audio-frame-native-vectors.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print('Original ARM audio frame cases:',len(rows),'including',sum(r['overlap_fallback'] for r in rows),'overlapping buffers')
