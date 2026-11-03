import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {runARMProbe} from './arm_probe_shared.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bundle='tools/probes/node_modules/@alexaltea/unicorn-js/dist/unicorn_arm.js';
const createUnicorn=require(path.join(root,bundle));
const guest=fs.readFileSync(path.join(root,'port/build/crc-guest-image.bin'));
const crc=JSON.parse(fs.readFileSync(path.join(root,'analysis/crc-wasm-vectors.json')));
const vfp=JSON.parse(fs.readFileSync(path.join(root,'analysis/arm-vfp-probe-vectors.json')));
const nodeResult=runARMProbe(await createUnicorn(),guest,crc,vfp);
console.log('Node:',JSON.stringify(nodeResult));
const routes=new Map([
 ['/unicorn.js',[bundle,'text/javascript']],
 ['/probe.mjs',['port/tests/arm_probe_shared.mjs','text/javascript']],
 ['/guest',['port/build/crc-guest-image.bin','application/octet-stream']],
 ['/crc',['analysis/crc-wasm-vectors.json','application/json']],
 ['/vfp',['analysis/arm-vfp-probe-vectors.json','application/json']],
]);
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Original ARM CPU feasibility probe</title><script src="/unicorn.js"></script>');return;}
 const r=routes.get(req.url);if(!r){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',r[1]+(r[1].startsWith('text/')?'; charset=utf-8':''));fs.createReadStream(path.join(root,r[0])).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const chromeResult=await page.evaluate(async()=>{
  const {runARMProbe}=await import('/probe.mjs');
  const guest=new Uint8Array(await(await fetch('/guest')).arrayBuffer());
  const crc=await(await fetch('/crc')).json(),vfp=await(await fetch('/vfp')).json();
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{stencil:true});
  if(!gl)throw Error('WebGL unavailable for imported float call');
  const result=runARMProbe(await MUnicorn(),guest,crc,vfp,{depthRange:(near,far)=>gl.depthRange(near,far)});
  if(JSON.stringify(Array.from(gl.getParameter(gl.DEPTH_RANGE)))!=='[0.125,0.875]')throw Error('Guest GL depth range did not reach WebGL');
  if(gl.getError()!==gl.NO_ERROR)throw Error('Imported GL call failed');
  return result;
 });
 assert.deepEqual(chromeResult,nodeResult);assert.deepEqual(errors,[]);
 const report={backend:'@alexaltea/unicorn-js 2.1.4, ARM-only WebAssembly build',browser:await browser.version(),node:nodeResult,chrome:chromeResult,page_errors:errors,browser_gl_import_verified:true,playable:false};
 fs.writeFileSync(path.join(root,'analysis/arm-browser-probe.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
