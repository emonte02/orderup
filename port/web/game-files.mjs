/** Load the supported, unmodified game from user-selected files. No uploads. */
export const gameFiles = [
 {key:'apk',name:'orderup-1.65.apk',size:11349359,sha256:'34bf7e764b1affcb4b3765275ad50dc7fd2b8934418284cf9d49c7bfe2abc593'},
 {key:'main',name:'main.13.com.svsgames.orderup.obb',size:86803648,sha256:'9f863b6388af72a7629f60d6a4692491bf0d19a6831aca7cad5a06e5f234f9c6'},
 {key:'patch',name:'patch.13.com.svsgames.orderup.obb',size:79173735,sha256:'6a322715c4d148842cdae39bbce3766c398da85a8a2113207475fa667efd626d'},
];

export async function readZipEntry(bytes,name){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const need=(offset,length)=>{if(offset<0||offset+length>bytes.length)throw Error('Incomplete APK archive.');};
 let end=bytes.length-22;
 for(;end>=Math.max(0,bytes.length-65557);end--){if(view.getUint32(end,true)===0x06054b50&&end+22+view.getUint16(end+20,true)===bytes.length)break;}
 if(end<Math.max(0,bytes.length-65557))throw Error('The selected APK is not a ZIP archive.');
 let offset=view.getUint32(end+16,true);
 const count=view.getUint16(end+10,true),decoder=new TextDecoder();
 for(let i=0;i<count;i++){
  need(offset,46);if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid APK directory.');
  const length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
  need(offset+46,length+extra+comment);
  if(decoder.decode(bytes.subarray(offset+46,offset+46+length))===name){
   const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),unpacked=view.getUint32(offset+24,true),local=view.getUint32(offset+42,true);
   if(flags&1||unpacked>32*1024*1024)throw Error('Unsupported APK member.');
   need(local,30);if(view.getUint32(local,true)!==0x04034b50)throw Error('Invalid APK member.');
   const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);need(start,size);
   const packed=bytes.subarray(start,start+size);
   let result;
   if(method===0)result=packed;
   else if(method===8){
    const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    result=new Uint8Array(await new Response(stream).arrayBuffer());
   }else throw Error('Unsupported APK compression. Use the original version 1.65 APK.');
   if(result.length!==unpacked)throw Error('Incomplete APK member.');
   return result;
  }
  offset+=46+length+extra+comment;
 }
 throw Error('The APK is missing '+name+'. Use Order Up!! To Go version 1.65.');
}

export async function prepareGameFiles(selected,onProgress=()=>{}){
 const files=Array.from(selected);
 if(files.length!==3)throw Error('Choose the game APK and both OBB files together (three files).');
 const chosen=gameFiles.map(spec=>{
  const matches=files.filter(file=>spec.key==='apk'?file.name.toLowerCase().endsWith('.apk'):file.name===spec.name);
  if(matches.length!==1)throw Error('Choose exactly one '+spec.name+'.');
  if(matches[0].size!==spec.size)throw Error(spec.name+' is not the supported version 1.65 file.');
  return matches[0];
 });
 const total=gameFiles.reduce((sum,file)=>sum+file.size,0),buffers=[];let loaded=0;
 for(let i=0;i<gameFiles.length;i++){
  const bytes=new Uint8Array(await chosen[i].arrayBuffer());
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==gameFiles[i].sha256)throw Error(gameFiles[i].name+' does not match the supported, unmodified game.');
  buffers.push(bytes);loaded+=bytes.length;onProgress({loaded,total,files:i+1});
 }
 const [apk,main,patch]=buffers;
 const [elf,chefdata,chefmisc]=await Promise.all(['lib/armeabi-v7a/libOrderUp.so','assets/chefdata.png','assets/chefmisc.png'].map(name=>readZipEntry(apk,name)));
 return {data:[elf,apk,main,patch,chefdata,chefmisc],files:chosen};
}

async function openCache(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('orderup-game-files',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('game');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
export async function cachedGameFiles(){
 const db=await openCache();
 try{return await new Promise((resolve,reject)=>{
  const request=db.transaction('game','readonly').objectStore('game').get('1.65');
  request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
export async function rememberGameFiles(files){
 const db=await openCache();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('game','readwrite');tx.objectStore('game').put(files,'1.65');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Saving game files was interrupted.'));
 });}finally{db.close();}
}

export async function chooseGameFiles(onProgress){
 const panel=document.querySelector('#file-picker'),input=document.querySelector('#game-files'),choose=document.querySelector('#choose-files'),message=document.querySelector('#file-message');
 const show=()=>{panel.hidden=false;document.querySelector('#start').hidden=true;document.querySelector('#loading-title').textContent='Open your game files';document.querySelector('#loading-detail').textContent='Choose your APK and both OBB files to play. Files stay in this browser.';document.querySelector('#loading-meter').hidden=true;};
 const hide=()=>{panel.hidden=true;document.querySelector('#start').hidden=false;document.querySelector('#loading-meter').hidden=false;};
 try{
  const cached=await cachedGameFiles();
  if(cached){document.querySelector('#loading-detail').textContent='Opening game files saved in this browser…';const result=await prepareGameFiles(cached,onProgress);hide();return result.data;}
 }catch{message.textContent='Please choose your game files again. Your saved progress is separate.';}
 show();
 return new Promise(resolve=>{
  choose.onclick=()=>input.click();
  input.onchange=async()=>{
   if(!input.files.length)return;
   choose.disabled=true;message.textContent='Checking your game files…';
   try{
    const result=await prepareGameFiles(input.files,onProgress);
    if(document.querySelector('#remember-files').checked){
     try{await rememberGameFiles(result.files);}catch{document.querySelector('#file-cache-note').textContent='Game files could not be remembered. Select them again next visit; gameplay can still start.';}
    }
    hide();resolve(result.data);
   }catch(error){message.textContent=error.message;input.value='';choose.disabled=false;}
  };
 });
}
