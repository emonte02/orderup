#!/usr/bin/env python3
"""Send a bounded command to the isolated loopback performance browser."""
import os
import json,sys,urllib.request,urllib.parse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
record=json.loads((root/os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text());url=record['control_url'];assert urllib.parse.urlparse(url).hostname=='127.0.0.1';assert urllib.parse.urlparse(record['game_url']).port!=8147
args=sys.argv[1:];action=args[0] if args else 'status';command={'action':action}
if action=='eval':command['source']=sys.stdin.read()
elif action=='screen' and len(args)>1:command['path']=args[1]
elif action=='label':
 command['text']=args[1]
 if len(args)>2:command['options']=json.loads(args[2])
elif action=='tap':command.update(x=float(args[1]),y=float(args[2]),wait=int(args[3]) if len(args)>3 else 400)
elif action=='drag':command.update(points=[float(x) for x in args[1:5]],ms=int(args[5]) if len(args)>5 else 300)
elif action=='measure':command.update(frames=int(args[1]),path=args[2] if len(args)>2 else None)
elif action=='minigame':command.update(kind=args[1],options=json.loads(args[2]) if len(args)>2 else {})
elif action=='cook':command.update(method=args[1],args=json.loads(args[2]) if len(args)>2 else [])
elif action in ['snapshot','fixture','profile-stop','diagnostic-stop']:command['path']=args[1]
elif action=='reload':command['fixture']=args[1]
request=urllib.request.Request(url,data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
try:
 with urllib.request.urlopen(request,timeout=660) as response:data=json.load(response)
except urllib.error.HTTPError as e:
 print(e.read().decode());sys.exit(1)
print(json.dumps(data,indent=2));sys.exit(0 if data.get('ok') else 1)
