import {gamePaths,loadHostedGameFiles} from './downloads.mjs';
import {ArmRuntime} from './runtime/runtime.mjs';
import {openSaves} from './runtime/persistence.mjs';
import {GameAudio} from './runtime/audio.mjs';
import {GameGraphics} from './runtime/graphics.mjs';
import {startFrameLoop} from './loop.mjs';
import {bindMouse} from './mouse.mjs';
import {showCoinStore} from './store.mjs';
import {createTutorialSkipper} from './runtime/tutorial.mjs';
import {createTutorialControls} from './tutorial.mjs';
import {bindFullscreen} from './fullscreen.mjs';
import {createNativeFullscreen} from './runtime/fullscreen.mjs';
const button=document.querySelector('#start'),status=document.querySelector('#status'),canvas=document.querySelector('canvas');
const state=window.orderup={state:'loading',runtime:null,error:null,frames:0,timings:[],input:[],frameTimes:[],startRequested:false,startup:{started:performance.now(),phase:'files',files_loaded:0,bytes_loaded:0,bytes_total:0,phases:[]}};
let toastTimer,tutorialControls;
const say=text=>{status.textContent=text;};
const loadingPanel=document.querySelector('#loading-panel'),loadingTitle=document.querySelector('#loading-title'),loadingDetail=document.querySelector('#loading-detail'),loadingElapsed=document.querySelector('#loading-elapsed'),loadingProgress=document.querySelector('#loading-progress'),loadingAmount=document.querySelector('#loading-amount');let loadingTimer=null;
function loadingPhase(phase){state.startup.phase=phase;state.startup.phases.push({phase,elapsed_ms:performance.now()-state.startup.started});updateLoading();}
function updateLoading(){
 if(state.error)return;
 const startup=state.startup;
 if(state.frames>0){startup.ready_ms=performance.now()-(startup.play_requested??startup.started);startup.page_ready_ms=performance.now()-startup.started;loadingProgress.value=100;loadingAmount.textContent='100%';stopLoading();document.body.classList.add('playing');state.updateSound?.();say('Click and drag to play.');return;}
 const seconds=Math.floor((performance.now()-startup.started)/1000);loadingElapsed.textContent=seconds+' seconds elapsed';
 const percent=startup.phase==='files'?(startup.bytes_total?Math.floor(90*startup.bytes_loaded/startup.bytes_total):0):({engine:91,initializers:93,game:96,menu:99}[startup.phase]??90);
 loadingProgress.value=percent;loadingAmount.textContent=percent+'%';loadingPanel.dataset.stage=startup.phase==='files'?'files':startup.phase==='menu'?'ready':'preparing';
 if(startup.phase==='files'){
  const mb=bytes=>(bytes/1048576).toFixed(1),downloaded=startup.bytes_downloaded||0,cached=startup.bytes_cached||0;
  loadingTitle.textContent=downloaded?'Stocking the kitchen…':'Checking the pantry…';
  loadingDetail.textContent=downloaded&&cached?mb(downloaded)+' MB downloaded · '+mb(cached)+' MB from this device.':downloaded?mb(downloaded)+' of '+mb(startup.bytes_total)+' MB downloaded.':cached?mb(cached)+' of '+mb(startup.bytes_total)+' MB loaded from this device.':'The game will start automatically.';
  if(startup.cache_available===false&&downloaded)loadingDetail.textContent+=' Local caching is unavailable on this device.';
 }else{
  loadingTitle.textContent=startup.phase==='menu'?'Order up!':'Warming up the kitchen…';
  loadingDetail.textContent=document.hidden?'Return to this tab to finish loading.':'Starting the game automatically. Keep this tab open.';
 }
}
function stopLoading(){clearInterval(loadingTimer);loadingTimer=null;loadingPanel.hidden=true;}
function loadEmulator(){
 if(typeof globalThis.MUnicorn==='function')return Promise.resolve();
 return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./unicorn.js',import.meta.url).href;script.onload=()=>typeof globalThis.MUnicorn==='function'?resolve():reject(Error('Game engine did not load'));script.onerror=()=>reject(Error('Could not load game engine'));document.head.append(script);});
}
const paths=gamePaths;
function loadGameFiles(){
 return loadHostedGameFiles({onProgress:({loaded,total,files,downloaded,cached,cacheAvailable})=>{Object.assign(state.startup,{bytes_loaded:loaded,bytes_total:total,files_loaded:files,bytes_downloaded:downloaded,bytes_cached:cached,cache_available:cacheAvailable});updateLoading();}});
}
async function preload(){
 try{const [data,emulator]=await Promise.all([loadGameFiles(),loadEmulator().then(()=>globalThis.MUnicorn())]);state.startup.assets_ready=true;return{data,emulator};}
 catch(error){failed(error);return null;}
}
const fullscreenButton=document.querySelector('#fullscreen'),fullscreenLabel=document.querySelector('#fullscreen-label');
const fullscreen=state.fullscreen=bindFullscreen(canvas,fullscreenButton,fullscreenLabel,{onUnavailable:()=>{say('Full screen is unavailable in this browser. The game still fills the window.');status.classList.add('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>status.classList.remove('toast'),4000);}});

const activityIndicator=document.querySelector('#activity-indicator');
const notice=document.querySelector('#notice'),noticeTitle=document.querySelector('#notice-title'),noticeBody=document.querySelector('#notice-body');let resumeAfterNotice=false;
const uiData=fetch(new URL('./game/ui.json',import.meta.url)).then(r=>r.ok?r.json():{achievements:[]}).catch(()=>({achievements:[]}));
async function showNotice(detail){
 const data=await uiData;
 if(detail.kind==='achievement'){const item=data.achievements.find(x=>x.id===detail.id);say('Achievement unlocked: '+(item?.title||'Achievement'));status.classList.add('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>status.classList.remove('toast'),4000);return;}
 noticeTitle.textContent=detail.kind==='achievements'?'Achievements':detail.title||'Order Up!! To Go';noticeBody.replaceChildren();
 if(detail.kind==='achievements'){
  const list=document.createElement('ol');for(const item of (data.achievements.length?data.achievements:Array.from({length:30},(_,i)=>({id:i+13,title:'Achievement '+(i+1),description:''})))){const li=document.createElement('li'),title=document.createElement('strong'),description=document.createElement('p');title.textContent=(detail.unlocked.includes(item.id)?'✓ ':'○ ')+item.title;description.textContent=item.description;li.append(title,description);list.append(li);}noticeBody.append(list);
 }else noticeBody.textContent=detail.message||'';
 if(!notice.open){resumeAfterNotice=state.state==='running';tutorialControls?.hide();notice.showModal();noticeTitle.tabIndex=-1;noticeTitle.focus({preventScroll:true});notice.scrollTop=0;await state.controller?.pause();}
 if(detail.kind==='coin-store')await showCoinStore(state,notice,noticeBody,detail.silverOnly,failed);
}
document.querySelector('#notice-close').addEventListener('click',()=>notice.close());
notice.addEventListener('close',()=>{if(resumeAfterNotice&&!document.hidden)state.controller?.resume();});

async function start(){
 if(state.error||state.startRequested)return;state.startRequested=true;state.startup.play_requested=performance.now();button.hidden=true;
 try{
  const audioContext=new AudioContext(),sound=document.createElement('button');
  sound.id='sound';sound.type='button';sound.hidden=true;sound.textContent='Enable sound';document.querySelector('.viewport-controls').prepend(sound);
  // Autoplay permission gates sound only, never startup or the frame controller.
  const unlockAudio=()=>{if(!document.hidden&&!['paused','pausing','failed'].includes(state.state)&&audioContext.state!=='running')audioContext.resume().catch(()=>{});};
  state.updateSound=()=>{state.audioUnlocked||=audioContext.state==='running';sound.hidden=!!state.audioUnlocked||!state.frames||!!state.error;};
  for(const event of ['pointerdown','pointerup','touchend','keydown'])document.addEventListener(event,unlockAudio,{capture:true,passive:true});
  sound.addEventListener('click',unlockAudio);audioContext.addEventListener('statechange',state.updateSound);unlockAudio();
  const assets=await assetsReady;if(!assets)return;const {data,emulator}=assets;
  const files=new Map(paths.slice(1).map((p,i)=>[p,{data:data[i+1],writable:false}]));
  const saves=await openSaves(),pendingSaves=[];for(const [p,file] of saves.files)files.set(p,file);
  loadingPhase('engine');const graphics=new GameGraphics(canvas,{log:event=>console.log('[graphics]',JSON.stringify(event))});
  const audio=new GameAudio(data[3],audioContext);
  const runtime=state.runtime=new ArmRuntime(emulator,data[0],{files,graphics,audio,onSave:(p,data)=>pendingSaves.push(saves.write(p,data)),log:event=>{if(event.type!=='initializer')console.log('[engine]',JSON.stringify(event));}});
  runtime.onNotice=detail=>showNotice(detail).catch(failed);
  runtime.onActivityIndicator=show=>{state.activityLoading=show;activityIndicator.hidden=!show;};
  runtime.function('eglGetCurrentDisplay',()=>1);runtime.function('eglGetCurrentSurface',()=>1);runtime.function('eglSwapBuffers',()=>{graphics.present();return 1;});
  say('Starting the original game…');state.state='initializing';loadingPhase('initializers');await runtime.initialize();state.initializersCompleted=true;loadingPhase('game');await runtime.boot();state.bootCompleted=true;loadingPhase('menu');
  bindMouse(canvas,(...args)=>{const last=state.input.at(-1);if(args[1]===2&&last?.[1]===2)state.input[state.input.length-1]=args;else state.input.push(args);});state.state='running';say('Opening the game…');button.hidden=true;
  let storage;try{storage=globalThis.localStorage;}catch{}
  tutorialControls=createTutorialControls({overlay:document.querySelector('#tutorial-overlay'),skipButton:document.querySelector('#skip-tutorial'),state,storage,tutorial:createTutorialSkipper(runtime)});
  const nativeFullscreen=createNativeFullscreen(runtime,{enabled:fullscreen.enabled,label:fullscreen.label,pressed:fullscreen.pressed,onBounds:bounds=>fullscreen.setBounds(bounds),onMainMenu:visible=>fullscreen.setMenuVisible(visible)});
  state.flushSaves=()=>Promise.all(pendingSaves.splice(0));state.controller=startFrameLoop(state,runtime,{flushSaves:state.flushSaves,afterStep:()=>nativeFullscreen.update(),afterFrame:context=>tutorialControls.afterFrame(context),onFailure:error=>{tutorialControls.hide();failed(error);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden||notice.open){tutorialControls.hide();state.controller.pause();}else state.controller.resume();});
  if(document.hidden)state.controller.pause();
 }catch(error){failed(error);}
}
function failed(error){fullscreen.setMenuVisible(false);stopLoading();document.body.classList.remove('playing');loadingPanel.dataset.stage='error';fullscreen.setBounds(null);activityIndicator.hidden=true;state.state='failed';state.error=String(error);console.error(error);state.report=state.runtime?.report();say(state.bootCompleted?'The game stopped. Reload to return to your latest save.':'The game could not finish loading. Reload to retry.');loadingTitle.textContent='Unable to load the game';loadingDetail.textContent=status.textContent;loadingProgress.hidden=true;loadingAmount.textContent='';loadingElapsed.textContent='';loadingPanel.hidden=false;button.hidden=false;button.textContent='Reload to retry';button.disabled=false;button.onclick=()=>location.reload();}
loadingTimer=setInterval(updateLoading,250);updateLoading();const assetsReady=preload();start();
