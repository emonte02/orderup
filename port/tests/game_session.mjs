/** Isolated original-game integration session. Never uses the user's browser profile. */
import fs from 'node:fs';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
import {readCanvasText} from './scene_helpers.mjs';
import {tap} from './cooking_helpers.mjs';
export async function tapCanvasLabel(page,label,{timeout=15000,after=1600}={}){
 const start=Date.now(),normalize=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
 while(Date.now()-start<timeout){
  const rows=await readCanvasText(page),row=rows.find(row=>normalize(row.text)===normalize(label));
  if(row){await tap(page,row.x*960,row.y*640,after);return;}
  const error=await page.evaluate(()=>orderup.error);if(error)throw Error(error);await page.waitForTimeout(500);
 }
 throw Error('Rendered game button not found: '+label);
}
export async function createGameSession(){
 const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const url='http://127.0.0.1:'+server.address().port,pages=new Map();
 return{browser,server,url,pages,async open(name,fixturePath,{decompression}={}){
  if(pages.has(name))throw Error('Test page already exists: '+name);
  const page=await browser.newPage({viewport:{width:1100,height:850}});pages.set(name,page);
  if(decompression!==undefined)await page.route('**/app.mjs',async route=>{const response=await route.fetch(),text=await response.text(),needle='{files,graphics,audio,onSave:';if(text.split(needle).length!==2)throw Error('Test runtime option insertion point changed');const body=text.replace(needle,'{files,graphics,audio,optimizeDecompression:'+Boolean(decompression)+',onSave:');await route.fulfill({response,body,headers:{...response.headers(),'content-length':String(Buffer.byteLength(body))}});});
  await page.goto(url);
  if(fixturePath){const fixture=JSON.parse(fs.readFileSync(fixturePath));await page.evaluate(async fixture=>{
   const {openSaves}=await import('/runtime/persistence.mjs'),saves=await openSaves();
   for(const file of fixture.files)await saves.write(file.path,Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)));saves.close();
   if(typeof fixture.preferences?.['orderup-browser-preferences']==='string')for(const [key,value] of Object.entries(fixture.preferences))localStorage.setItem(key,value);
   else localStorage.setItem('orderup-browser-preferences',JSON.stringify(fixture.preferences));
  },fixture);}
  await page.waitForFunction(()=>orderup.state==='failed'||orderup.frames>=30,null,{timeout:600000});
  const error=await page.evaluate(()=>orderup.error);if(error)throw Error(error);await page.evaluate(()=>orderup.controller.pause());return page;
 },async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
}
