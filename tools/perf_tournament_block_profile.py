#!/usr/bin/env python3
"""Attribute the tournament transition on the exact release engine; not an FPS run."""
import concurrent.futures,json,pathlib,sys,time,urllib.request
prefix=sys.argv[1]
def req(action,**kw):
 base=json.loads(pathlib.Path('analysis/performance-control.json').read_text())['control_url']
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as response:
  data=json.load(response)
  if not data.get('ok'):raise RuntimeError(data)
  return data.get('result')
source="""(async()=>{const o=orderup,r=o.runtime,uc=r.uc,handle=uc.getValue(r.engine.handle_ptr,'*'),invalidate=()=>uc.ccall('uc_ctl','number',['pointer','number','pointer'],[handle,0x4000000a,0]);let blocks=0,tick=0,entries=new Map();const rows=[],slow=[],sleeps=[],graphics=[],originalSleep=r.functions.get('usleep'),originalPush=o.timings.push,originalGraphics=r.graphics.call;const hook=r.engine.hook_add(uc.HOOK_BLOCK,(_e,pc,size)=>{blocks++;if(++tick%67)return;pc=Number(pc);const row=entries.get(pc);if(row){row[0]+=size;row[1]++;}else entries.set(pc,[size,1]);},null,0,0x470000);r.function('usleep',()=>{sleeps.push({frame:o.frames,delay_us:r.arg(0),thread:r.active.id,lr:r.reg(14)});return originalSleep()});r.graphics.call=function(name,runtime){const start=performance.now();try{return originalGraphics.call(this,name,runtime);}finally{const ms=performance.now()-start;if(ms>4)graphics.push({frame:o.frames,name,ms});}};r.nativeHot.gcTimings(true);o.timings.push=function(work){const detail={frame:o.frames,time:performance.now(),work,blocks,samples:entries.size,loading:o.activityLoading};rows.push(detail);if(work>70)slow.push({...detail,pc_rows:[...entries].flatMap(([pc,[bytes,hits]])=>[pc,bytes,hits]),gc:r.nativeHot.gcTimings(),ports:r.nativeHot.report(),imports:r.recentCalls.slice(-20)});blocks=0;entries=new Map();return originalPush.call(this,work);};try{invalidate();const first=o.frames;await o.controller.resume();while(o.frames<first+1000&&!o.error)await new Promise(resolve=>setTimeout(resolve,100));await o.controller.pause();return{diagnostic_not_fps:true,exact_release_bundle:true,block_callback_sampling_period:67,rows,slow,sleeps,graphics,error:o.error};}finally{await o.controller.pause();o.timings.push=originalPush;r.function('usleep',originalSleep);r.graphics.call=originalGraphics;r.engine.hook_del(hook);invalidate();}})()"""
req('profile-start')
try:
 with concurrent.futures.ThreadPoolExecutor()as pool:
  future=pool.submit(req,'eval',source=source);time.sleep(.5)
  for i in range(2):req('label',text='OK',options={'timeout':60000,'after':1000})
  result=future.result()
finally:req('profile-stop',path=prefix+'.cpuprofile')
pathlib.Path(prefix+'.json').write_text(json.dumps(result));print({'slow':[(x['frame'],x['work'],x['loading'])for x in result['slow']],'sleep_calls':len(result['sleeps']),'graphics_slow':result['graphics'],'error':result['error']},flush=True)
