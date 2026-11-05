#!/usr/bin/env python3
"""Measure the original active kitchen fire while using real mouse sprays."""
import os
import json,pathlib,urllib.request,time,concurrent.futures,bisect,sys
prefix=sys.argv[1]
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
    with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as response:
        return json.load(response).get('result')
def state():
    return req('eval',source="""(()=>{const r=orderup.runtime,m=r.u32(r.elf.address('_ZN19KitchenFireMinigame9g_ManagerE')),head=m+0x7c,nodes=[],seen=new Set();let p=r.u32(head);while(p&&p!==head&&!seen.has(p)&&seen.size<80){seen.add(p);nodes.push({kitchen:r.u32(p+0x40),stage:r.u32(p+0x10),age:r.f32(p+0x48)});p=r.u32(p)}return{phase:r.u32(m+0x20),pressure:r.f32(m+0xc8),nodes,error:orderup.error}})()""")
first=state();assert first['phase'] in [1,2,3],first
req('eval',source="""(()=>{const o=orderup,a=window.presentationAudit={times:[],frames:[],active:true,seen:o.frames};function capture(t){if(!a.active)return;if(o.frames!==a.seen){a.times.push(t);a.frames.push(o.frames);a.seen=o.frames}a.request=requestAnimationFrame(capture)}a.request=requestAnimationFrame(capture);return true})()""")
attempts=[]
with concurrent.futures.ThreadPoolExecutor() as pool:
    measure=pool.submit(req,'measure',frames=2400,path=prefix+'.json')
    time.sleep(.5)
    began=time.time()
    while time.time()-began<45:
        current=state()
        assert current['error'] is None,current
        if current['phase']>=4:break
        for x,y in [(480,350),(215,365),(785,365)]:
            current=state()
            if current['phase']>=4:break
            if current['pressure']<.3:
                for _ in range(4):req('tap',x=130,y=350,wait=80)
            req('drag',points=[x,y,x+4,y-4],ms=1800)
            attempts.append({'aim':[x,y],'after':state()})
    played={'mouse_only_input':True,'native_state_reads_only':True,'first':first,'attempts':attempts,'last':state(),'elapsed_ms':round((time.time()-began)*1000)}
    pathlib.Path(prefix+'-mouse.json').write_text(json.dumps(played,indent=2))
    result=measure.result()
    audit=req('eval',source="(()=>{const a=presentationAudit;a.active=false;cancelAnimationFrame(a.request);return{times:a.times,frames:a.frames}})()")
    t=audit['times'][60:]
    audit['summary']={'minimum_frames_in_sliding_second':min(i-bisect.bisect_left(t,x-1000)for i,x in enumerate(t)if x-t[0]>=1000),'skipped_completed_frames':sum(max(0,b-a-1)for a,b in zip(audit['frames'],audit['frames'][1:]))}
    pathlib.Path(prefix+'-presentation.json').write_text(json.dumps(audit))
    req('screen',path=prefix+'-result.png')
    print(json.dumps({k:result[k]for k in ['fps','minimum_frames_in_sliding_second','work','audio_gaps','graphics_errors','error']},indent=2),flush=True)
    print({'mouse_attempts':len(attempts),'last_phase':played['last']['phase'],'presentation':audit['summary']},flush=True)
