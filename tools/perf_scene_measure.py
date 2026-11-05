#!/usr/bin/env python3
"""Measure completed and displayed frames in the current original scene."""
import os
import bisect,concurrent.futures,json,pathlib,sys,time,urllib.request
prefix=sys.argv[1];frames=next((int(x.split('=',1)[1])for x in sys.argv if x.startswith('--frames=')),2400);warmup=60
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as r:return json.load(r)['result']
req('screen',path=prefix+'-start.png');req('eval',source="(()=>{const o=orderup,g=o.runtime.graphics,a=window.presentationAudit={times:[],frames:[],active:true,seen:0,count:0,originalPresent:g.present};g.present=function(){a.originalPresent.call(this);if(!o.runtime.inCall)a.count++;else a.nativeSwaps=(a.nativeSwaps||0)+1};function capture(t){if(!a.active)return;if(a.count!==a.seen){a.times.push(t);a.frames.push(a.count);a.seen=a.count}a.request=requestAnimationFrame(capture)}a.request=requestAnimationFrame(capture);return true})()")
result=req('measure',frames=frames,warmup=warmup,path=prefix+'.json')
audit=req('eval',source="(()=>{const a=presentationAudit;a.active=false;cancelAnimationFrame(a.request);orderup.runtime.graphics.present=a.originalPresent;return{native_swap_calls:a.nativeSwaps||0,times:a.times,frames:a.frames}})()")
t=audit['times'][warmup:];audit['summary']={'minimum_frames_in_sliding_second':min(i-bisect.bisect_left(t,x-1000)for i,x in enumerate(t)if x-t[0]>=1000),'skipped_completed_frames':sum(max(0,b-a-1)for a,b in zip(audit['frames'],audit['frames'][1:]))};pathlib.Path(prefix+'-presentation.json').write_text(json.dumps(audit));end=req('screen',path=prefix+'-result.png');print(json.dumps({k:result[k]for k in ['fps','minimum_frames_in_sliding_second','work','audio_gaps','graphics_errors','error']},indent=2));print({'presentation':audit['summary'],'text':[x['text']for x in end['text']]},flush=True)
