import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ocrTool=fileURLToPath(new URL('../../tools/ocr-image',import.meta.url));
/** Read the rendered game, including menus drawn inside its native canvas. */
export async function readCanvasText(page){
 const encoded=await page.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'orderup-scene-'));
 try{const image=path.join(temporary,'canvas.png');fs.writeFileSync(image,Buffer.from(encoded,'base64'));return JSON.parse(execFileSync(ocrTool,[image],{encoding:'utf8'}));}
 finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
/** Keep stepping during native loading; a 3D scene need not contain any text. */
export async function waitSceneContent(page,{timeout=120000,onProgress=()=>{}}={}){
 const began=Date.now();let stable=0;
 while(Date.now()-began<timeout){
  await page.waitForTimeout(2000);
  const state=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0,total=0;
   for(let i=0;i<pixels.length;i+=256){total++;if(pixels[i]<12&&pixels[i+1]<12&&pixels[i+2]<12)dark++;}
   return{error:orderup.error,frames:orderup.frames,dark:dark/total};
  });
  if(state.error)throw Error(state.error);
  const text=(await readCanvasText(page)).map(item=>item.text),loading=text.some(label=>/^Loading\s*[.…]*$/i.test(label.trim()));
  onProgress({elapsed_ms:Date.now()-began,frames:state.frames,loading,dark:state.dark,text});
  stable=!loading&&state.dark<0.95?stable+1:0;
  if(stable>=2)return{elapsed_ms:Date.now()-began,frames:state.frames,text};
 }
 throw Error('Native scene did not finish loading within '+timeout+' ms');
}
/** Wait specifically for the rendered kitchen HUD after taking a table's order. */
export async function waitKitchenContent(page,{timeout=150000}={}){
 const began=Date.now();let stable=0;
 while(Date.now()-began<timeout){
  await page.waitForTimeout(500);const state=await page.evaluate(()=>{
   const pixels=document.querySelector('canvas').getContext('2d').getImageData(145,15,105,80).data;let orange=0,total=0;
   for(let i=0;i<pixels.length;i+=12){total++;if(pixels[i]>220&&pixels[i+1]>80&&pixels[i+1]<195&&pixels[i+2]<110)orange++;}
   return{error:orderup.error,frames:orderup.frames,orange:orange/total};
  });if(state.error)throw Error(state.error);stable=state.orange>0.18?stable+1:0;
  if(stable>=3)return{elapsed_ms:Date.now()-began,frames:state.frames,oven_hud_visible:true};
 }
 throw Error('Original kitchen HUD did not appear within '+timeout+' ms');
}
