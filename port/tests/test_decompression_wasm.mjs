import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const uc=await require('../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,read('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so'),{optimizeDecompression:true}),reference=JSON.parse(read('analysis/decompression-native-vectors.json'));
try{
 assert(r.decompression,'C decompressor export is present');
 for(const c of reference.vectors){
  const region=r.malloc(c.region_size),object=r.malloc(16);r.write(region,new Uint8Array(c.region_size).fill(0xa5));r.write(region+c.source_offset,Buffer.from(c.input_hex,'hex'));r.write(object,new Uint8Array(16).fill(0x5a));
  const count=await r.call(reference.source_symbol,[object,region+c.source_offset,c.input_hex.length/2,region+c.destination_offset,c.capacity]);
  assert.equal(count,c.expected_count,c.name+' original return value');assert.equal(hash(r.read(region,c.region_size)),c.expected_sha256,c.name+' original output and guards');assert([...r.read(object,16)].every(x=>x===0x5a),c.name+' object unchanged');r.free(object);r.free(region);
 }
 const entry=r.elf.address(reference.source_symbol);r.decompression.setEnabled(false);assert.notEqual(r.u32(entry),0xe51ff004,'original ARM entry restored');r.decompression.setEnabled(true);assert.equal(r.u32(entry),0xe51ff004,'C port re-enabled');
 const report={original_arm_cases:reference.vectors.length,return_and_memory_bit_exact:true,overlap_and_truncation_verified:true,original_entry_switch_verified:true,decompression:r.decompression.report(),build:JSON.parse(read('port/build/emulator-build.json'))};fs.writeFileSync(new URL('analysis/decompression-wasm-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
