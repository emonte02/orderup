#!/usr/bin/env python3
"""Locate original code and host work during an actual fire failure."""
import os
import concurrent.futures,json,pathlib,sys,time,urllib.request,subprocess
prefix=sys.argv[1]
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
    with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as response:
        return json.load(response).get('result')
source='''(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();const m=r.u32(r.elf.address('_ZN19KitchenFireMinigame9g_ManagerE'));let tick=0,seen=0,current=new Map(),slow=new Map(),fast=new Map(),slow_frames=[],fast_frames=0;const sleeps=[],calls=[],graphics=[],originalSleep=r.functions.get('usleep'),originalCall=r.call,originalGraphics=r.graphics.call;const invalidate=()=>r.uc.ccall('uc_ctl','number',['pointer','number','pointer'],[r.uc.getValue(r.engine.handle_ptr,'*'),0x4000000a,0]);const hook=r.engine.hook_add(r.uc.HOOK_BLOCK,(_e,address,size)=>{if(++tick%67)return;const pc=Number(address);current.set(pc,(current.get(pc)||0)+Number(size))},null,0,0x470000);r.nativeHot.gcTimings(true);r.function('usleep',()=>{if(r.arg(0)>=1000)sleeps.push({frame:o.frames,thread:r.active.id,delay:r.arg(0),lr:r.reg(14),entry:r.currentEntry});return originalSleep()});r.call=async function(name,...args){const before=performance.now(),answer=await originalCall.call(this,name,...args),ms=performance.now()-before;if(ms>70)calls.push({frame:o.frames,name,ms});return answer};r.graphics.call=function(name,runtime){const before=performance.now();try{return originalGraphics.call(this,name,runtime)}finally{const ms=performance.now()-before;if(ms>20)graphics.push({frame:o.frames,name,ms})}};o.timings.push=function(v){if(++seen>6){const target=v>70?slow:fast;for(const[pc,n]of current)target.set(pc,(target.get(pc)||0)+n);if(v>70)slow_frames.push({frame:o.frames,phase:r.u32(m+0x20),work:v,gc:r.nativeHot.gcTimings(),imports:r.recentCalls.slice(-8)});else fast_frames++;}current=new Map();return Array.prototype.push.call(this,v)};try{invalidate();await o.controller.resume();const began=performance.now();while(r.u32(m+0x20)!==5&&performance.now()-began<90000&&!o.error)await new Promise(resolve=>setTimeout(resolve,250));await new Promise(resolve=>setTimeout(resolve,1500));await o.controller.pause();return{slow_frames,fast_frames,slow:[...slow],fast:[...fast],calls,sleeps,graphics,phase:r.u32(m+0x20),error:o.error}}finally{await o.controller.pause();delete o.timings.push;r.call=originalCall;r.function('usleep',originalSleep);r.graphics.call=originalGraphics;r.engine.hook_del(hook);invalidate()}})()'''
req('profile-start')
with concurrent.futures.ThreadPoolExecutor() as pool:
    future=pool.submit(req,'eval',source=source)
    time.sleep(.5)
    req('label',text='OK',options={'timeout':10000,'after':100})
    if '--mouse'in sys.argv:subprocess.run(['python3','tools/perf_fire_mouse.py',prefix+'-mouse.json'],check=True)
    result=future.result()
req('profile-stop',path=prefix+'.cpuprofile')
pathlib.Path(prefix+'.json').write_text(json.dumps(result))
req('screen',path=prefix+'-result.png')
print(json.dumps({'slow_frames':[(x['frame'],x['phase'],x['work']) for x in result['slow_frames']], 'phase':result['phase'],'error':result['error'],'sleeps':len(result['sleeps'])}),flush=True)
