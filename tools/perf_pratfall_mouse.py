#!/usr/bin/env python3
import json,os,pathlib,urllib.request,sys
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url'];request=urllib.request.Request(base,data=json.dumps({'action':'minigame','kind':'pratfall'}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=180)as response:result=json.load(response)['result']
pathlib.Path(sys.argv[1]).write_text(json.dumps(result,indent=2));print({'coins':result['last']['coins'],'phase':result['last']['phase'],'taps':len(result['attempts'])},flush=True)
