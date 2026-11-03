/** Profile-guided equivalents of the original byte-wise XPL memory helpers. */
export function installMemoryHelpers(r){
 r.replaceFunction('_ZN3XPL6MemSetEPvij',()=>{const p=r.arg(0),value=r.arg(1),n=r.arg(2);r.write(p,new Uint8Array(n).fill(value&255));return p;});
 r.replaceFunction('_ZN3XPL7MemMoveEPvPKvj',()=>{const p=r.arg(0),source=r.arg(1),n=r.arg(2);if(p!==source)r.write(p,r.read(source,n));return p;});
 r.replaceFunction('_ZN3XPL6MemCpyEPvPKvj',()=>{const p=r.arg(0),source=r.arg(1),n=r.arg(2),data=r.read(source,n);if(p>source&&p<source+n){const shift=p-source;for(let i=shift;i<n;i++)data[i]=data[i-shift];}r.write(p,data);return p;});
}

/** C/WASM ports selected from an original-kitchen ARM block profile. */
export function installHotHelpers(r){
 r.cAccelerations=[];if(!r.uc._ou_guest_adpcm_mix||!r.uc._ou_guest_font_char_index)return;
 r.replaceFunction('_ZN3Sys5Audio23DecodeMonoADPCMFrameMixEPKhPsii',()=>{
  const handle=r.uc.getValue(r.engine.handle_ptr,'*'),error=r.uc._ou_guest_adpcm_mix(handle,r.arg(0),r.arg(1),r.arg(2)|0,r.arg(3)|0);
  if(error)throw Error('Original ADPCM C port failed: '+error);return 0;
 });r.cAccelerations.push('original mono ADPCM mixer');
 r.replaceFunction('_ZN4Font4Font14get_char_indexEw',()=>{
  const handle=r.uc.getValue(r.engine.handle_ptr,'*'),index=r.uc._ou_guest_font_char_index(handle,r.arg(0),r.arg(1));
  if(index<0)throw Error('Original font C port failed: '+index);return index;
 });r.cAccelerations.push('original font character lookup');
 if(r.uc._ou_hot_native_create){
  const uc=r.uc,base=0x0f009000,pointer=uc._ou_hot_native_create(uc.getValue(r.engine.handle_ptr,'*'),base);if(!pointer)throw Error('C hot-port hook allocation failed');
  const names=['_ZN4Font4Font14get_char_indexEw','_ZN3Sys5Audio23DecodeMonoADPCMFrameMixEPKhPsii'],entries=names.map((name,i)=>({address:base+i*4,slow:r.trap('hle:'+name),entry:r.elf.address(name)}));
  for(const{address,entry}of entries){r.u32(address,0xe12fff1e);r.u32(entry,0xe51ff004);r.u32(entry+4,address);}
  r.nativeHot={enabled:true,check(){const error=uc._ou_hot_native_error(pointer);if(error)throw Error('Native C hot-port failed '+error);},setEnabled(enabled){uc._ou_hot_native_enable(pointer,Number(enabled));for(const{address,slow}of entries)r.u32(address,enabled?0xe12fff1e:0xea000000|(((slow-address-8)>>2)&0xffffff));this.enabled=!!enabled;},report(){return{enabled:this.enabled,font_lookups:uc._ou_hot_native_count(pointer,0)>>>0,audio_blocks:uc._ou_hot_native_count(pointer,1)>>>0};},close(){uc._ou_hot_native_destroy(pointer);}};
 }
}

/** Fix the original open-restaurant timer's out-of-bounds None enum read. */
export function installCompatibilityGuards(r){
 const address=r.elf.address('_ZN10Restaurant7Manager29GetRestaurantShutdownTimeLeftE10checksum32NS_12ShutdownTypeE');
 const hook=r.uc._ou_shutdown_guard_create?r.uc._ou_shutdown_guard_create(r.uc.getValue(r.engine.handle_ptr,'*'),address):r.engine.hook_add(r.uc.HOOK_CODE,()=>{if(r.reg(2)===0xffffffff){r.ret(0);r.engine.emu_stop();}},null,address,address);
 if(!hook)throw Error('Could not install the original shutdown timer guard');r.compatibilityHooks=[typeof hook==='number'?{native:hook}:hook];r.compatibilityFixes=['Open restaurants have no reopening countdown (original None enum bounds bug).'];
}

/** Profile-guided port of the original per-call zlib decompressor. */
export function installDecompressionHelper(r){
 if(!r.uc._ou_guest_zdecompress)return;
 const name='_ZN7ZDecomp10DecompressEPKviPvi',entry=r.elf.address(name),original=r.read(entry,8),trapName='hle:'+name;
 const stats={enabled:true,calls:0,input_bytes:0,output_bytes:0};
 r.function(trapName,()=>{const input=r.arg(2)|0,capacity=r.arg(4)|0,result=r.uc._ou_guest_zdecompress(r.uc.getValue(r.engine.handle_ptr,'*'),r.arg(1),input,r.arg(3),capacity);if(result<0)throw Error('Original decompressor C port failed: '+result);stats.calls++;stats.input_bytes+=input;stats.output_bytes+=result;return result;});
 const patch=new Uint8Array(8),view=new DataView(patch.buffer);view.setUint32(0,0xe51ff004,true);view.setUint32(4,r.trap(trapName),true);
 r.decompression={setEnabled(enabled){if(r.inCall)throw Error('Pause native execution before switching decompression');r.write(entry,enabled?patch:original);stats.enabled=!!enabled;},report(){return{...stats};}};
 r.decompression.setEnabled(true);r.cAccelerations??=[];r.cAccelerations.push('original zlib decompressor');
}
