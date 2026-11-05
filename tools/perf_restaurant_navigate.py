#!/usr/bin/env python3
"""Reach the actual restaurant kitchen from a freshly loaded earned save."""
import os
import json,pathlib,urllib.request,sys
prefix=sys.argv[1]
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
    with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as response:
        return json.load(response).get('result')
req('continue')
req('wait-scene')
req('tap',x=305,y=235,wait=700)
req('tap',x=300,y=315,wait=700)
ready=req('wait-kitchen')
assert ready['oven_hud_visible'],ready
req('pause')
screen=req('screen',path=prefix+'-kitchen.png')
assert screen['state']['error'] is None,screen['state']
print({'ready':'Original kitchen','frames':screen['state']['frames']},flush=True)
