#!/usr/bin/env python3
"""Measure the original tournament demonstration and player handoff."""
import bisect,concurrent.futures,json,pathlib,sys,time,urllib.request,urllib.error
prefix=sys.argv[1];base=json.loads(pathlib.Path('analysis/performance-control.json').read_text())['control_url']
def req(action,**kw):
 with urllib.request.urlopen(urllib.request.Request(base,data=json.dumps(dict(action=action,**kw)).encode(),headers={'Content-Type':'application/json'}),timeout=650)as response:return json.load(response).get('result')
req('eval',source="(async()=>{const o=orderup,r=o.runtime;o.qaTournament=await r.call('_ZN3Mdl7Manager9GetModuleE10checksum32',[r.u32(r.elf.address('_ZN3Mdl9g_ManagerE')),0x425ac03c]);o.qaLoadEvents=[];o.qaOriginalIndicator=r.onActivityIndicator;r.onActivityIndicator=show=>{o.qaLoadEvents.push({show,frame:o.frames,time:performance.now()});o.qaOriginalIndicator?.(show);};return{module:o.qaTournament,initial_loading:o.activityLoading}})()")
req('eval',source="(()=>{const o=orderup,g=o.runtime.graphics,a=window.presentationAudit={times:[],frames:[],active:true,seen:0,count:0,originalPresent:g.present};g.present=function(){a.originalPresent.call(this);if(!o.runtime.inCall)a.count++;else a.nativeSwaps=(a.nativeSwaps||0)+1};function capture(t){if(!a.active)return;if(a.count!==a.seen){a.times.push(t);a.frames.push(a.count);a.seen=a.count}a.request=requestAnimationFrame(capture)}a.request=requestAnimationFrame(capture);return true})()")
phases=[];dialogs=0
with concurrent.futures.ThreadPoolExecutor()as pool:
 future=pool.submit(req,'measure',frames=5400,warmup=60,path=prefix+'.json');time.sleep(.5)
 for attempt in range(3):
  try:req('label',text='OK',options={'timeout':20000,'after':1000});dialogs+=1
  except urllib.error.HTTPError as e:
   body=e.read().decode()
   if 'Rendered game button not found'not in body:raise RuntimeError(body)
   break
 while not future.done():
  state=req('eval',source="(()=>{const o=orderup,r=o.runtime,m=o.qaTournament;return{frames:o.frames,dish:r.u32(m+0x84),tier:r.u32(m+0x88),recipe_words:[0x20,0x24,0x28,0x2c].map(x=>r.u32(m+x)),opponent_seconds:[0x54,0x58,0x5c].map(x=>r.f32(m+x)),player_seconds:[0x60,0x64,0x68].map(x=>r.f32(m+x)),error:o.error}})()")
  phases.append(state);time.sleep(.5)
 result=future.result()
audit=req('eval',source="(()=>{const a=presentationAudit;a.active=false;cancelAnimationFrame(a.request);orderup.runtime.graphics.present=a.originalPresent;return{native_swap_calls:a.nativeSwaps||0,times:a.times,frames:a.frames,presentations:a.count}})()")
t=audit['times'][60:];audit['summary']={'minimum_frames_in_sliding_second':min(i-bisect.bisect_left(t,x-1000)for i,x in enumerate(t)if x-t[0]>=1000),'skipped_completed_frames':sum(max(0,b-a-1)for a,b in zip(audit['frames'],audit['frames'][1:])),'presentations':audit['presentations'],'native_updates':result['work']['samples']+60,'no_extra_game_updates':audit['presentations']==result['work']['samples']+60};pathlib.Path(prefix+'-presentation.json').write_text(json.dumps(audit))
end=req('screen',path=prefix+'-result.png');text=[x['text']for x in end['text']];handoff=any('OPPONENT TIME' in x.upper()for x in text)and any('TIME:'in x.upper().replace(' ','')and'OPPONENT'not in x.upper()for x in text)
load_events=req('eval',source="(()=>{const o=orderup;o.runtime.onActivityIndicator=o.qaOriginalIndicator;return o.qaLoadEvents})()")
pathlib.Path(prefix+'-phases.json').write_text(json.dumps({'loading_events':load_events,'native_state_reads_only':True,'mouse_dialogs':dialogs,'phases':phases,'player_handoff_visible':handoff,'result_text':text},indent=2));print(json.dumps({k:result[k]for k in ['fps','minimum_frames_in_sliding_second','work','audio_gaps','graphics_errors','error']},indent=2),flush=True);print({'presentation':audit['summary'],'dialogs':dialogs,'player_handoff_visible':handoff,'result_text':text},flush=True)
if not handoff:raise RuntimeError('Original player handoff not visible at the end of the measurement')
