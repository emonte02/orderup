/** Void GLES calls can stay inside WASM until a draw/query needs the browser. */
const descriptors=[
 ['glEnable',1],['glDisable',1],['glCullFace',1],['glFrontFace',1],['glClear',1],['glClearStencil',1],['glStencilMask',1],['glActiveTexture',1],
 ['glBlendFunc',2],['glStencilFunc',3],['glStencilOp',3],['glTexParameteri',3],['glViewport',4],['glScissor',4],['glDepthMask',1],['glBlendEquationOES',1],['glClearColor',4],['glBlendColor',4],['glClearDepthf',1],['glDepthRangef',2],['glHint',2],
 ['glUseProgram',1],['glUniform1i',2],['glUniform1fv',3,2,4],['glUniform4fv',3,2,16],['glUniformMatrix4fv',4,3,64],['glBindTexture',2],['glBindBuffer',2],['glEnableVertexAttribArray',1],['glDisableVertexAttribArray',1],['glVertexAttribPointer',6],
];
export function createGraphicsBatch(r){
 if(!r.graphics?.supportsCommandBatch||!r.uc._ou_gl_batch_create)return null;
 const uc=r.uc,base=0x0f008000,pointer=uc._ou_gl_batch_create(uc.getValue(r.engine.handle_ptr,'*'),base);if(!pointer)throw Error('Graphics command queue allocation failed');
 const buffer=uc._ou_gl_batch_buffer(pointer),bindings=new Map();let current=null,view=null;
 const proxy={arg:i=>view.getUint32(current+20+i*4,true),reg:i=>r.reg(i),unsupported:name=>r.unsupported(name),read(address,size){
  const guest=view.getUint32(current+12,true),length=view.getUint32(current+16,true);if(size&&address>=guest&&address+size<=guest+length)return uc.HEAPU8.slice(current+44+address-guest,current+44+address-guest+size);return r.read(address,size);
 }};
 const batch={enabled:true,flushes:0,bind(name){
  const id=descriptors.findIndex(d=>d[0]===name);if(id<0)return 0;if(bindings.has(name))return bindings.get(name).address;
  const descriptor=descriptors[id],address=base+id*4,slow=r.trap(name);if(uc._ou_gl_batch_bind(pointer,id,descriptor[1],descriptor[2]||0,descriptor[3]||0))throw Error('Invalid graphics queue descriptor '+name);
  r.u32(address,0xe12fff1e);bindings.set(name,{address,slow});return address;
 },flush(){
  const size=uc._ou_gl_batch_size(pointer);if(size<0)throw Error('Graphics command queue failed '+(-size));if(!size)return;
  view=new DataView(uc.HEAPU8.buffer);batch.flushes++;
  try{for(let offset=0;offset<size;){current=buffer+offset;const id=view.getUint32(current,true),descriptor=descriptors[id],payload=view.getUint32(current+16,true);if(!descriptor||view.getUint32(current+4,true)!==descriptor[1]||offset+44+payload>size)throw Error('Malformed graphics command queue');const name=descriptor[0];r.calls.set(name,(r.calls.get(name)||0)+1);r.graphics.call(name,proxy);offset+=44+Math.ceil(payload/4)*4;}}
  finally{current=null;view=null;uc._ou_gl_batch_clear(pointer);}
 },setEnabled(enabled){
  batch.flush();uc._ou_gl_batch_enable(pointer,Number(enabled));for(const{address,slow}of bindings.values())r.u32(address,enabled?0xe12fff1e:0xea000000|(((slow-address-8)>>2)&0xffffff));batch.enabled=!!enabled;
 },report(){return{enabled:batch.enabled,original_void_calls:uc._ou_gl_batch_calls(pointer)>>>0,flushes:batch.flushes,imports:bindings.size};},close(){uc._ou_gl_batch_destroy(pointer);}};
 return batch;
}
