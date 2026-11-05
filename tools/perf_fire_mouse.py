#!/usr/bin/env python3
"""Extinguish the original event using only real mouse presses and pumps."""
import os
import json,pathlib,sys,time,urllib.request
base=json.loads(pathlib.Path(os.environ.get('OU_CONTROL_RECORD','analysis/performance-control.json')).read_text())['control_url']
def req(action,**kw):
    with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650) as response:return json.load(response).get('result')
def state():
    return req('eval',source="""(()=>{const r=orderup.runtime,m=r.u32(r.elf.address('_ZN19KitchenFireMinigame9g_ManagerE')),head=m+0x7c,nodes=[],seen=new Set();let p=r.u32(head);while(p&&p!==head&&!seen.has(p)&&seen.size<80){seen.add(p);const n=r.u32(p+4);nodes.push({kitchen:r.u32(n+0x40),stage:r.u32(n+0x10),age:r.f32(n+0x48),active:!!r.u8(n+0x54)});p=r.u32(p)}const canvas=document.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,220,960,250).data,columns=new Uint32Array(960);for(let y=0;y<250;y+=2)for(let x=156;x<950;x+=2){const i=(y*960+x)*4;if(pixels[i]>200&&pixels[i+1]>115&&pixels[i+2]<90)columns[x]++}let best=0,aim=480;for(let x=180;x<925;x+=2){let n=0;for(let j=x-28;j<=x+28;j+=2)n+=columns[j];if(n>best){best=n;aim=x}}return{phase:r.u32(m+0x20),pressure:r.f32(m+0xc8),success:!!r.u8(m+0x102),nodes,aim:{x:aim,y:380,fire_pixels:best},error:orderup.error}})()""")
first=state();began=time.time();attempts=[]
while time.time()-began<45:
    current=state();assert current['error'] is None,current
    if current['phase']>=4:break
    active=sorted([n for n in current['nodes'] if n['active']],key=lambda n:n['age'],reverse=True)
    if current['phase']<2 or not active:time.sleep(.05);continue
    if current['pressure']<25:
        for _ in range(10):req('tap',x=130,y=350,wait=30)
    target=active[0];x=current['aim']['x'];target=dict(target,visible_aim=current['aim'])
    req('drag',points=[x,380,x+3,377],ms=1600);attempts.append({'target':target,'after':state()})
last=state();result={'mouse_only_input':True,'native_state_reads_only':True,'first':first,'attempts':attempts,'last':last,'elapsed_ms':round((time.time()-began)*1000)}
pathlib.Path(sys.argv[1]).write_text(json.dumps(result,indent=2));print({'attempts':len(attempts),'success':last['success'],'phase':last['phase']},flush=True)
