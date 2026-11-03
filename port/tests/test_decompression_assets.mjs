import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(read('analysis/asset-manifest.json')).filter(x=>['chefdata','chefmisc','main'].includes(x.source)),expected=new Map(manifest.map(x=>[x.source+'/'+x.hash_path,x.sha256]));
const uc=await require('../build/unicorn-arm.js')({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,read('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so'),{optimizeDecompression:true});let archives=0,leaves=0,compressed=0,decodedBytes=0,input=0,inputCapacity=0,output=0,outputCapacity=0;const modes={};
async function decompress(bytes,size){
 if(bytes.length>inputCapacity){if(input)r.free(input);inputCapacity=Math.max(16,bytes.length);input=r.malloc(inputCapacity);}
 if(size>outputCapacity){if(output)r.free(output);outputCapacity=Math.max(16,size);output=r.malloc(outputCapacity);}
 if(!input){inputCapacity=16;input=r.malloc(16);}if(!output){outputCapacity=16;output=r.malloc(16);}
 r.write(input,bytes);const count=await r.call('_ZN7ZDecomp10DecompressEPKviPvi',[0,input,bytes.length,output,size]);assert.equal(count,size,'Original asset decompressed size');compressed++;decodedBytes+=size;return Buffer.from(r.read(output,size));
}
async function walk(bytes,source,prefix='',depth=0){
 assert(depth<12);assert.equal(bytes.subarray(0,4).toString(),'0DAW');archives++;const n=bytes.readUInt32LE(8),header=bytes.readUInt32LE(12),mode=bytes.readUInt32LE(20),memory=bytes.readUInt32LE(24),disk=bytes.readUInt32LE(28);modes[mode]=(modes[mode]||0)+1;const table=48+n*8;let body;
 if(mode===1)body=await decompress(bytes.subarray(header,header+disk),memory);
 for(let i=0;i<n;i++){
  const name=bytes.readUInt32LE(48+i*8).toString(16).padStart(8,'0'),physical=bytes.readUInt32LE(52+i*8),entry=table+physical*8,offset=bytes.readUInt32LE(entry),size=bytes.readUInt32LE(entry+4),key=prefix?prefix+'/'+name:name;let payload;
  if(mode===2){const c=table+n*8+physical*8,off=bytes.readUInt32LE(c),length=bytes.readUInt32LE(c+4);assert(off+length<=bytes.length);payload=length===size?bytes.subarray(off,off+length):await decompress(bytes.subarray(off,off+length),size);}
  else if(mode===1){assert(offset>=header&&offset-header+size<=body.length);payload=body.subarray(offset-header,offset-header+size);}
  else{assert.equal(mode,0);assert(offset+size<=bytes.length);payload=bytes.subarray(offset,offset+size);}
  if(payload.subarray(0,4).toString()==='0DAW')await walk(payload,source,key,depth+1);
  else{assert.equal(sha(payload),expected.get(source+'/'+key),source+'/'+key+' original extracted hash');leaves++;}
 }
}
try{
 for(const [source,file] of [['chefdata','analysis/game-apk/assets/chefdata.png'],['chefmisc','analysis/game-apk/assets/chefmisc.png'],['main','originals/main.13.com.svsgames.orderup.obb']]){await walk(read(file),source);console.log(source,{archives,leaves,compressed});}
 assert.equal(leaves,expected.size);const report={archives,compression_modes:modes,original_leaf_hashes:leaves,compressed_streams:compressed,decoded_bytes:decodedBytes,all_original_asset_hashes_match:true,decompression:r.decompression.report(),build:JSON.parse(read('port/build/emulator-build.json'))};fs.writeFileSync(new URL('analysis/decompression-all-assets-tests.json',root),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{r.close();}
