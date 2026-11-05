#!/usr/bin/env python3
"""Measure a complete original restaurant minigame with optional real mouse play."""
import os
import bisect,concurrent.futures,json,pathlib,sys,time,urllib.request,subprocess
kind,prefix=sys.argv[1:3];titles={'cleanup':'Dish Washer','rats':'Rats','sharpening':'Sharpen','asleep':'Asleep','pratfall':'Newsboy Nosedive'};assert kind in titles
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url'];active='--active'in sys.argv;warmup=0 if active else 60
frames=next((int(x.split('=',1)[1])for x in sys.argv if x.startswith('--frames=')),4200)
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as r:return json.load(r).get('result')
screen=req('screen',path=prefix+'-start.png');assert screen['state']['error']is None,screen
if not active:assert any(titles[kind].lower() in x['text'].lower()for x in screen['text']),screen
req('eval',source="(()=>{const o=orderup,g=o.runtime.graphics,a=window.presentationAudit={times:[],frames:[],active:true,seen:0,count:0,originalPresent:g.present};g.present=function(){a.originalPresent.call(this);if(!o.runtime.inCall)a.count++;else a.nativeSwaps=(a.nativeSwaps||0)+1};function capture(t){if(!a.active)return;if(a.count!==a.seen){a.times.push(t);a.frames.push(a.count);a.seen=a.count}a.request=requestAnimationFrame(capture)}a.request=requestAnimationFrame(capture);return true})()")
scheduler_source="(()=>{const r=orderup.runtime;return{handoffs:r.workerHandoffs||0,usleep:r.calls.get('usleep')||0,semaphore_posts:r.calls.get('sem_post')||0,prepared:r.codePreparation||null}})()"
scheduler_before=req('eval',source=scheduler_source)
with concurrent.futures.ThreadPoolExecutor()as pool:
 future=pool.submit(req,'measure',frames=frames,warmup=warmup,path=prefix+'.json');time.sleep(.5)
 if not active:req('label',text='OK',options={'timeout':10000,'after':100})
 if '--mouse'in sys.argv:subprocess.run(['python3','tools/perf_'+kind+'_mouse.py',prefix+'-mouse.json'],check=True)
 result=future.result()
scheduler_after=req('eval',source=scheduler_source);pathlib.Path(prefix+'-scheduler.json').write_text(json.dumps({'before':scheduler_before,'after':scheduler_after},indent=2))
audit=req('eval',source="(()=>{const a=presentationAudit;a.active=false;cancelAnimationFrame(a.request);orderup.runtime.graphics.present=a.originalPresent;return{native_swap_calls:a.nativeSwaps||0,times:a.times,frames:a.frames}})()")
t=audit['times'][warmup:];audit['summary']={'minimum_frames_in_sliding_second':min(i-bisect.bisect_left(t,x-1000)for i,x in enumerate(t)if x-t[0]>=1000),'skipped_completed_frames':sum(max(0,b-a-1)for a,b in zip(audit['frames'],audit['frames'][1:]))};pathlib.Path(prefix+'-presentation.json').write_text(json.dumps(audit));end=req('screen',path=prefix+'-result.png')
print(json.dumps({k:result[k]for k in ['fps','minimum_frames_in_sliding_second','work','audio_gaps','graphics_errors','error']},indent=2),flush=True);print({'calibration_started_active':active,'presentation':audit['summary'],'result_text':[x['text']for x in end['text']]},flush=True)
