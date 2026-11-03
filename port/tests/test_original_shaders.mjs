// Check recovered original GLSL, including a skinned vertex shader, against WebGL.
// Synthetic triangle input is a graphics compatibility test, not an original scene.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'analysis/asset-manifest.json')));
const sources=[];
for(const a of manifest){
 const bytes=fs.readFileSync(path.join(root,a.file));
 if(!bytes.includes(Buffer.from('gl_Position'))&&!bytes.includes(Buffer.from('gl_FragColor')))continue;
 const nul=bytes.indexOf(0),source=bytes.subarray(0,nul<0?undefined:nul).toString('utf8');
 if(!source.trimStart().startsWith('precision '))throw Error('Non-GLSL candidate: '+a.file);
 sources.push({file:a.file,hash:a.sha256,stage:source.includes('gl_Position')?'vertex':'fragment',source});
}
let browser;
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();
 const result=await page.evaluate(shaders=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;document.body.appendChild(canvas);
  const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  const environment={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),max_vertex_uniform_vectors:gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),max_vertex_attribs:gl.getParameter(gl.MAX_VERTEX_ATTRIBS),extensions:gl.getSupportedExtensions()};
  const compiled=new Map(),failures=[];
  for(const s of shaders){
   const shader=gl.createShader(s.stage==='vertex'?gl.VERTEX_SHADER:gl.FRAGMENT_SHADER);
   gl.shaderSource(shader,s.source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))failures.push({file:s.file,log:gl.getShaderInfoLog(shader)});
   else compiled.set(s.file,shader);
  }
  if(failures.length)return {environment,compiled:compiled.size,total:shaders.length,failures};
  const program=gl.createProgram();
  for(const file of ['assets/recovered/chefdata/13b8a94e.bin','assets/recovered/chefdata/0889d000.bin']){
   if(!compiled.has(file))throw Error('Required original shader missing');gl.attachShader(program,compiled.get(file));
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const bones=new Float32Array(56*16);for(let i=0;i<56;i++)bones.set(identity,i*16);
  gl.uniformMatrix4fv(gl.getUniformLocation(program,'bone_mats[0]'),false,bones);
  gl.uniformMatrix4fv(gl.getUniformLocation(program,'model_view_proj_matrix'),false,identity);
  for(const [name,value] of [['position_scale',[1,1,1,1]],['position_bias',[0,0,0,0]],['color_scale',[1,1,1,1]],['material_color0',[1,1,1,1]],['uv_scale_bias',[1,1,0,0]]])gl.uniform4fv(gl.getUniformLocation(program,name),value);
  for(const [name,value] of [['bones_attr',[0,1,0,0]],['weights_attr',[0.5,0.5,0,0]],['color_attr',[0.25,0.5,0.75,1]],['uv_attr0',[0,0,0,1]]]){
   const loc=gl.getAttribLocation(program,name);if(loc>=0){gl.disableVertexAttribArray(loc);gl.vertexAttrib4fv(loc,value);}
  }
  const vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,1,1,-1,0,1,0,1,0,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'position_attr');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,4,gl.FLOAT,false,0,0);
  const index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2]),gl.STATIC_DRAW);
  gl.viewport(0,0,64,64);gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,3,gl.UNSIGNED_SHORT,0);
  const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL error '+error);
  const expected=[64,128,191,255];if(pixel.some((x,i)=>Math.abs(x-expected[i])>1))throw Error('Unexpected test pixel '+Array.from(pixel));
  return {environment,total:shaders.length,compiled:compiled.size,vertex:shaders.filter(s=>s.stage==='vertex').length,fragment:shaders.filter(s=>s.stage==='fragment').length,failures,skinned_shader_pair_linked:true,indexed_triangle_pixel:Array.from(pixel),scope:'Original GLSL compiled unchanged except C-string NUL removal. One original 56-bone vertex shader and color fragment shader linked and drew indexed synthetic geometry. No original game scene, texture decode, engine startup, or frame-rate proof.'};
 },sources);
 assert.equal(result.failures.length,0,JSON.stringify(result.failures));assert.equal(result.compiled,sources.length);assert(result.skinned_shader_pair_linked);
 const report={browser:await browser.version(),...result,playable:false};
 fs.writeFileSync(path.join(root,'analysis/original-shader-probe.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();}
