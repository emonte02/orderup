import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import createCore from '../build/orderup-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cases=JSON.parse(fs.readFileSync(path.join(root,'analysis/crc-wasm-vectors.json'),'utf8'));
const guest=fs.readFileSync(path.join(root,'port/build/crc-guest-image.bin'));
const M=await createCore({wasmBinary:fs.readFileSync(path.join(root,'port/build/orderup-core.wasm'))});
const base=M._malloc(guest.length);M.HEAPU8.set(guest,base);
try{
 for(const c of cases){
  const bytes=Buffer.from(c.hex,'hex');M.HEAPU8.set(bytes,base+0x700000);M.HEAPU8[base+0x700000+bytes.length]=0;
  const got=M._ou_recompiled_crc(base,c.address,c.seed)>>>0;
  assert.equal(got,c.expected,JSON.stringify(c));
 }
} finally{M._free(base);}
const report={source:'Original ARM instructions -> generated C -> Emscripten WebAssembly',reference:'Original ARM routine executed in Unicorn',passed:cases.length,failed:0,scope:'One CRC leaf routine only; not the full game.'};
fs.writeFileSync(path.join(root,'analysis/recompiled-wasm-tests.json'),JSON.stringify(report,null,2));console.log(report);
