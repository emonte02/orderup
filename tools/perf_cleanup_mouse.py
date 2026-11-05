#!/usr/bin/env python3
"""Play through the isolated browser's continuous real mouse helper."""
import os
import json,pathlib,sys,urllib.request
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps({'action':'minigame','kind':'cleanup'}).encode(),headers={'Content-Type':'application/json'}),timeout=120)as response:result=json.load(response)['result']
pathlib.Path(sys.argv[1]).write_text(json.dumps(result,indent=2));print({'cleaned':result['last']['cleaned'],'phase':result['last']['phase'],'strokes':len(result['strokes'])},flush=True)
