#!/usr/bin/env python3
"""Prepare original mobile event instructions in the isolated test browser."""
import os
import json,pathlib,subprocess,sys,time,urllib.request,urllib.error
kind,prefix=sys.argv[1:3]
def req(action,**kw):
 base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as r:return json.load(r).get('result')
deadline=time.time()+90
while True:
 try:
  if req('status')['error'] and '--fresh' not in sys.argv:raise RuntimeError('Game failed')
  break
 except (OSError,urllib.error.URLError):
  if time.time()>deadline:raise
  time.sleep(.5)
if '--fresh' in sys.argv:req('reload',fixture='analysis/assistant-earned-fixture.json')
subprocess.run(['python3','tools/perf_restaurant_navigate.py',prefix],check=True)
subprocess.run(['python3','tools/perf_script_event.py',kind,prefix],check=True)
req('resume');req('label',text='OK',options={'after':1200});req('pause');screen=req('screen',path=prefix+'-directions.png');print({'directions':[x['text']for x in screen['text']],'frames':screen['state']['frames']},flush=True)
