/** Run actual guest usleep calls in Chrome and verify every wake deadline. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../tools/browser/node_modules/playwright/index.mjs';
import {createGameServer} from '../../tools/serve.mjs';
const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();await page.route('**/sleep-test',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Guest sleep verification</title>'}));if(process.env.OU_EMULATOR_BUNDLE)await page.route('**/unicorn.js',route=>route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(process.env.OU_EMULATOR_BUNDLE)}));if(process.env.OU_RUNTIME_SLEEP_BASELINE)await page.route('**/runtime/runtime-legacy-waits.mjs',route=>route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(process.env.OU_RUNTIME_SLEEP_BASELINE)}));
 await page.goto(url+'/sleep-test');await page.addScriptTag({url:url+'/unicorn.js'});
 const report=await page.evaluate(async baseline=>{
  const uc=await MUnicorn(),elf=new Uint8Array(await(await fetch('/game/libOrderUp.so')).arrayBuffer()),versions=[];
  for(const module of baseline?['/runtime/runtime-legacy-waits.mjs','/runtime/runtime.mjs']:['/runtime/runtime.mjs']){
   const{ArmRuntime}=await import(module),r=new ArmRuntime(uc,elf),requests=[],wake=r.wakeSleepers,sleep=r.functions.get('usleep');let yields=0,hostYield=r.yieldHost;r.yieldHost=async()=>{yields++;return hostYield();};
   try{
    r.function('usleep',()=>{const row={start:r.virtualMs,requested_ms:r.arg(0)/1000};const answer=sleep();row.deadline=r.active.wake;requests.push(row);return answer;});r.wakeSleepers=()=>{const pending=r.main.state==='sleep';wake();if(pending&&r.main.state==='ready')requests.at(-1).woke=r.virtualMs;};
    const P=0x700000,code=[0xe92d4010,0xe3a04020,0xe30003e8,0xe59fc00c,0xe12fff3c,0xe2544001,0x1afffffa,0xe8bd8010,r.trap('usleep')];r.map(P,4096);code.forEach((v,i)=>r.u32(P+i*4,v));const start=performance.now(),result=await r.call(P);const elapsed_ms=performance.now()-start;r.pauseClock();const frozen=r.virtualMs;await new Promise(resolve=>setTimeout(resolve,30));const paused_clock_change=r.virtualMs-frozen;r.resumeClock();versions.push({module,elapsed_ms,result,yields,requests,paused_clock_change});
   }finally{r.close();}
  }
  return{versions};
 },!!process.env.OU_RUNTIME_SLEEP_BASELINE);
 for(const v of report.versions){assert.equal(v.result,0);assert.equal(v.requests.length,32);assert.equal(v.paused_clock_change,0);assert(v.elapsed_ms>=32);for(const row of v.requests){assert.equal(row.requested_ms,1);assert(row.woke>=row.deadline,'guest woke before its original deadline');}assert(v.yields>0);}
 report.actual_guest_sleep_calls=true;report.original_wall_clock_deadlines_preserved=true;report.paused_clock_stays_frozen=true;fs.writeFileSync(new URL('../../analysis/sleep-browser-tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report.versions.map(({module,elapsed_ms,yields,requests})=>({module,elapsed_ms,yields,sleeps:requests.length,maximum_lateness:Math.max(...requests.map(r=>r.woke-r.deadline))})));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
