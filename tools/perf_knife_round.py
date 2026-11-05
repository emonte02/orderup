#!/usr/bin/env python3
"""Benchmark a full original Knife Skills round from its paused instruction dialog."""
import os
import json,pathlib,urllib.request,time,concurrent.futures,sys,bisect
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as r:return json.load(r)['result']
help=req('screen',path=prefix+'-verified-help.png');assert any('Knife Skills' in x['text'] for x in help['text']),help
req('eval',source="(()=>{const o=orderup,g=o.runtime.graphics,a=window.presentationAudit={times:[],frames:[],active:true,seen:0,count:0,originalPresent:g.present};g.present=function(){a.originalPresent.call(this);if(!o.runtime.inCall)a.count++;else a.nativeSwaps=(a.nativeSwaps||0)+1};function capture(t){if(!a.active)return;if(a.count!==a.seen){a.times.push(t);a.frames.push(a.count);a.seen=a.count}a.request=requestAnimationFrame(capture)}a.request=requestAnimationFrame(capture);return{frames:o.frames}})()")
with concurrent.futures.ThreadPoolExecutor() as pool:
 measurement=pool.submit(req,'measure',frames=4200,path=prefix+'.json');time.sleep(.5)
 req('label',text='OK',options={'timeout':10000,'after':250})
 played=req('minigame',kind='knife',options={'timeout':100000});pathlib.Path(prefix+'-mouse.json').write_text(json.dumps(played,indent=2))
 result=measurement.result();audit=req('eval',source="(()=>{const a=window.presentationAudit;a.active=false;cancelAnimationFrame(a.request);orderup.runtime.graphics.present=a.originalPresent;return{native_swap_calls:a.nativeSwaps||0,times:a.times,frames:a.frames}})()")
 t=audit['times'][60:];steps=[b-a for a,b in zip(audit['frames'],audit['frames'][1:])];audit['summary']={'minimum_frames_in_sliding_second':min(i-bisect.bisect_left(t,x-1000) for i,x in enumerate(t) if x-t[0]>=1000),'skipped_completed_frames':sum(max(0,x-1)for x in steps),'max_interval_ms':max(b-a for a,b in zip(t,t[1:]))}
 pathlib.Path(prefix+'-presentation.json').write_text(json.dumps(audit));req('screen',path=prefix+'-result.png')
 print(json.dumps({k:result[k]for k in ['frames_measured','fps','minimum_frames_in_sliding_second','work','audio_gaps','graphics_errors','error']},indent=2),flush=True);print(json.dumps({'mouse_score':played['maximum_chops'],'attempts':played['downward_strokes'],'presentation':audit['summary']}),flush=True)
