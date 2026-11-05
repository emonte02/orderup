#!/usr/bin/env python3
"""Open Newsboy Nosedive through original visible mouse interactions."""
import os,json,pathlib,sys,time,urllib.request,urllib.error
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 try:
  with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as r:return json.load(r).get('result')
 except urllib.error.HTTPError as e:print(e.read().decode(),flush=True);raise
req('reload',fixture='analysis/mexican-front-ready-fixture.json');req('continue');req('wait-scene');req('pause')
req('eval',source="(async()=>{const r=orderup.runtime,crc=await r.call('_ZN3Mdl15RestaurantFront7GetNameEv'),manager=r.u32(r.elf.address('_ZN3Mdl9g_ManagerE'));orderup.qaPratfallFront=await r.call('_ZN3Mdl7Manager9GetModuleE10checksum32',[manager,crc]);return true})()")
req('resume');req('tap',x=928,y=146,wait=2500);req('label',text='Tap Screen to Continue',options={'timeout':15000,'after':1800});req('pause')
for attempt in range(4):
 state=req('minigame',kind='pratfall',options={'stateOnly':True})
 if state['active']:break
 rider=state['rider'];assert rider and rider['w']>0,state
 req('resume');req('tap',x=rider['x'],y=rider['y']-40,wait=6500);req('pause')
else:raise RuntimeError('Original rider mouse interaction was not accepted')
# The papers move with the original camera transition. Observe their actual
# positions instead of assuming a fixed pixel location or changing any flags.
for attempt in range(8):
 state=req('minigame',kind='pratfall',options={'stateOnly':True})
 if state['phase']==2:break
 assert state['active'],state
 paper=next((p for p in state['introPapers']if p.get('primary')and p['landed']and p['w']>0 and 20<p['x']<940 and 80<p['y']<600),None)
 req('resume')
 if paper:req('tap',x=paper['x'],y=paper['y']-10,wait=1800)
 else:req('eval',source="(async()=>{await new Promise(r=>setTimeout(r,1500));return true})()")
 req('pause')
else:raise RuntimeError('Original Newsboy Nosedive intro did not open')
req('resume')
for attempt in range(30):
 screen=req('screen',path=prefix+'-directions.png')
 if any('Newsboy Nosedive'in x['text']for x in screen['text']):break
 req('eval',source="(async()=>{await new Promise(r=>setTimeout(r,300));return true})()")
else:raise RuntimeError('Original instructions were not rendered')
req('pause')
print({'ready':'Original Newsboy Nosedive instructions','frames':screen['state']['frames']},flush=True)
