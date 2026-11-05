#!/usr/bin/env python3
"""Locate original ARM work in the tournament transition; never an FPS test."""
import concurrent.futures,json,pathlib,sys,time,urllib.request
prefix=sys.argv[1]
def req(action,**kw):
 base=json.loads(pathlib.Path('analysis/performance-control.json').read_text())['control_url']
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as response:return json.load(response).get('result')
source='''(async()=>{const o=orderup,r=o.runtime,uc=r.uc,handle=uc.getValue(r.engine.handle_ptr,'*'),profile=uc._ou_profile_create(handle,0,0x470000,67);if(!profile)throw Error('Native sampler unavailable');const invalidate=()=>uc.ccall('uc_ctl','number',['pointer','number','pointer'],[handle,0x4000000a,0]);const rows=[],slow=[],sleeps=[],originalSleep=r.functions.get('usleep'),originalPush=o.timings.push;let previous=r.nativeHot.report();r.function('usleep',()=>{sleeps.push({frame:o.frames,delay_us:r.arg(0),thread:r.active.id,lr:r.reg(14)});return originalSleep()});r.nativeHot.gcTimings(true);o.timings.push=function(work){const count=uc._ou_profile_count(profile,0),p=uc._ou_profile_data(profile),data=new Uint32Array(uc.HEAPU8.buffer,p,count*3),now=r.nativeHot.report(),ports=Object.fromEntries(Object.entries(now).filter(([k,v])=>typeof v==='number').map(([k,v])=>[k,v-previous[k]])),detail={frame:o.frames,time:performance.now(),work,blocks:uc._ou_profile_count(profile,1),samples:uc._ou_profile_count(profile,2),dropped:uc._ou_profile_count(profile,3),loading:o.activityLoading,ports};rows.push(detail);if(work>70)slow.push({...detail,pc_rows:Array.from(data),gc:r.nativeHot.gcTimings(),imports:r.recentCalls.slice(-20)});previous=now;uc._ou_profile_clear(profile);return originalPush.call(this,work);};try{invalidate();uc._ou_profile_enable(profile,1);const first=o.frames;await o.controller.resume();while(o.frames<first+1000&&!o.error)await new Promise(resolve=>setTimeout(resolve,100));await o.controller.pause();return{diagnostic_not_fps:true,native_c_sampler:true,rows,slow,sleeps,error:o.error};}finally{await o.controller.pause();o.timings.push=originalPush;r.function('usleep',originalSleep);uc._ou_profile_enable(profile,0);uc._ou_profile_destroy(profile);invalidate();}})()'''
req('profile-start')
try:
 with concurrent.futures.ThreadPoolExecutor()as pool:
  future=pool.submit(req,'eval',source=source);time.sleep(.5)
  for i in range(2):req('label',text='OK',options={'timeout':30000,'after':1000})
  result=future.result()
finally:req('profile-stop',path=prefix+'.cpuprofile')
pathlib.Path(prefix+'.json').write_text(json.dumps(result));print({'slow':[(x['frame'],x['work'],x['loading'])for x in result['slow']],'samples_dropped':sum(x['dropped']for x in result['rows']),'sleep_calls':len(result['sleeps']),'error':result['error']},flush=True)
