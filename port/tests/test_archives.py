#!/usr/bin/env python3
"""Compare C extraction with an independent Python decoder over every WAD file."""
from pathlib import Path
import ctypes as C
import hashlib
import json
import struct
import sys
import zlib
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from extract_assets import Wad

counts={'archives':0,'entries':0,'bytes':0,'stored_mode2':0,'compressed_mode2':0}

def check(data):
    _,version,n,h,a,mode,mem,disk,*_=struct.unpack_from('<12I',data)
    assert version==4
    if mode==1:
        full=data[:h]+zlib.decompress(data[h:h+disk])
        assert len(full)==h+mem
    else:full=data
    w=Wad(data);assert w.count==n and w.mode==mode
    counts['archives']+=1
    try:
        for i,(actual_hash,actual) in enumerate(w.entries()):
            hv,ix=struct.unpack_from('<II',data,48+i*8)
            off,size=struct.unpack_from('<II',data,48+8*n+ix*8)
            if mode==2:
                co,cl=struct.unpack_from('<II',data,48+16*n+ix*8)
                if cl==size:expected=data[co:co+cl];counts['stored_mode2']+=1
                else:expected=zlib.decompress(data[co:co+cl]);counts['compressed_mode2']+=1
            else:expected=full[off:off+size]
            assert len(expected)==size and actual_hash==hv
            assert actual==expected,(hex(hv),'payload mismatch')
            counts['entries']+=1;counts['bytes']+=size
            if actual[:4]==b'0DAW':check(actual)
    finally:w.close()

for p in [ROOT/'analysis/game-apk/assets/chefdata.png',ROOT/'analysis/game-apk/assets/chefmisc.png',ROOT/'originals/main.13.com.svsgames.orderup.obb']:
    check(p.read_bytes())

# Reject malformed archives without reading outside supplied memory.
data=(ROOT/'analysis/game-apk/assets/chefdata.png').read_bytes()
mutations=[b'',data[:47],data[:500],b'BAD!'+data[4:]]
for offset,value in [(4,5),(8,0xffffffff),(12,0xffffff00),(16,0),(16,3),(20,9),(24,0xffffffff),(28,0xffffffff),(52,0xffffffff)]:
    b=bytearray(data);struct.pack_into('<I',b,offset,value);mutations.append(bytes(b))
for b in mutations:
    buf=C.create_string_buffer(b);p=Wad.lib.ou_wad_open(buf,len(b));assert not p,'Accepted corrupt archive'
w=Wad(data)
try:
    n=w.lib.ou_wad_size(w.ptr,0);tiny=C.create_string_buffer(1)
    assert w.lib.ou_wad_read(w.ptr,0,tiny,1)==-1
    assert w.lib.ou_wad_read(w.ptr,w.count,tiny,1)==-1
    for i in range(w.count):
        h=w.lib.ou_wad_hash(w.ptr,i)
        w.lib.ou_wad_find.argtypes=[C.c_void_p,C.c_uint32];w.lib.ou_wad_find.restype=C.c_int
        assert w.lib.ou_wad_find(w.ptr,h)==i
finally:w.close()
counts['malformed_cases']=len(mutations)
(ROOT/'analysis/native-archive-tests.json').write_text(json.dumps(counts,indent=2))
print(json.dumps(counts,indent=2))
