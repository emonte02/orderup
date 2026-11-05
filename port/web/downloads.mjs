/** Persist verified assets independently of player updates and personal saves. */
export const gamePaths=['/game/libOrderUp.so','/game/orderup.apk','/game/main.13.com.svsgames.orderup.obb','/game/patch.13.com.svsgames.orderup.obb','/save/chefdata.wad','/save/chefmisc.wad'];
export const assetCacheName='orderup-game-assets-v1';

async function readVerified(response,spec,onChunk=()=>{}){
 let bytes;
 if(response.body){
  bytes=new Uint8Array(spec.size);const reader=response.body.getReader();let offset=0;
  try{
   for(;;){
    const {value,done}=await reader.read();if(done)break;
    if(offset+value.length>spec.size){await reader.cancel();throw Error('Game download exceeded its expected size: '+spec.path);}
    bytes.set(value,offset);offset+=value.length;onChunk(value.length);
   }
  }finally{reader.releaseLock();}
  if(offset!==spec.size)throw Error('Game download was incomplete: '+spec.path);
 }else{bytes=new Uint8Array(await response.arrayBuffer());onChunk(bytes.length);}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==spec.size||digest!==spec.sha256)throw Error('Game download failed verification: '+spec.path);
 return bytes;
}

export async function loadHostedGameFiles({onProgress=()=>{},baseURL=new URL('./',import.meta.url),cacheStorage=globalThis.caches}={}){
 // Revalidate the small manifest; large assets are keyed by content, not build ID.
 const manifestResponse=await fetch(new URL('game/manifest.json',baseURL),{cache:'no-cache'});
 if(!manifestResponse.ok)throw Error('The game download manifest is unavailable.');
 const manifest=await manifestResponse.json();
 const specs=gamePaths.map(path=>{
  const spec=manifest.files?.find(file=>'/'+file.path===path);
  if(!spec||!Number.isSafeInteger(spec.size)||spec.size<=0||spec.size>128*1024*1024||!(/^[a-f0-9]{64}$/).test(spec.sha256))throw Error('Invalid game download manifest: '+path);
  return spec;
 });
 let cache;try{cache=await cacheStorage?.open(assetCacheName);}catch{}
 let loaded=0,files=0,downloaded=0,cached=0,cacheAvailable=!!cache;const total=specs.reduce((sum,spec)=>sum+spec.size,0);
 const report=()=>onProgress({loaded,total,files,downloaded,cached,cacheAvailable});report();
 return Promise.all(specs.map(async spec=>{
  const key=new URL(spec.path,baseURL);key.searchParams.set('sha256',spec.sha256);
  let stored;try{stored=await cache?.match(key);}catch{cacheAvailable=false;}
  if(stored){
   let bytes;
   try{bytes=await readVerified(stored,spec);}catch{try{await cache.delete(key);}catch{cacheAvailable=false;}}
   if(bytes){loaded+=bytes.length;cached+=bytes.length;files++;report();return bytes;}
  }
  const response=await fetch(key);
  if(!response.ok)throw Error('Could not download '+spec.path+' ('+response.status+').');
  // The manifest measures decoded data; HTTP Content-Length may measure gzip bytes.
  const bytes=await readVerified(response,spec,count=>{loaded+=count;downloaded+=count;report();});
  if(cache){
   try{
    // Retire only obsolete versions of this file, never saves or other sites' data.
    for(const old of await cache.keys(key,{ignoreSearch:true}))if(old.url!==key.href)await cache.delete(old);
    // Store decoded, verified bytes without transport Content-Encoding headers.
    await cache.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));
   }catch{cacheAvailable=false;} // Full/disabled storage must not prevent play.
  }
  files++;report();return bytes;
 }));
}
