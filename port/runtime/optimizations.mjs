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
  const names=['_ZN4Font4Font14get_char_indexEw','_ZN3Sys5Audio23DecodeMonoADPCMFrameMixEPKhPsii'];let renderResult=0;const renderOriginal=new Map();
  if(uc._ou_guest_animation_index&&uc._ou_guest_find_camera){
   renderResult=uc._malloc(8);if(!renderResult)throw Error('Render helper result allocation failed');
   for(const[name,helper]of[['_ZN3Gfx20TextureAnimationData20GetCurrentImageIndexEj',uc._ou_guest_animation_index],['_ZN3Gfx9Manager3D9GetCameraE10checksum32',uc._ou_guest_find_camera]]){
    renderOriginal.set(name,r.read(r.elf.address(name),8));r.replaceFunction(name,()=>{const error=helper(uc.getValue(r.engine.handle_ptr,'*'),r.arg(0),r.arg(1),renderResult);if(error)throw Error('Render C port failed: '+error);return uc.getValue(renderResult,'i32')>>>0;});names.push(name);
   }r.cAccelerations.push('original texture animation lookup','original camera lookup');
   if(uc._ou_guest_variant_mark&&uc._ou_hot_native_cvm){
    const name='_ZN3CVM7Variant4MarkEv',targets=['_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv'].map(name=>r.elf.address(name));
    uc._ou_hot_native_cvm(pointer,...targets);renderOriginal.set(name,r.read(r.elf.address(name),8));r.replaceFunction(name,()=>{const error=uc._ou_guest_variant_mark(uc.getValue(r.engine.handle_ptr,'*'),r.arg(0),...targets,renderResult);if(error)throw Error('Variant mark C port failed: '+error);const object=uc.getValue(renderResult,'i32')>>>0,target=uc.getValue(renderResult+4,'i32')>>>0;if(target)r.invoke(target,[object]);return 0;});names.push(name);r.cAccelerations.push('original variant marking');
    if(uc._ou_hot_native_gc_bind){
     const extra=['_ZN3CVM5Assoc12MarkAllItemsEv','_ZN3CVM11ArrayObject12MarkAllItemsEv'],getters=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'],data=uc._malloc(40);
     [...targets,...extra.map(name=>r.elf.address(name)),...getters.map(name=>r.elf.address(name))].forEach((value,i)=>uc.setValue(data+i*4,value,'i32'));const error=uc._ou_hot_native_gc_bind(pointer,data);uc._free(data);if(error)throw Error('Container marking setup failed: '+error);r.u32(base+(uc._ou_hot_native_gc_version?.()>=2?0x3fc:28),0xe12fff1c);
     for(const[nameIndex,name]of extra.entries()){
      renderOriginal.set(name,r.read(r.elf.address(name),8));r.replaceFunction(name,()=>{const object=r.arg(0),flags=r.u32(object+0x14);if(flags&0x20)return 0;r.u32(object+0x14,flags|0x20);const count=r.u32(object+(nameIndex===1?0x18:0x1c));if(count>1048576)throw Error('Invalid marking count');if(!count)return 0;const array=nameIndex===1,table=array?object+0x20:r.invoke(r.u32(r.u32(object)+0x70),[object]),mask=flags&0x180;for(let i=0;i<count;i++){const entry=table+i*(array?8:16);if(array)r.invoke(r.elf.address('_ZN3CVM7Variant4MarkEv'),[entry]);else if(!mask){r.invoke(r.elf.address('_ZN3CVM7Variant4MarkEv'),[entry+8]);r.invoke(r.elf.address('_ZN3CVM7Variant4MarkEv'),[entry]);}else if(!(mask&0x80))r.invoke(r.elf.address('_ZN3CVM7Variant4MarkEv'),[entry]);else if(!(mask&0x100))r.invoke(r.elf.address('_ZN3CVM7Variant4MarkEv'),[entry+8]);}return 0;});names.push(name);
     }r.cAccelerations.push('original array and associative marking');
     if(uc._ou_hot_native_bank_bind){
      const bankNames=['_ZN3CVM10StringBank5FlushEv','_ZN3CVM9IdentBank5FlushEv','_ZN3CVM4Item12SweepGarbageEv'];
      for(const name of bankNames){renderOriginal.set(name,r.read(r.elf.address(name),8));names.push(name);}
      const entry=r.elf.address(bankNames[2]),fallback=0x0f00a000;if(r.u32(entry)!==0xe92d4010||r.u32(entry+4)!==0xe24dd010)throw Error('Unsupported original sweep prologue');r.write(fallback,r.read(entry,8));r.u32(fallback+8,0xe51ff004);r.u32(fallback+12,entry+8);uc._ou_hot_native_bank_bind(pointer,fallback);
      // Slow comparisons execute original prologues, rather than another C port.
      bankNames.forEach((name,i)=>{const original=renderOriginal.get(name),trampoline=fallback+0x20+i*0x20;r.write(trampoline,original);r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,r.elf.address(name)+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1)]));});
      r.cAccelerations.push('original string/identifier bank traversal','original retained-item sweep');
      if(uc._ou_hot_native_machine_bind){
       const callbacks=['_ZN3CVM10ModuleBank12MarkAllItemsEv','_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Thread12MarkAllItemsEv','_ZN3CVM4Item12SweepGarbageEv','_ZN3CVM14FunctionObject12SweepGarbageEv','_ZN3CVM10ModuleBank5FlushEv','_ZN3CVM7Machine13flush_threadsEv','_ZN3CVM9ImageBank5FlushEv','_ZN3CVM13ImageInfoBank5FlushEv','_ZN3CVM12IndexMapBank5FlushEv','_ZN3CVM9IdentBank5FlushEv','_ZN3CVM10StringBank5FlushEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEEC1EPKNS_4ListIS2_EE','_ZN3XPL12ListIteratorIN3CVM6ThreadEE5FirstEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEE4NextEv','_ZN3XPL12ListIteratorIN3CVM6ThreadEED1Ev'],data=uc._malloc(64);callbacks.forEach((name,i)=>uc.setValue(data+i*4,r.elf.address(name),'i32'));uc._ou_hot_native_machine_bind(pointer,data);uc._free(data);
       const name='_ZN3CVM7Machine14CollectGarbageEN3CSL6GCModeE',entry=r.elf.address(name),original=r.read(entry,8),trampoline=fallback+0x100;renderOriginal.set(name,original);r.write(trampoline,original);r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1)]));names.push(name);r.cAccelerations.push('original full collection traversal');
      }

     }
    }
   }
  }
  if(uc._ou_hot_native_gfx_bind&&names.length===11){
   const name='_ZN3Gfx7Program15UpdateConstantsEv',entry=r.elf.address(name),matrix=r.elf.address('_ZNK4Math6Matrix8ApproxEqERKS0_'),data=uc._malloc(24),bindings=[r.u32((entry+0x30+r.u32(entry+0x350))>>>0),...['glUniform4fv','glUniform1fv','glUniformMatrix4fv'].map(name=>r.graphicsBatch?.bind(name)||r.trap(name)),r.u32(entry+0x34c),r.u32(matrix+0x74)];
   bindings.forEach((value,i)=>uc.setValue(data+i*4,value,'i32'));const error=uc._ou_hot_native_gfx_bind(pointer,data);uc._free(data);if(error)throw Error('Uniform C port setup failed: '+error);r.u32(base+0x3f8,0xe12fff1c);renderOriginal.set(name,r.read(entry,8));const trampoline=0x0f00a140;r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0)]));names.push(name);r.cAccelerations.push('original program uniform updates');
  }
  if(uc._ou_hot_native_clear_bind&&names.length===12){
   const extra=['_ZN3CVM11ArrayObject9ClearItemEv','_ZN3CVM5Assoc9ClearItemEv'],getters=['_ZNK3CVM5Assoc10EntryTableEv','_ZNK3CVM11TableObject10EntryTableEv','_ZNK3CVM12StructObject10EntryTableEv','_ZNK3CVM12ObjectObject10EntryTableEv','_ZNK3CVM11ClassObject10EntryTableEv'],fallback=0x0f00a180,data=uc._malloc(24);
   [...getters.map(name=>r.elf.address(name)),fallback].forEach((value,i)=>uc.setValue(data+i*4,value,'i32'));uc._ou_hot_native_clear_bind(pointer,data);uc._free(data);
   extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=fallback+(i===0?0x20:0);renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0)]));names.push(name);});
   r.cAccelerations.push('original array and associative entry cleanup');
  }
  if(uc._ou_hot_native_render_version&&names.length===14){
   const extra=['_ZN3Gfx21AndroidManager3DGLES218SetProgramConstantEiRKN4Math7Vector4E','_ZN3Gfx21AndroidManager3DGLES218SetProgramConstantEiRKN4Math6VectorE','_ZN3Gfx11MaterialLib25GetMaterialByNameChecksumE10checksum32','_ZN2OT5Table5ResetEv','_ZN2OT8Iterator7GetNextEv'];
   extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=i===4?0x0f00a400:0x0f00a200+i*0x20;renderOriginal.set(name,r.read(entry,8));if(i===4){/* Its loop returns to entry+4, inside the patched prefix. All branches in these 56 bytes are internal. */r.write(trampoline,r.read(entry,56));}else{r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);}r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);});r.cAccelerations.push('original vector constants, material lookup and render queues');
  }
  if(uc._ou_hot_native_heap_bind&&names.length===19){
   const extra=['_ZN3XPL4Heap6insertEPvj','_ZN3XPL12HBMemManager4FreeEPv'];uc._ou_hot_native_heap_bind(pointer,0x0f00a500,0x0f00a520);
   extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=0x0f00a500+i*0x20;renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2),r.arg(3)]));names.push(name);});r.cAccelerations.push('original heap release and block coalescing');
  }
  if(uc._ou_hot_native_script_marks_bind&&names.length===21){
   const iterators=['_ZN3XPL12ListIteratorIN3CVM6ModuleEEC1EPKNS_4ListIS2_EE','_ZN3XPL12ListIteratorIN3CVM6ModuleEE5FirstEv','_ZN3XPL12ListIteratorIN3CVM6ModuleEE4NextEv','_ZN3XPL12ListIteratorIN3CVM6ModuleEED1Ev'],data=uc._malloc(16);iterators.forEach((name,i)=>uc.setValue(data+i*4,r.elf.address(name),'i32'));uc._ou_hot_native_script_marks_bind(pointer,data);uc._free(data);
   const extra=['_ZN3CVM14FunctionObject12MarkAllItemsEv','_ZN3CVM6Module12MarkAllItemsEv','_ZN3CVM10ModuleBank12MarkAllItemsEv'];extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=0x0f00a600+i*0x20;renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0)]));names.push(name);});r.cAccelerations.push('original function, module and module-bank marking');
  }
  if(uc._ou_hot_native_strings_version&&names.length===24){
   const extra=['_ZN3XPL7ToLowerEc','_ZN3XPL12StrNoCaseCmpEPKcS1_','_ZN3XPL12StrNoCaseCmpEPKcS1_j','_ZN3XPL11StringCRC32EPKcj','_ZN3XPL12StringiCRC32EPKcj','_ZN4Menu7Element9MarkDirtyEv','_ZN4Menu9Container9MarkDirtyEv'];
   const data=uc._malloc(8);extra.slice(5).forEach((name,i)=>uc.setValue(data+i*4,r.elf.address(name),'i32'));uc._ou_hot_native_menu_bind(pointer,data);uc._free(data);
   extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=0x0f00a680+i*0x20;renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);});r.cAccelerations.push('original byte-string comparison and checksums','original menu dirty traversal');
  }
  if(uc._ou_hot_native_render_state_bind&&names.length===31){
   const extra=['_ZNK4Math6Matrix8ApproxEqERKS0_','_ZN3Gfx21AndroidManager3DGLES210GetProgramEj','_ZN3Gfx21AndroidManager3DGLES221EnableVertexAttributeEjb','_ZN3Gfx21AndroidManager3DGLES210SetTextureEij'],entry=r.elf.address(extra[2]),cacheSlot=(entry+0x14+r.u32(entry+0x3c))>>>0,data=uc._malloc(20),targets=[cacheSlot,0x33991c,...['glEnableVertexAttribArray','glDisableVertexAttribArray','glBindTexture'].map(name=>r.graphicsBatch?.bind(name)||r.trap(name))];targets.forEach((value,i)=>uc.setValue(data+i*4,value,'i32'));uc._ou_hot_native_render_state_bind(pointer,data);uc._free(data);
   extra.forEach((name,i)=>{const address=r.elf.address(name),trampoline=i===0?0x0f00aa00:0x0f00aa80+(i-1)*0x40;renderOriginal.set(name,r.read(address,8));if(i===0){/* Internal branches and its epsilon literal move together. */r.write(trampoline,r.read(address,120));}else if(i===3){/* Relocate the second instruction's PC-relative constant load. */r.u32(trampoline,r.u32(address));r.u32(trampoline+4,0xe59f4004);r.u32(trampoline+8,0xe59ff004);r.u32(trampoline+16,r.u32(address+0x58));r.u32(trampoline+20,address+8);}else{r.write(trampoline,r.read(address,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,address+8);}r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);});r.cAccelerations.push('original matrix comparison, program lookup and graphics state cache');
  }
  if(uc._ou_hot_native_menu_find_bind&&names.length===35){const name='_ZN4Menu9Container16GetElementByNameE10checksum32b',entry=r.elf.address(name),data=uc._malloc(8),trampoline=0x0f00ab80;['_ZN4Menu7Element16GetElementByNameE10checksum32b',name].forEach((n,i)=>uc.setValue(data+i*4,r.elf.address(n),'i32'));uc._ou_hot_native_menu_find_bind(pointer,data);uc._free(data);renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);r.cAccelerations.push('original menu element lookup traversal');}
  if(uc._ou_hot_native_heap_alloc_bind&&names.length===36){const name='_ZN3XPL4Heap5allocERjj',entry=r.elf.address(name),trampoline=0x0f00abc0;uc._ou_hot_native_heap_alloc_bind(pointer,trampoline);renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);r.cAccelerations.push('original ordinary heap allocation');}
  if(uc._ou_hot_native_variant_eq_version&&names.length===37){const extra=['_ZNK3CVM7VarianteqERKS0_','_ZNK3CVM5Assoc8GetEntryERKNS_7VariantERi'];extra.forEach((name,i)=>{const entry=r.elf.address(name),trampoline=0x0f00ac00+i*0x40;renderOriginal.set(name,r.read(entry,8));r.write(trampoline,r.read(entry,8));r.u32(trampoline+8,0xe51ff004);r.u32(trampoline+12,entry+8);r.function('hle:'+name,()=>r.invoke(trampoline,[r.arg(0),r.arg(1),r.arg(2)]));names.push(name);});r.cAccelerations.push('original variant equality and associative lookup');}
  const entries=names.map((name,i)=>({address:base+i*4,slow:r.trap('hle:'+name),entry:r.elf.address(name)}));
  for(const[i,{address,entry}]of entries.entries()){r.u32(address,i>=4?0xe12fff1c:0xe12fff1e);r.u32(entry,0xe51ff004);r.u32(entry+4,address);}
  if(renderResult)r.renderHot={enabled:true,setEnabled(enabled){if(r.inCall)throw Error('Pause execution before switching render ports');for(const{name,original}of [...renderOriginal].map(([name,original])=>({name,original}))){const entry=r.elf.address(name),address=entries[names.indexOf(name)].address;if(enabled){r.u32(entry,0xe51ff004);r.u32(entry+4,address);}else r.write(entry,original);}this.enabled=!!enabled;}};
  r.nativeHot={enabled:true,setScriptMarkInlining(enabled){uc._ou_hot_native_script_marks_enable?.(pointer,Number(enabled));},gcTimings(reset=false){if(!uc._ou_hot_native_gc_phase_ms)return null;if(reset)uc._ou_hot_native_gc_phase_reset(pointer);return Array.from({length:19},(_,i)=>({phase:i+1,total_ms:uc._ou_hot_native_gc_phase_ms(pointer,i+1,0),maximum_ms:uc._ou_hot_native_gc_phase_ms(pointer,i+1,1)}));},check(){const error=uc._ou_hot_native_error(pointer);if(error)throw Error('Native C hot-port failed '+error);},setEnabled(enabled){uc._ou_hot_native_enable(pointer,Number(enabled));for(const[i,{address,slow}]of entries.entries())r.u32(address,enabled?(i>=4?0xe12fff1c:0xe12fff1e):0xea000000|(((slow-address-8)>>2)&0xffffff));this.enabled=!!enabled;},report(){return{enabled:this.enabled,...(uc._ou_hot_native_variant_eq_count?{variant_comparisons:uc._ou_hot_native_variant_eq_count(pointer,0)>>>0,associative_lookups:uc._ou_hot_native_variant_eq_count(pointer,1)>>>0}:{}),...(uc._ou_hot_native_heap_alloc_count?{heap_allocation_calls:uc._ou_hot_native_heap_alloc_count(pointer)>>>0}:{}),...(uc._ou_hot_native_menu_find_count?{menu_lookups:uc._ou_hot_native_menu_find_count(pointer)>>>0}:{}),...(uc._ou_hot_native_render_state_count?{render_state_calls:uc._ou_hot_native_render_state_count(pointer,0)>>>0,render_active_frames:uc._ou_hot_native_render_state_count(pointer,1)>>>0}:{}),...(uc._ou_hot_native_string_count?{string_operations:uc._ou_hot_native_string_count(pointer)>>>0}:{}),font_lookups:uc._ou_hot_native_count(pointer,0)>>>0,...(uc._ou_hot_native_gfx_count?{uniform_updates:uc._ou_hot_native_gfx_count(pointer)>>>0,...(uc._ou_hot_native_clear_count?{container_clears:uc._ou_hot_native_clear_count(pointer)>>>0,...(uc._ou_hot_native_heap_count?{heap_releases:uc._ou_hot_native_heap_count(pointer)>>>0}:{})}:{})}:{}),audio_blocks:uc._ou_hot_native_count(pointer,1)>>>0,...(renderResult?{animation_lookups:uc._ou_hot_native_count(pointer,2)>>>0,camera_lookups:uc._ou_hot_native_count(pointer,3)>>>0,variant_marks:uc._ou_hot_native_count(pointer,4)>>>0,...(uc._ou_hot_native_gc_count?{gc_containers:uc._ou_hot_native_gc_count(pointer,0)>>>0,gc_variants:uc._ou_hot_native_gc_count(pointer,1)>>>0,gc_delegates:uc._ou_hot_native_gc_count(pointer,2)>>>0,gc_active_frames:uc._ou_hot_native_gc_count(pointer,3)>>>0}:{})}:{})};},close(){uc._ou_hot_native_destroy(pointer);if(renderResult)uc._free(renderResult);}};
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
