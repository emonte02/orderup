import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createGameSession} from './game_session.mjs';
const session=await createGameSession(),results={};
try{
 for(const [name,enabled] of [['original',false],['c_wasm',true]]){
  console.log('Starting cold browser scene:',name);const page=await session.open('startup-'+name,null,{decompression:enabled});
  const result=await page.evaluate(()=>({startup_ms:orderup.startup.ready_ms,frames:orderup.frames,error:orderup.error,decompression:orderup.runtime.decompression?.report()||null,graphics_errors:orderup.runtime.graphics.errors,java_objects:orderup.runtime.javaObjects.size}));assert.equal(result.error,null);assert(result.startup_ms>0);assert.equal(result.graphics_errors.length,0);if(enabled)assert(result.decompression.calls>0);results[name]=result;await page.screenshot({path:new URL('../../analysis/startup-decompression-'+name+'.png',import.meta.url).pathname});await page.close();console.log(name,result);
 }
 const report={same_bundle:true,sequential_cold_profiles:true,results,speedup:results.original.startup_ms/results.c_wasm.startup_ms,build:JSON.parse(fs.readFileSync(new URL('../build/emulator-build.json',import.meta.url)))};fs.writeFileSync(new URL('../../analysis/startup-decompression-browser.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log('Startup speedup',report.speedup);
}finally{await session.close();}
