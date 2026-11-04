import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ArmRuntime} from '../runtime/runtime.mjs';
const require=createRequire(import.meta.url),create=require(process.env.OU_EMULATOR_BUNDLE||'../build/unicorn-arm.js'),uc=await create({print:()=>{},printErr:()=>{}}),r=new ArmRuntime(uc,fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url))),vectors=JSON.parse(fs.readFileSync(new URL('../../analysis/render-hot-native-vectors.json',import.meta.url)));
try{
 assert(uc._ou_guest_animation_index&&uc._ou_guest_find_camera,'Requires render C ports');r.map(0x700000,0x10000);const words=(p,values)=>values.forEach((n,i)=>r.u32(p+i*4,n));
 for(const c of vectors.animation){words(0x700000,[0,0,0,c.count,c.period,0x701000,0x702000]);words(0x701000,c.thresholds);words(0x702000,c.images);assert.equal(await r.call('_ZN3Gfx20TextureAnimationData20GetCurrentImageIndexEj',[0x700000,c.time]),c.expected,JSON.stringify(c));}
 for(const c of vectors.cameras){const head=0x7033fc;words(head,[c.keys.length?0x704000:head]);c.keys.forEach((key,i)=>{words(0x704000+i*8,[i+1<c.keys.length?0x704000+(i+1)*8:head,i===c.null_index?0:0x705000+i*32]);words(0x705000+i*32,[0,0,0,0,key]);});assert.equal(await r.call('_ZN3Gfx9Manager3D9GetCameraE10checksum32',[0x703000,c.key]),c.expected);}
 console.log(JSON.stringify({passed:true,original_arm_animation_cases:vectors.animation.length,original_arm_camera_cases:vectors.cameras.length,native_ports:r.nativeHot.report()},null,2));
}finally{r.close();}
