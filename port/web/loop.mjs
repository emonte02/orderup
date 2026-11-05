import {createTaskQueue} from './runtime/threads.mjs';
import {floatBits} from './runtime/memory.mjs';
/** Serialize original guest entry points and present only completed frames. */
export function startFrameLoop(state,runtime,{audio=runtime.audio,flushSaves=async()=>{},onFailure=error=>{state.state='failed';state.error=String(error);console.error(error);}}={}){
 const tasks=createTaskQueue();
 let nextFrame=performance.now(),timer=null,busy=false,waiters=[],paused=false,stopped=false,desiredPaused=false,transition=Promise.resolve();
 const cancelScheduled=()=>{if(timer?.task)tasks.cancel(timer.id);else clearTimeout(timer?.id);timer=null;};
 const schedule=()=>{if(!paused&&!stopped&&state.state==='running'){const delay=nextFrame-performance.now();timer=delay>0?{id:setTimeout(frame,delay)}:{task:true,id:tasks.schedule(frame)};}};
 const idle=()=>busy?new Promise(resolve=>waiters.push(resolve)):Promise.resolve();
 const touch=async args=>{const[id,action,x,y,special]=args;await runtime.call('Java_com_svsgames_orderup_OrderUpJNILib_touch',[runtime.jniEnv,0,id,action,floatBits(x),floatBits(y),Number(special)]);state.lastInput=args;};
 const frame=async()=>{
  timer=null;if(paused||stopped||state.state!=='running')return;busy=true;const then=performance.now();
  try{
   // A quick press and release must reach separate native updates.
   if(state.input.length)await touch(state.input.shift());
   await runtime.call('Java_com_svsgames_orderup_OrderUpJNILib_step',[runtime.jniEnv,0],{timeoutMs:600000});runtime.graphics?.present();
   if(audio)await audio.pump(runtime);await runtime.pumpHostCallbacks?.();await flushSaves();
   state.frames++;state.timings.push(performance.now()-then);if(state.timings.length>300)state.timings.shift();state.frameTimes??=[];state.frameTimes.push(performance.now());if(state.frameTimes.length>300)state.frameTimes.shift();
   nextFrame=Math.max(nextFrame+1000/60,performance.now());
  }catch(error){onFailure(error);}
  finally{busy=false;for(const resolve of waiters.splice(0))resolve();schedule();}
 };
 const requestPause=value=>{
  if(stopped||state.state==='failed')return transition;desiredPaused=value;
  if(value){paused=true;cancelScheduled();if(state.state==='running')state.state='pausing';}
  transition=transition.then(async()=>{
   await idle();if(stopped||state.state==='failed')return;
   if(desiredPaused){
    if(state.state==='paused')return;
    if(state.lastInput?.[1]===3)await touch([0,3,0,0,false]);else if(state.lastInput&&state.lastInput[1]!==1)await touch([0,1,state.lastInput[2],state.lastInput[3],false]);state.input=[];
    await runtime.call('Java_com_svsgames_orderup_OrderUpJNILib_pause',[runtime.jniEnv,0]);await flushSaves();runtime.pauseClock();
    if(audio)await audio.context.suspend();state.state='paused';
   }else{
    if(state.state==='running')return;
    runtime.resumeClock();if(audio)audio.context.resume().catch(()=>{});await runtime.call('Java_com_svsgames_orderup_OrderUpJNILib_resume',[runtime.jniEnv,0]);
    paused=false;state.state='running';nextFrame=performance.now();schedule();
   }
  }).catch(onFailure);return transition;
 };
 const controller={pause:()=>requestPause(true),resume:()=>requestPause(false),stop(){stopped=true;cancelScheduled();return idle().then(()=>tasks.close());}};
 schedule();return controller;
}
