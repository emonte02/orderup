/** Generate decompressor references by executing the untouched original ARM entry. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const symbol='_ZN7ZDecomp10DecompressEPKviPvi';
export async function makeDecompressionVectors(page,{onProgress=()=>{}}={}){
 await page.evaluate(()=>orderup.controller.pause());
 if(await page.evaluate(symbol=>orderup.runtime.u32(orderup.runtime.elf.address(symbol))===0xe51ff004,symbol))throw Error('Reference decompressor entry has been replaced');
 let seed=20261103;const random=Buffer.alloc(32768);for(let i=0;i<random.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;random[i]=seed&255;}
 const cases=[],add=(name,input,capacity,layout='separate')=>cases.push({name,input_hex:Buffer.from(input).toString('hex'),capacity,layout});
 const text=Buffer.from('Original Order Up!! To Go assets and cooking.\n'.repeat(512)),packed=zlib.deflateSync(text);
 for(const capacity of [0,1,15,128,text.length,text.length+32])add('text-capacity-'+capacity,packed,capacity);
 for(const level of [0,1,6,9])add('random-level-'+level,zlib.deflateSync(random,{level}),random.length+16);
 add('empty-output',zlib.deflateSync(Buffer.alloc(0)),0);add('empty-output-room',zlib.deflateSync(Buffer.alloc(0)),32);
 for(const length of [1,4,Math.floor(packed.length/2),packed.length-4,packed.length-1])add('truncated-'+length,packed.subarray(0,length),text.length+32);
 const bad=Buffer.from(packed);bad[bad.length-1]^=255;add('checksum-error',bad,text.length+32);
 add('invalid-header',Buffer.from([0,0,0,0,0,0,0,0]),64);add('trailing-bytes',Buffer.concat([packed,Buffer.from('unused trailing bytes')]),text.length+32);
 for(const layout of ['inplace','inside','after']){add('text-'+layout,packed,text.length+32,layout);add('random-'+layout,zlib.deflateSync(random),random.length+32,layout);}
 const main=fs.readFileSync(new URL('../../originals/main.13.com.svsgames.orderup.obb',import.meta.url)),rootCount=main.readUInt32LE(8);let selected=0;
 for(let archive=0;archive<rootCount&&selected<12;archive++){
  const entry=48+rootCount*8+archive*8,offset=main.readUInt32LE(entry),size=main.readUInt32LE(entry+4),wad=main.subarray(offset,offset+size);
  if(wad.subarray(0,4).toString()!=='0DAW'||wad.readUInt32LE(20)!==2)continue;const n=wad.readUInt32LE(8);
  for(let i=0;i<n;i++){const table=48+n*8,e=table+i*8,c=table+n*8+i*8,output=wad.readUInt32LE(e+4),compressedOffset=wad.readUInt32LE(c),length=wad.readUInt32LE(c+4);
   if(length===output||output>262144||output===0)continue;add('original-main-archive-'+archive+'-entry-'+i,wad.subarray(compressedOffset,compressedOffset+length),output+16);selected++;break;
  }
 }
 if(selected<6)throw Error('Not enough original compressed-asset references');
 const vectors=[];
 for(const c of cases){
  const input=Buffer.from(c.input_hex,'hex'),source_offset=c.layout==='inplace'?48:32,destination_offset=c.layout==='separate'?32:c.layout==='inplace'?32:c.layout==='inside'?40:32+input.length;
  const source=c.layout==='separate'?64+c.capacity:source_offset,size=Math.max(source+input.length,destination_offset+c.capacity)+32;
  const result=await page.evaluate(async({symbol,input,source,destination,size,capacity})=>{
   const r=orderup.runtime,region=r.malloc(size),object=r.malloc(16);r.write(region,new Uint8Array(size).fill(0xa5));r.write(region+source,Uint8Array.from(input));r.write(object,new Uint8Array(16).fill(0x5a));r.resumeClock();r.beginJNIFrame();
   try{const count=await r.call(symbol,[object,region+source,input.length,region+destination,capacity],{timeoutMs:600000});return{count,memory:Array.from(r.read(region,size)),object:Array.from(r.read(object,16))};}
   finally{r.endJNIFrame();r.pauseClock();r.free(object);r.free(region);}
  },{symbol,input:Array.from(input),source,destination:destination_offset,size,capacity:c.capacity});
  if(!result.object.every(x=>x===0x5a))throw Error('Original decompressor changed its object header');
  vectors.push({...c,source_offset:source,destination_offset,region_size:size,expected_count:result.count,expected_sha256:crypto.createHash('sha256').update(Buffer.from(result.memory)).digest('hex')});onProgress({name:c.name,bytes:result.count});
 }
 const binary=fs.readFileSync(new URL('../../analysis/game-apk/lib/armeabi-v7a/libOrderUp.so',import.meta.url));return{source_symbol:symbol,original_binary_sha256:crypto.createHash('sha256').update(binary).digest('hex'),vectors};
}
