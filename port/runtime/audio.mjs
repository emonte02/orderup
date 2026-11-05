import {readStoredFiles} from './zip.mjs';
/** Original stored Ogg streams plus the original 22,050 Hz mono PCM mixer. */
export class GameAudio {
 constructor(patch,context){this.context=context;this.files=readStoredFiles(patch);this.players=new Set();this.decoded=0;this.errors=[];this.pending=[];this.nextPCM=0;this.mixedBuffers=0;this.history=[];
 }
 create(r,filename,stream){const name=filename.slice(filename.lastIndexOf('|')+1).toLowerCase()+'.ogg',bytes=this.files.get(name);if(!bytes){r.events.push({type:'audio-missing',name});return 0;}
  this.history.push(name);if(this.history.length>256)this.history.shift();
  const player={name,stream,playing:false,paused:0,volume:1,loop:false,source:null,buffer:null,handle:0};player.handle=r.jobject({kind:'media-player',player});this.players.add(player);
  player.ready=this.context.decodeAudioData(bytes.slice().buffer).then(buffer=>{this.decoded++;if(player.disposed)return;player.buffer=buffer;if(player.playing)this.play(r,player);}).catch(error=>{this.errors.push({name,error:String(error)});player.playing=false;});return player.handle;
 }
 play(r,p){if(!p.buffer||p.source)return;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=p.buffer;source.loop=p.loop;gain.gain.value=p.volume;source.connect(gain).connect(this.context.destination);p.source=source;p.gain=gain;p.started=this.context.currentTime;p.playing=true;source.onended=()=>{if(p.source!==source)return;p.source=null;source.disconnect();gain.disconnect();if(p.playing&&!p.loop){p.playing=false;p.paused=0;this.pending.push({handle:p.handle,stream:p.stream});}};source.start(0,p.paused%p.buffer.duration);}
 stop(p,pause=false){if(pause&&p.source)p.paused+=this.context.currentTime-p.started;else if(!pause)p.paused=0;p.playing=false;const source=p.source;p.source=null;if(source){source.onended=null;source.stop();source.disconnect();p.gain?.disconnect();}}
 call(r,name,args){
  if(name==='getMediaPlayer')return this.create(r,r.javaObjects.get(args[0])?.value||'',args[1]);
  if(name==='pauseAll'||name==='resumeAll'){for(const p of this.players){if(name==='pauseAll'){p.resume=p.playing;this.stop(p,true);}else if(p.resume){p.playing=true;this.play(r,p);}}return 0;}
  const p=r.javaObjects.get(args[0])?.player;if(!p)throw Error('Invalid original media player for '+name);
  if(name==='start'){p.loop=(args[1]|0)<0;p.playing=true;this.play(r,p);return 0;}
  if(name==='setVolume'){p.volume=args[1];if(p.gain)p.gain.gain.value=p.volume;return 0;}
  if(name==='isPlaying')return Number(p.playing);
  if(name==='stop'||name==='pause'||name==='reset'){this.stop(p,name==='pause');if(name==='reset'){this.players.delete(p);p.disposed=true;p.buffer=null;this.pending=this.pending.filter(x=>x.handle!==p.handle);}return 0;}
  if(name==='prepare')return 0;return r.unsupported('Audio method '+name);
 }
 async pump(r){
  while(this.pending.length){const p=this.pending.shift(),s=p.stream||{low:0,high:0};await r.call('Java_com_svsgames_sys_XSysAudioStreamer_doneHandler',[r.jniEnv,0,p.handle,0,s.low,s.high]);}
  const byteCount=2240;if(!this.pcm){const address=r.malloc(byteCount);this.pcm=r.jobject({kind:'bytes',length:byteCount,address});}
  this.nextPCM=Math.max(this.nextPCM,this.context.currentTime+0.02);let chunks=0;
  // Keep enough original PCM queued for measured scene-completion work.
  // This changes playback headroom, never the mixer rate or game clock.
  while(this.nextPCM<this.context.currentTime+0.20&&chunks++<4){
   await r.call('Java_com_svsgames_orderup_OrderUpJNILib_mix',[r.jniEnv,0,this.pcm,byteCount]);const bytes=r.read(r.javaObjects.get(this.pcm).address,byteCount),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),buffer=this.context.createBuffer(1,byteCount/2,22050),out=buffer.getChannelData(0);for(let i=0;i<out.length;i++)out[i]=v.getInt16(i*2,true)/32768;
   const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);source.onended=()=>source.disconnect();source.start(this.nextPCM);this.nextPCM+=buffer.duration;this.mixedBuffers++;
  }
 }
 report(){return {original_streams:this.files.size,decoded_streams:this.decoded,players:this.players.size,mixed_pcm_buffers:this.mixedBuffers,decode_errors:this.errors,stream_history:this.history};}
}
