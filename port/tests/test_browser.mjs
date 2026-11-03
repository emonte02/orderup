import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const routes=new Map([
 ['/port/build/orderup-core.mjs',['port/build/orderup-core.mjs','text/javascript']],
 ['/port/build/orderup-core.wasm',['port/build/orderup-core.wasm','application/wasm']],
 ['/port/web/mouse.mjs',['port/web/mouse.mjs','text/javascript']],
 ['/fixtures/chefdata',['analysis/game-apk/assets/chefdata.png','application/octet-stream']],
 ['/fixtures/chefmisc',['analysis/game-apk/assets/chefmisc.png','application/octet-stream']],
 ['/fixtures/main',['originals/main.13.com.svsgames.orderup.obb','application/octet-stream']],
 ['/fixtures/guest-image',['port/build/crc-guest-image.bin','application/octet-stream']],
 ['/fixtures/crc-cases',['analysis/crc-wasm-vectors.json','application/json']],
]);
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Order Up port validation — not a playable game</title><style>body{margin:0}canvas{position:absolute;left:10px;top:20px;width:480px;height:320px;background:#111}</style><canvas width="960" height="640"></canvas>');return;}
 const route=routes.get(req.url);if(!route){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',route[1]);fs.createReadStream(path.join(root,route[0])).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const samples=await page.evaluate(async()=>{
  const {default:createCore}=await import('/port/build/orderup-core.mjs');
  const M=await createCore();const results=[];
  for(const [name,count]of [['chefdata',952],['chefmisc',13],['main',109]]){
   const data=new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
   const p=M._malloc(data.length);M.HEAPU8.set(data,p);const w=M._ou_wad_open(p,data.length);
   if(!w||M._ou_wad_count(w)!==count)throw Error('WAD open '+name);
   const hash=(M._ou_wad_hash(w,0)>>>0).toString(16).padStart(8,'0');
   const size=M._ou_wad_size(w,0),q=M._malloc(size);
   if(M._ou_wad_read(w,0,q,size)!==size)throw Error('WAD read '+name);
   let asset=M.HEAPU8.slice(q,q+size),key=hash;
   if(name==='main'){
    const nested=M._ou_wad_open(q,size);if(!nested)throw Error('nested');
    if(M._ou_wad_mode(nested)!==2)throw Error('Expected compressed mode 2');
    const n=M._ou_wad_size(nested,0),r=M._malloc(n);
    key+='/'+(M._ou_wad_hash(nested,0)>>>0).toString(16).padStart(8,'0');
    if(M._ou_wad_read(nested,0,r,n)!==n)throw Error('nested read');
    asset=M.HEAPU8.slice(r,r+n);M._free(r);M._ou_wad_close(nested);
   }
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',asset)),b=>b.toString(16).padStart(2,'0')).join('');
   results.push({name,count,key,digest});M._free(q);M._ou_wad_close(w);M._free(p);
  }
  const {bindMouse}=await import('/port/web/mouse.mjs');
  window.received=[];window.unbind=bindMouse(document.querySelector('canvas'),(...args)=>window.received.push(args));
  return results;
 });
 const translatedCases=await page.evaluate(async()=>{
  const {default:createCore}=await import('/port/build/orderup-core.mjs');const M=await createCore();
  const guest=new Uint8Array(await(await fetch('/fixtures/guest-image')).arrayBuffer());
  const cases=await(await fetch('/fixtures/crc-cases')).json();const p=M._malloc(guest.length);M.HEAPU8.set(guest,p);
  try{for(const c of cases){const b=Uint8Array.from(c.hex.match(/../g)||[],h=>parseInt(h,16));M.HEAPU8.set(b,p+0x700000);M.HEAPU8[p+0x700000+b.length]=0;if((M._ou_recompiled_crc(p,c.address,c.seed)>>>0)!==c.expected)throw Error('Translated CRC mismatch');}}finally{M._free(p);}
  return cases.length;
 });
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'analysis/asset-manifest.json'),'utf8'));
 for(const s of samples){const x=manifest.find(x=>x.source===s.name&&x.hash_path===s.key);assert(x);assert.equal(s.digest,x.sha256);}
 await page.mouse.move(110,70);await page.mouse.down();await page.mouse.move(250,180);await page.mouse.move(700,500);await page.mouse.up();
 const events=await page.evaluate(()=>window.received);
 assert.deepEqual(events[0],[0,0,200,100,false]);assert.deepEqual(events.at(-1),[0,1,1380,960,false]);
 assert(events.some(e=>e[1]===2&&e[2]===480&&e[3]===320));
 await page.mouse.move(100,100);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.equal(await page.evaluate(()=>window.received.at(-1)[1]),1);await page.mouse.up();
 await page.evaluate(()=>window.unbind());assert.deepEqual(errors,[]);
 const report={browser:await browser.version(),samples,translated_arm_crc_cases:translatedCases,mouse:'real mouse press/drag/outside-canvas release passed; synthetic blur passed',page_errors:errors,limitation:'Tests the port foundation only; original engine startup/rendering is not implemented.'};
 fs.writeFileSync(path.join(root,'analysis/browser-tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
