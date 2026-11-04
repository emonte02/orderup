import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),require=createRequire(import.meta.url);
const bundle=process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js';
const uc=await require(bundle)({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,read('analysis/game-apk/lib/armeabi-v7a/libOrderUp.so'));
const vectors=JSON.parse(read('analysis/hot-native-vectors.json'));
try{
 for(const name of ['original mono ADPCM mixer','original font character lookup','original zlib decompressor'])assert(r.cAccelerations.includes(name),name);assert(r.cAccelerations.includes('original zlib decompressor'));r.map(0x700000,0x8000);
 for(const [i,c] of vectors.audio.entries()){
  r.write(0x700000,Buffer.from(c.input,'hex'));r.write(0x701000,Buffer.from(c.initial,'hex'));
  await r.call('_ZN3Sys5Audio23DecodeMonoADPCMFrameMixEPKhPsii',[0x700000,0x701000,c.volume,c.samples]);
  assert.equal(Buffer.from(r.read(0x701000,c.initial.length/2)).toString('hex'),c.expected,'Original ADPCM block '+i);
 }
 let current=-1;
 for(const [i,c] of vectors.font_cases.entries()){
  if(current!==c.font){current=c.font;const table=vectors.fonts[current],header=new Uint8Array(128),d=new DataView(header.buffer),characters=new Uint8Array(table.length*2),v=new DataView(characters.buffer);d.setUint16(24,table.length-1,true);d.setUint32(60,0x704000,true);table.forEach((ch,i)=>v.setUint16(i*2,ch,true));r.write(0x703000,header);r.write(0x704000,characters);}
  assert.equal(await r.call('_ZN4Font4Font14get_char_indexEw',[0x703000,c.character]),c.expected,'Original font lookup '+i);
 }
 if(r.nativeHot){assert.equal(r.nativeHot.report().font_lookups,vectors.font_cases.length);assert.equal(r.nativeHot.report().audio_blocks,vectors.audio.length);const c=vectors.font_cases.at(-1);r.nativeHot.setEnabled(false);assert.equal(await r.call('_ZN4Font4Font14get_char_indexEw',[0x703000,c.character]),c.expected);r.nativeHot.setEnabled(true);assert.equal(await r.call('_ZN4Font4Font14get_char_indexEw',[0x703000,c.character]),c.expected);}
 const report={native_c_entries:r.nativeHot?.report()||null,audio_blocks:vectors.audio.length,font_lookups:vectors.font_cases.length,bit_exact:true,original_arm_entry_to_c_wasm:true,accelerations:r.cAccelerations,bundle};
 fs.writeFileSync(new URL('analysis/'+(process.env.OU_HOT_REPORT||'hot-wasm-tests.json'),root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{r.close();}
