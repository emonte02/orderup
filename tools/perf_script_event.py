#!/usr/bin/env python3
"""Open the original mobile restaurant-event script in an isolated kitchen."""
import os
import json,pathlib,sys,urllib.request,urllib.error
kind=sys.argv[1];prefix=sys.argv[2]
functions={'cleanup':'EnterCleanupMinigame','sharpening':'EnterKnifeSharpeningMinigame','rats':'EnterRatsInTheKitchenMinigame','asleep':'EnterAOTJMinigame'}
assert kind in functions
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 try:
  with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as response:return json.load(response).get('result')
 except urllib.error.HTTPError as error:
  print(error.read().decode(),flush=True);raise SystemExit(1)
source='''(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();r.resumeClock();await r.call('Java_com_svsgames_orderup_OrderUpJNILib_resume',[r.jniEnv,0]);const output=r.malloc(8);r.u32(output,0);r.u32(output+4,0);try{const manager=r.u32(r.elf.address('_ZN6Script9g_ManagerE'));if(!manager)throw Error('Original script manager unavailable');if(__INSPECTOR__){const customers=r.u32(r.elf.address('_ZN8Customer9g_ManagerE')),kind=r.malloc(4);r.u32(kind,0xbca405e6);try{const party=await r.call('_ZN8Customer7Manager11CreatePartyEP10checksum32ib',[customers,kind,1,0]);const created=await r.call('_ZN8Customer7Manager8GetPartyEi',[customers,party]);if(!created)throw Error('Original inspector party was not created');}finally{r.free(kind);}}if(__ASLEEP__){const child=r.u32(r.elf.address('_ZN19AsleepOnJobMinigame9g_ManagerE'));await r.call('_ZN19AsleepOnJobMinigame7Manager21SetAssistantChefIndexEi',[child,0]);}const module=r.cstring('level_ui'),fn=r.cstring(__FUNCTION__);(r.qaEventStrings??=[]).push(module,fn);await r.call('_ZN6Script7Manager13ExecuteScriptEPKcS2_',[output,manager,module,fn]);const returned=[r.u32(output),r.u32(output+4)];await r.call('_ZN3CSL7Variant7MakeNilEv',[output]);return{function:__FUNCTION__,returned,error:o.error};}finally{if(r.main.state==='idle')r.free(output);r.pauseClock();}})()'''.replace('__INSPECTOR__','true'if kind in ['cleanup','rats']else'false').replace('__ASLEEP__','true'if kind=='asleep'else'false').replace('__FUNCTION__',json.dumps(functions[kind]))
print(req('eval',source=source),flush=True)
req('eval',source="(async()=>{await orderup.controller.resume();await new Promise(resolve=>setTimeout(resolve,1800));await orderup.controller.pause();return{error:orderup.error}})()")
screen=req('screen',path=prefix+'-event.png');assert screen['state']['error'] is None,screen['state'];print({'text':[x['text']for x in screen['text']],'state':screen['state']},flush=True)
