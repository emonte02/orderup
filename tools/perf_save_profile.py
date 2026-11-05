#!/usr/bin/env python3
"""Time the original autosave in the isolated QA browser, separate from storage."""
import os
import json,pathlib,sys,urllib.request
prefix=sys.argv[1];base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as response:return json.load(response).get('result')
source='''(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();r.resumeClock();const rows=[];try{for(let i=0;i<3;i++){const before=r.nativeHot.report(),start=performance.now();await r.call('_ZN6Script9auto_saveEi',[0],{timeoutMs:600000});const native_ms=performance.now()-start,stored=performance.now();await o.flushSaves();const after=r.nativeHot.report();rows.push({native_ms,storage_ms:performance.now()-stored,ports:Object.fromEntries(Object.entries(after).filter(([k,v])=>typeof v==='number').map(([k,v])=>[k,v-before[k]]))});}return{original_autosave_entry:true,controller_paused:true,rows,error:o.error,files:[...r.files].filter(([p,f])=>f.writable).map(([path,f])=>({path,size:f.data.length}))};}finally{r.pauseClock();}})()'''
result=req('eval',source=source);pathlib.Path(prefix+'-baseline.json').write_text(json.dumps(result,indent=2));print({'baseline_native_ms':[r['native_ms']for r in result['rows']],'storage_ms':[r['storage_ms']for r in result['rows']]},flush=True)
if '--profile'in sys.argv:
 req('profile-start')
 instrumented='''(async()=>{const o=orderup,r=o.runtime;await o.controller.pause();r.resumeClock();const counts={},hooks=[],names=['_ZN6Crypto6SVSEnc18create_current_keyEv','_ZN3CVM6Thread9interpretEiy'];const invalidate=()=>r.uc.ccall('uc_ctl','number',['pointer','number','pointer'],[r.uc.getValue(r.engine.handle_ptr,'*'),0x4000000a,0]);try{for(const name of names){counts[name]=0;const p=r.elf.address(name);hooks.push(r.engine.hook_add(r.uc.HOOK_CODE,()=>{counts[name]++;},null,p,p));}invalidate();const start=performance.now();await r.call('_ZN6Script9auto_saveEi',[0],{timeoutMs:600000});const native_ms=performance.now()-start;await o.flushSaves();return{counts,native_ms,diagnostic_not_fps:true,ports:r.nativeHot.report(),error:o.error};}finally{for(const hook of hooks)r.engine.hook_del(hook);invalidate();r.pauseClock();}})()'''
 try:detail=req('eval',source=instrumented)
 finally:req('profile-stop',path=prefix+'.cpuprofile')
 pathlib.Path(prefix+'-diagnostic.json').write_text(json.dumps(detail,indent=2));print(detail['counts'],flush=True)
