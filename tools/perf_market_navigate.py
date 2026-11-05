#!/usr/bin/env python3
"""Reach original market minigame instructions through real mouse navigation."""
import os
import json,pathlib,urllib.request,urllib.error,sys,time
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as r:return json.load(r).get('result')
deadline=time.time()+90
while True:
 base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
 try:
  status=req('status')
  if status['error']:raise RuntimeError(status['error'])
  break
 except (OSError,urllib.error.URLError):
  if time.time()>deadline:raise
  time.sleep(.5)
if '--map-ready' in sys.argv:req('resume')
else:req('continue');req('wait-scene')
for attempt in range(4):
 intro=req('screen',path=prefix+'-map-intro.png')
 if any('Food Truck Wars have begun' in x['text']for x in intro['text']):req('label',text='OK',options={'after':1500})
 else:break
req('eval',source="(async()=>{await new Promise(r=>setTimeout(r,1500));return{error:orderup.error}})()")
req('tap',x=300,y=430,wait=2500);req('tap',x=400,y=220,wait=2500)
preview=req('screen',path=prefix+'-preview.png');assert any('Farmers' in x['text'] for x in preview['text']),preview
req('tap',x=480,y=420,wait=20000);req('wait-scene')
# A scene transition can carry the last press into a shop. Recover through
# original Back controls before entering the intended stall.
for attempt in range(4):
 current=req('screen',path=prefix+'-market-current.png');assert current['state']['error'] is None,current['state']
 back=next((x for x in current['text']if x['text']=='Back'),None)
 if back and abs(back['y']-.80625)<.03:break
 if back and back['y']>.87:req('tap',x=480,y=574,wait=3500)
 req('tap',x=700,y=430,wait=5000)
else:raise RuntimeError('Miyoda shop not reached through original mouse navigation')
shop=req('screen',path=prefix+'-shop.png');assert any(x['text']=='Back' and abs(x['y']-.80625)<.03 for x in shop['text']),shop
kind='Knife Skills'if '--knife'in sys.argv else'Pepper Chop'
req('tap',x=770 if '--knife'in sys.argv else 190,y=320,wait=2000);req('pause');help=req('screen',path=prefix+'-help.png');assert any(kind in x['text']for x in help['text']),help
print({'ready':kind+' instructions','frames':help['state']['frames']},flush=True)
