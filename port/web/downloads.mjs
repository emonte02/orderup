/** Download and verify the complete game automatically from the hosting site. */
export const gamePaths=['/game/libOrderUp.so','/game/orderup.apk','/game/main.13.com.svsgames.orderup.obb','/game/patch.13.com.svsgames.orderup.obb','/save/chefdata.wad','/save/chefmisc.wad'];
export async function loadHostedGameFiles({onProgress=()=>{},baseURL=new URL('./',import.meta.url)}={}){
 const manifestResponse=await fetch(new URL('game/manifest.json',baseURL));
 if(!manifestResponse.ok)throw Error('The game download manifest is unavailable.');
 const manifest=await manifestResponse.json();
 const specs=gamePaths.map(path=>{
  const spec=manifest.files?.find(file=>'/'+file.path===path);
  if(!spec||!Number.isSafeInteger(spec.size)||spec.size<=0||spec.size>128*1024*1024||!(/^[a-f0-9]{64}$/).test(spec.sha256))throw Error('Invalid game download manifest: '+path);
  return spec;
 });
 let loaded=0,files=0;const total=specs.reduce((sum,spec)=>sum+spec.size,0);
 const report=()=>onProgress({loaded,total,files});report();
 return Promise.all(specs.map(async spec=>{
  const response=await fetch(new URL(spec.path,baseURL));
  if(!response.ok)throw Error('Could not download '+spec.path+' ('+response.status+').');
  // The manifest measures decoded data; HTTP Content-Length may measure gzip bytes.
  let bytes;
  if(response.body){
   bytes=new Uint8Array(spec.size);const reader=response.body.getReader();let offset=0;
   try{
    for(;;){
     const {value,done}=await reader.read();if(done)break;
     if(offset+value.length>spec.size){await reader.cancel();throw Error('Game download exceeded its expected size: '+spec.path);}
     bytes.set(value,offset);offset+=value.length;loaded+=value.length;report();
    }
   }finally{reader.releaseLock();}
   if(offset!==spec.size)throw Error('Game download was incomplete: '+spec.path);
  }else{bytes=new Uint8Array(await response.arrayBuffer());loaded+=bytes.length;report();}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==spec.size||digest!==spec.sha256)throw Error('Game download failed verification: '+spec.path);
  files++;report();return bytes;
 }));
}
