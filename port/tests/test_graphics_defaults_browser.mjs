import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async()=>{
  const {GameGraphics}=await import('/runtime/graphics.mjs'),graphics=new GameGraphics(document.createElement('canvas'),{width:16,height:16}),g=graphics.gl;let args=[],written=0;
  const r={arg:i=>args[i]||0,u32:(_p,v)=>{written=v;},read:()=>Uint8Array.of(13,71,203,255)},call=(name,...values)=>{args=values;return graphics.call(name,r);};
  call('glBindTexture',g.TEXTURE_2D,0);call('glTexParameteri',g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);call('glTexParameteri',g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);call('glTexImage2D',g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,256);
  const defaultTexture=g.getParameter(g.TEXTURE_BINDING_2D);call('glActiveTexture',g.TEXTURE1);call('glBindTexture',g.TEXTURE_2D,0);const shared=g.getParameter(g.TEXTURE_BINDING_2D)===defaultTexture;call('glGetIntegerv',g.TEXTURE_BINDING_2D,1);const guestDefaultId=written;
  call('glGenTextures',1,1);const id=written;call('glBindTexture',g.TEXTURE_2D,id);r.u32=(p,v)=>v===undefined?id:(written=v);call('glDeleteTextures',1,1);const restored=g.getParameter(g.TEXTURE_BINDING_2D)===defaultTexture;call('glTexParameteri',g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);
  const shader=(type,source)=>{const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;},program=g.createProgram();g.attachShader(program,shader(g.VERTEX_SHADER,'attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}'));g.attachShader(program,shader(g.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D picture;void main(){gl_FragColor=texture2D(picture,vec2(0.5));}'));g.linkProgram(program);g.useProgram(program);g.uniform1i(g.getUniformLocation(program,'picture'),1);
  const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);const location=g.getAttribLocation(program,'position');g.enableVertexAttribArray(location);g.vertexAttribPointer(location,2,g.FLOAT,false,0,0);g.drawArrays(g.TRIANGLES,0,3);const pixel=new Uint8Array(4);g.readPixels(8,8,1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);
  call('glBindTexture',g.TEXTURE_CUBE_MAP,0);call('glTexParameteri',g.TEXTURE_CUBE_MAP,g.TEXTURE_MIN_FILTER,g.LINEAR);
  return{shared_default_across_units:shared,guest_default_id:guestDefaultId,default_restored_after_delete:restored,default_upload_sample:Array.from(pixel),webgl_error:g.getError()};
 });assert.equal(report.shared_default_across_units,true);assert.equal(report.guest_default_id,0);assert.equal(report.default_restored_after_delete,true);assert.deepEqual(report.default_upload_sample,[13,71,203,255]);assert.equal(report.webgl_error,0);fs.writeFileSync(new URL('../../analysis/graphics-default-texture-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
