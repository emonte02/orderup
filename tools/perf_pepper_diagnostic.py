#!/usr/bin/env python3
"""Identify native waits, GC and host costs during real minigame play."""
import os
import json,pathlib,urllib.request,time,sys
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as r:return json.load(r).get('result')
screen=req('screen',path=prefix+'-help.png');assert any('Pepper Chop' in x['text']for x in screen['text']),screen
req('eval',source="""(()=>{const o=orderup,r=o.runtime;window.roundCosts={calls:[],sleeps:[],originalCall:r.call,originalSleep:r.functions.get('usleep')};const d=roundCosts;r.nativeHot.gcTimings(true);r.call=async function(name,...args){const begin=performance.now(),result=await d.originalCall.call(this,name,...args),ms=performance.now()-begin;if(ms>45)d.calls.push({frame:o.frames,name,ms,gc:r.nativeHot.gcTimings()});return result};r.function('usleep',()=>{if(r.arg(0)>=10000)d.sleeps.push({frame:o.frames,thread:r.active.id,delay:r.arg(0),lr:r.reg(14),entry:r.currentEntry});return d.originalSleep()});return true})()""")
req('diagnostic-start');req('resume');req('label',text='OK',options={'timeout':10000,'after':250})
played=req('minigame',kind='pepper',options={'timeout':35000});pathlib.Path(prefix+'-mouse.json').write_text(json.dumps(played,indent=2));time.sleep(4)
print(req('diagnostic-stop',path=prefix+'-frames.json'))
value=req('eval',source="""(()=>{const r=orderup.runtime,d=roundCosts;r.call=d.originalCall;r.function('usleep',d.originalSleep);return{calls:d.calls,sleeps:d.sleeps}})()""");pathlib.Path(prefix+'-calls.json').write_text(json.dumps(value,indent=2));print({'mouse_score':played['highest_score'],'calls_over45ms':len(value['calls']),'long_sleeps':len(value['sleeps'])},flush=True)
