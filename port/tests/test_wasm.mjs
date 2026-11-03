import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import createCore from '../build/orderup-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const wasmBinary=fs.readFileSync(path.join(root,'port/build/orderup-core.wasm'));
const M=await createCore({wasmBinary});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'analysis/asset-manifest.json'),'utf8'));
const expected=new Map(manifest.filter(x=>x.hash).map(x=>[x.source+'/'+x.hash_path,x]));
let archives=0,leaves=0,bytes=0;
function check(data,source,prefix=''){
  const p=M._malloc(data.length);M.HEAPU8.set(data,p);
  const w=M._ou_wad_open(p,data.length);assert(w,`open ${source}/${prefix}`);archives++;
  try{
    const n=M._ou_wad_count(w);
    for(let i=0;i<n;i++){
      const h=(M._ou_wad_hash(w,i)>>>0).toString(16).padStart(8,'0');
      const size=M._ou_wad_size(w,i)>>>0;const q=M._malloc(size||1);
      let b;
      try {assert.equal(M._ou_wad_read(w,i,q,size),size);b=Buffer.from(M.HEAPU8.subarray(q,q+size));}
      finally {M._free(q);}
      const key=prefix?prefix+'/'+h:h;
      if(b.subarray(0,4).toString()==='0DAW')check(b,source,key);
      else {
        const row=expected.get(source+'/'+key);assert(row,`manifest ${source}/${key}`);
        assert.equal(crypto.createHash('sha256').update(b).digest('hex'),row.sha256,key);
        leaves++;bytes+=size;
      }
    }
  } finally{M._ou_wad_close(w);M._free(p);}
}
for(const [source,name] of [['chefdata','analysis/game-apk/assets/chefdata.png'],['chefmisc','analysis/game-apk/assets/chefmisc.png'],['main','originals/main.13.com.svsgames.orderup.obb']])check(fs.readFileSync(path.join(root,name)),source);
for(const [s,v] of [['wad/global.wad',0x683d2dae],['WAD/GLOBAL.WAD',0x683d2dae],['',0xffffffff]]){
  const n=M.lengthBytesUTF8(s)+1,p=M._malloc(n);M.stringToUTF8(s,p,n);
  assert.equal(M._ou_crc(p)>>>0,v);M._free(p);
}
const report={archives,leaves,bytes,crc_checks:3,engine:'C compiled to WebAssembly, executed in Node'};
fs.writeFileSync(path.join(root,'analysis/wasm-archive-tests.json'),JSON.stringify(report,null,2));
console.log(report);
