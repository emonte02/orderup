#!/usr/bin/env python3
"""Prepare the actual mobile fire-event instructions in an isolated save."""
import os
import json,pathlib,urllib.request,subprocess,sys,time
prefix=sys.argv[1]
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
    with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as response:
        return json.load(response).get('result')
req('reload',fixture='analysis/assistant-earned-fixture.json')
subprocess.run(['python3','tools/perf_restaurant_navigate.py',prefix],check=True)
source="""(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();r.resumeClock();try{const manager=r.u32(r.elf.address('_ZN10Restaurant9g_ManagerE')),instance=await r.call('_ZN10Restaurant7Manager20GetCurrentRestaurantEv',[manager]),entry=r.u32(r.u32(instance)+0x2c),started=await r.call(entry,[instance,0x13383e35]);if(!started)throw Error('Original mobile fire event refused');return{instance,entry,started}}finally{r.pauseClock()}})()"""
req('eval',source=source)
req('eval',source="(async()=>{await orderup.controller.resume();await new Promise(r=>setTimeout(r,2000));await orderup.controller.pause();return{error:orderup.error}})()")
alert=req('screen',path=prefix+'-alert.png')
assert any('Kitchen Fire!' in x['text']for x in alert['text']),alert
req('resume');req('label',text='OK',options={'timeout':10000,'after':1200});req('pause')
help=req('screen',path=prefix+'-directions.png')
assert any('Touch to use' in x['text']for x in help['text']),help
print({'ready':'Original fire directions','frames':help['state']['frames']},flush=True)
