#!/usr/bin/env python3
"""Profile original dishwashing code while sending ordinary mouse strokes."""
import os
import concurrent.futures,json,pathlib,sys,time,urllib.request
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as r:return json.load(r).get('result')
source='''(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();const m=r.u32(r.elf.address('_ZN15CleanupMinigame9g_ManagerE'));let tick=0,seen=0,current=new Map(),slow=new Map(),fast=new Map(),slow_frames=[],fast_frames=0;const invalidate=()=>r.uc.ccall('uc_ctl','number',['pointer','number','pointer'],[r.uc.getValue(r.engine.handle_ptr,'*'),0x4000000a,0]);const hook=r.engine.hook_add(r.uc.HOOK_BLOCK,(_e,address,size)=>{if(++tick%67)return;const pc=Number(address);current.set(pc,(current.get(pc)||0)+Number(size))},null,0,0x470000);o.timings.push=function(v){if(++seen>6){const target=v>38?slow:fast;for(const[pc,n]of current)target.set(pc,(target.get(pc)||0)+n);if(v>38)slow_frames.push({frame:o.frames,phase:r.u32(m+0x58),work:v});else fast_frames++;}current=new Map();return Array.prototype.push.call(this,v)};try{invalidate();await o.controller.resume();await new Promise(resolve=>setTimeout(resolve,23000));await o.controller.pause();return{slow_frames,fast_frames,slow:[...slow],fast:[...fast],phase:r.u32(m+0x58),remaining:r.f32(m+0x5c),error:o.error}}finally{await o.controller.pause();delete o.timings.push;r.engine.hook_del(hook);invalidate()}})()'''
with concurrent.futures.ThreadPoolExecutor()as pool:
 future=pool.submit(req,'eval',source=source);time.sleep(.6);req('label',text='OK',options={'after':100})
 for row in range(12):
  req('drag',points=[300 if row%2==0 else 660,160+40*(row%9),660 if row%2==0 else 300,162+40*(row%9)],ms=450)
 result=future.result()
pathlib.Path(prefix+'.json').write_text(json.dumps(result));print({k:v for k,v in result.items()if k not in ['slow','fast','slow_frames']},flush=True)
