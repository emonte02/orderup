import {bitsFloat} from './memory.mjs';
const simpleCalls={glEnable:'enable',glDisable:'disable',glCullFace:'cullFace',glFrontFace:'frontFace',glClear:'clear',glClearStencil:'clearStencil',glStencilMask:'stencilMask'},integerCalls={glBlendFunc:['blendFunc',2],glStencilFunc:['stencilFunc',3],glStencilOp:['stencilOp',3],glTexParameteri:['texParameteri',3],glViewport:['viewport',4],glScissor:['scissor',4]};
/** GLES2 guest ABI -> actual WebGL. Unsupported operations fail visibly. */
export class GameGraphics {
 constructor(canvas,{width=960,height=640,log=()=>{}}={}){
  this.supportsCommandBatch=true;this.supportsMeshBatch=true;this.canvas=canvas;canvas.width=width;canvas.height=height;this.renderCanvas=document.createElement('canvas');this.renderCanvas.width=width;this.renderCanvas.height=height;this.presentation=canvas.getContext('2d',{alpha:false});this.gl=this.renderCanvas.getContext('webgl',{alpha:false,depth:true,stencil:true,antialias:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL unavailable');
  const g=this.gl;g.viewport(0,0,width,height);g.depthFunc(g.LEQUAL);this.log=log;this.next=1;this.objects=new Map();this.uniforms=new Map();this.buffers=new Map();this.bindings=new Map();this.attributes=new Map();this.enabledAttributes=new Set();this.clientBuffers=new Map();this.shaders=[];this.draws=0;this.textureUploads=0;this.bufferUploads=0;this.counts=new Map();this.errors=[];
  for(const n of ['WEBGL_compressed_texture_etc1','WEBGL_compressed_texture_etc','WEBGL_compressed_texture_s3tc','OES_element_index_uint','OES_standard_derivatives'])g.getExtension(n);
  this.debug=g.getExtension('WEBGL_debug_renderer_info');this.renderer=this.debug?g.getParameter(this.debug.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);this.initializeDefaultTextures();
 }
 initializeDefaultTextures(){
  if(this.defaultTextures)return;const g=this.gl,active=g.getParameter(g.ACTIVE_TEXTURE),targets=[g.TEXTURE_2D,g.TEXTURE_CUBE_MAP],queries=[g.TEXTURE_BINDING_2D,g.TEXTURE_BINDING_CUBE_MAP],reverse=new Map([...this.objects].map(([id,object])=>[object,id])),units=g.getParameter(g.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  this.defaultTextures=new Map(targets.map(target=>[target,g.createTexture()]));this.textureBindings=new Map();
  // GLES2 has a real default texture for each target. WebGL's null binding has
  // no texture object, and texParameter on it raises INVALID_OPERATION.
  for(let unit=g.TEXTURE0;unit<g.TEXTURE0+units;unit++){g.activeTexture(unit);for(let i=0;i<targets.length;i++){const target=targets[i],object=g.getParameter(queries[i]);this.textureBindings.set(unit+'/'+target,{unit,target,id:object?(reverse.get(object)||0):0});if(!object)g.bindTexture(target,this.defaultTextures.get(target));}}
  g.activeTexture(active);this.activeTexture=active;
 }
 present(){this.presentation.drawImage(this.renderCanvas,0,0,this.canvas.width,this.canvas.height);}
 id(object){if(!object)return 0;const id=this.next++;this.objects.set(id,object);return id;}
 object(id){if(!id)return null;const o=this.objects.get(id);if(!o)throw Error('Unknown GL handle '+id);return o;}
 floatArray(r,p,n){const b=r.read(p,n*4);return new Float32Array(b.buffer,b.byteOffset,n);}
 call(name,r){
  const g=this.gl,a=i=>r.arg(i),fl=i=>bitsFloat(a(i));this.counts.set(name,(this.counts.get(name)||0)+1);
  const simple=simpleCalls;
  if(name==='glActiveTexture'){this.activeTexture=a(0);g.activeTexture(a(0));return 0;}
  if(simple[name]){g[simple[name]](a(0));return 0;}
  const ints=integerCalls;
  if(ints[name]){const [fn,n]=ints[name];g[fn](...Array.from({length:n},(_,i)=>a(i)));return 0;}
  if(name==='glDepthMask'){g.depthMask(!!a(0));return 0;}
  if(name==='glBlendEquationOES'){g.blendEquation(a(0));return 0;}
  if(name==='glClearColor'||name==='glBlendColor'){g[name==='glClearColor'?'clearColor':'blendColor'](fl(0),fl(1),fl(2),fl(3));return 0;}
  if(name==='glClearDepthf'){g.clearDepth(fl(0));return 0;}
  if(name==='glDepthRangef'){g.depthRange(fl(0),fl(1));return 0;}
  if(name==='glHint'){g.hint(a(0),a(1));return 0;}
  if(name==='glGetError'){const error=g.getError();if(error){this.errors.push(error);this.log({type:'gl-error',error,caller:r.reg(14)});}return error;}
  if(name==='glGetIntegerv'){const param=a(0);if(param===g.TEXTURE_BINDING_2D||param===g.TEXTURE_BINDING_CUBE_MAP){r.u32(a(1),this.textureBindings.get(this.activeTexture+'/'+(param===g.TEXTURE_BINDING_2D?g.TEXTURE_2D:g.TEXTURE_CUBE_MAP))?.id||0);return 0;}let v=g.getParameter(param);if(v===null)throw Error('Unsupported GL query '+param.toString(16));if(typeof v==='number'||typeof v==='boolean')r.u32(a(1),Number(v));else if(ArrayBuffer.isView(v)||Array.isArray(v))Array.from(v).forEach((x,i)=>r.u32(a(1)+i*4,Number(x)));else throw Error('Object-valued GL query '+param.toString(16));return 0;}
  if(name==='glCreateShader')return this.id(g.createShader(a(0)));
  if(name==='glShaderSource'){
   let source='';for(let i=0;i<a(1);i++){const p=r.u32(a(2)+4*i),len=a(3)?r.u32(a(3)+4*i)|0:-1;source+=len<0?r.str(p):new TextDecoder().decode(r.read(p,len));}
   const shader=this.object(a(0));g.shaderSource(shader,source);this.shaders.push({id:a(0),type:g.getShaderParameter(shader,g.SHADER_TYPE),source});return 0;
  }
  if(name==='glCompileShader'){const shader=this.object(a(0));g.compileShader(shader);const success=g.getShaderParameter(shader,g.COMPILE_STATUS),info=g.getShaderInfoLog(shader);const entry=this.shaders.findLast(s=>s.id===a(0));if(entry){entry.compiled=success;entry.log=info;}this.log({type:'shader-compile',id:a(0),success,info});return 0;}
  if(name==='glGetShaderiv'){const shader=this.object(a(0)),p=a(1);let value=p===0x8b84?(g.getShaderInfoLog(shader)||'').length+1:p===0x8b88?(g.getShaderSource(shader)||'').length+1:g.getShaderParameter(shader,p);r.u32(a(2),Number(value));return 0;}
  if(name==='glGetShaderInfoLog'||name==='glGetProgramInfoLog'){const info=(name==='glGetShaderInfoLog'?g.getShaderInfoLog(this.object(a(0))):g.getProgramInfoLog(this.object(a(0))))||'',b=new TextEncoder().encode(info),n=Math.min(b.length,Math.max(0,a(1)-1));if(a(1))r.write(a(3),Uint8Array.from([...b.subarray(0,n),0]));if(a(2))r.u32(a(2),n);return 0;}
  if(name==='glCreateProgram')return this.id(g.createProgram());
  if(name==='glAttachShader'){g.attachShader(this.object(a(0)),this.object(a(1)));return 0;}
  if(name==='glBindAttribLocation'){g.bindAttribLocation(this.object(a(0)),a(1),r.str(a(2)));return 0;}
  if(name==='glLinkProgram'){const p=this.object(a(0));g.linkProgram(p);this.log({type:'program-link',id:a(0),success:g.getProgramParameter(p,g.LINK_STATUS),info:g.getProgramInfoLog(p)});return 0;}
  if(name==='glUseProgram'){g.useProgram(this.object(a(0)));return 0;}
  if(name==='glGetProgramiv'){const p=this.object(a(0)),param=a(1),value=param===0x8b84?(g.getProgramInfoLog(p)||'').length+1:g.getProgramParameter(p,param);r.u32(a(2),Number(value));return 0;}
  if(name==='glGetUniformLocation'){const u=g.getUniformLocation(this.object(a(0)),r.str(a(1)));if(u===null)return -1;const id=this.next++;this.uniforms.set(id,u);return id;}
  if(name==='glUniform1i'){g.uniform1i(this.uniforms.get(a(0))||null,a(1)|0);return 0;}
  if(name==='glUniform1fv'||name==='glUniform4fv'){g[name==='glUniform1fv'?'uniform1fv':'uniform4fv'](this.uniforms.get(a(0))||null,this.floatArray(r,a(2),a(1)*(name==='glUniform4fv'?4:1)));return 0;}
  if(name==='glUniformMatrix4fv'){g.uniformMatrix4fv(this.uniforms.get(a(0))||null,!!a(2),this.floatArray(r,a(3),a(1)*16));return 0;}
  if(name==='glDeleteShader'||name==='glDeleteProgram'){g[name==='glDeleteShader'?'deleteShader':'deleteProgram'](this.object(a(0)));this.objects.delete(a(0));return 0;}
  if(name==='glGenBuffers'||name==='glGenTextures'){for(let i=0;i<a(0);i++){const id=this.id(name==='glGenBuffers'?g.createBuffer():g.createTexture());if(name==='glGenBuffers')this.buffers.set(id,{size:0,data:new Uint8Array(0)});r.u32(a(1)+4*i,id);}return 0;}
  if(name==='glDeleteBuffers'||name==='glDeleteTextures'){for(let i=0;i<a(0);i++){const id=r.u32(a(1)+4*i);if(!id)continue;g[name==='glDeleteBuffers'?'deleteBuffer':'deleteTexture'](this.object(id));this.objects.delete(id);this.buffers.delete(id);if(name==='glDeleteTextures'){for(const binding of this.textureBindings.values())if(binding.id===id){binding.id=0;g.activeTexture(binding.unit);g.bindTexture(binding.target,this.defaultTextures.get(binding.target));}g.activeTexture(this.activeTexture);}}return 0;}
  if(name==='glBindTexture'){const target=a(0),id=a(1);g.bindTexture(target,id?this.object(id):this.defaultTextures.get(target));this.textureBindings.set(this.activeTexture+'/'+target,{unit:this.activeTexture,target,id});return 0;}
  if(name==='glBindBuffer'){g.bindBuffer(a(0),this.object(a(1)));this.bindings.set(a(0),a(1));return 0;}
  if(name==='glBufferData'){const id=this.bindings.get(a(0)),b=this.buffers.get(id);if(!b)throw Error('BufferData without buffer');b.size=a(1);b.data=a(2)?r.read(a(2),a(1)):new Uint8Array(a(1));g.bufferData(a(0),a(2)?b.data:a(1),a(3));this.bufferUploads++;return 0;}
  if(name==='glMapBufferOES'){const b=this.buffers.get(this.bindings.get(a(0)));if(!b||a(1)!==0x88b9)throw Error('Unsupported buffer map');if(b.mapped)throw Error('Buffer already mapped');b.mapped=r.malloc(b.size);r.write(b.mapped,b.data);return b.mapped;}
  if(name==='glUnmapBufferOES'){const b=this.buffers.get(this.bindings.get(a(0)));if(!b?.mapped)throw Error('Unmap without map');b.data=r.read(b.mapped,b.size);g.bufferSubData(a(0),0,b.data);r.free(b.mapped);delete b.mapped;this.bufferUploads++;return 1;}
  if(name==='glEnableVertexAttribArray'||name==='glDisableVertexAttribArray'){const enable=name==='glEnableVertexAttribArray';if(enable)this.enabledAttributes.add(a(0));else this.enabledAttributes.delete(a(0));g[enable?'enableVertexAttribArray':'disableVertexAttribArray'](a(0));return 0;}
  if(name==='glVertexAttribPointer'){const attr={size:a(1),type:a(2),normalized:!!a(3),stride:a(4),pointer:a(5),buffer:this.bindings.get(g.ARRAY_BUFFER)||0};this.attributes.set(a(0),attr);if(attr.buffer)g.vertexAttribPointer(a(0),attr.size,attr.type,attr.normalized,attr.stride,attr.pointer);return 0;}
  if(name==='glDrawArrays'||name==='glDrawElements'){
   const indexed=name==='glDrawElements',count=a(indexed?1:2);let max=indexed?0:a(1)+count-1,temporaryIndices=false;
   if(indexed){const type=a(2),bytes=type===g.UNSIGNED_BYTE?1:type===g.UNSIGNED_SHORT?2:type===g.UNSIGNED_INT?4:0;if(!bytes)throw Error('Unsupported index type '+type);const bound=this.bindings.get(g.ELEMENT_ARRAY_BUFFER);let data;
    if(bound)data=this.buffers.get(bound).data.subarray(a(3),a(3)+count*bytes);else{data=r.read(a(3),count*bytes);this.indexStream??=g.createBuffer();g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.indexStream);g.bufferData(g.ELEMENT_ARRAY_BUFFER,data,g.STREAM_DRAW);temporaryIndices=true;}
    const v=new DataView(data.buffer,data.byteOffset,data.byteLength);for(let i=0;i<count;i++)max=Math.max(max,bytes===1?v.getUint8(i):bytes===2?v.getUint16(i*2,true):v.getUint32(i*4,true));
   }
   for(const index of this.enabledAttributes){const attr=this.attributes.get(index);if(!attr)throw Error('Enabled attribute has no pointer');if(attr.buffer)continue;const width=attr.type===g.BYTE||attr.type===g.UNSIGNED_BYTE?1:attr.type===g.SHORT||attr.type===g.UNSIGNED_SHORT?2:attr.type===g.FLOAT?4:0;if(!width)throw Error('Unsupported client attribute type '+attr.type);
    const size=count?max*(attr.stride||attr.size*width)+attr.size*width:0,data=r.read(attr.pointer,size);if(!this.clientBuffers.has(index))this.clientBuffers.set(index,g.createBuffer());g.bindBuffer(g.ARRAY_BUFFER,this.clientBuffers.get(index));g.bufferData(g.ARRAY_BUFFER,data,g.STREAM_DRAW);g.vertexAttribPointer(index,attr.size,attr.type,attr.normalized,attr.stride,0);
   }
   g.bindBuffer(g.ARRAY_BUFFER,this.object(this.bindings.get(g.ARRAY_BUFFER)||0));if(indexed)g.drawElements(a(0),count,a(2),temporaryIndices?0:a(3));else g.drawArrays(a(0),a(1),count);if(temporaryIndices)g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.object(this.bindings.get(g.ELEMENT_ARRAY_BUFFER)||0));this.draws++;return 0;
  }
  if(name==='glCompressedTexImage2D'){const data=r.read(a(7),a(6));g.compressedTexImage2D(a(0),a(1),a(2),a(3),a(4),a(5),data);this.textureUploads++;return 0;}
  if(name==='glTexImage2D'){const width=a(3),height=a(4),format=a(6),type=a(7),p=a(8),channels=format===g.RGBA?4:format===g.RGB?3:format===g.LUMINANCE_ALPHA?2:1;const bytes=type===g.UNSIGNED_BYTE?1:2,row=width*(bytes===2?2:channels),size=height?Math.ceil(row/4)*4*(height-1)+row:0;let data=p?r.read(p,size):null;if(data&&bytes===2)data=new Uint16Array(data.buffer);g.texImage2D(a(0),a(1),a(2),width,height,a(5),format,type,data);this.textureUploads++;return 0;}
  return r.unsupported('GLES '+name);
 }
 report(){return {renderer:this.renderer,draw_calls:this.draws,texture_uploads:this.textureUploads,buffer_uploads:this.bufferUploads,shaders:this.shaders,calls:Object.fromEntries(this.counts),observed_errors:this.errors};}
}
