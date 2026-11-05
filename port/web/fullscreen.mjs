/** Browser activation for the button drawn by the native game menu. */
export function bindFullscreen(canvas,button,label,{onUnavailable=()=>{},documentTarget=document,windowTarget=window}={}){
 let bounds=null,pointer=null,inside=false,focused=false,exitTime=-Infinity;
 const listeners=[],on=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
 const active=()=>!!documentTarget.fullscreenElement;
 const supported=()=>!!documentTarget.fullscreenEnabled;
 const update=()=>{button.hidden=!supported();button.setAttribute('aria-pressed',String(active()));button.setAttribute('aria-label',active()?'Exit full screen':'Enter full screen');label.textContent=active()?'Exit Full Screen':'Full Screen';};
 const toggle=()=>{try{const result=active()?documentTarget.exitFullscreen():documentTarget.documentElement.requestFullscreen();Promise.resolve(result).catch(onUnavailable);}catch(error){onUnavailable(error);}};
 const hit=event=>{
  if(!bounds)return false;
  const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return false;
  const x=(event.clientX-box.left)*canvas.width/box.width,y=(event.clientY-box.top)*canvas.height/box.height;
  return x>=bounds.x&&x<=bounds.x+bounds.width&&y>=bounds.y&&y<=bounds.y+bounds.height;
 };
 const reset=()=>{const id=pointer;pointer=null;inside=false;if(id!==null&&canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);};
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
 on(button,'click',toggle);
 on(button,'focus',()=>{focused=true;});on(button,'blur',()=>{focused=false;});
 on(documentTarget,'fullscreenchange',()=>{if(!active())exitTime=performance.now();update();});
 on(canvas,'pointerdown',event=>{
  if(event.isPrimary===false||event.button!==0||pointer!==null||!hit(event))return;
  consume(event);pointer=event.pointerId;inside=true;canvas.setPointerCapture?.(pointer);
 },true);
 on(canvas,'pointermove',event=>{
  if(pointer!==null&&event.pointerId===pointer){consume(event);inside=hit(event);}
  canvas.style.cursor=hit(event)?'pointer':'';
 },true);
 on(canvas,'pointerup',event=>{
  if(event.pointerId!==pointer)return;
  consume(event);const activate=hit(event);reset();if(activate)toggle();
 },true);
 for(const event of ['pointercancel','lostpointercapture'])on(canvas,event,e=>{if(e.pointerId===pointer){consume(e);reset();}},true);
 on(canvas,'pointerleave',()=>{canvas.style.cursor='';});
 on(windowTarget,'blur',reset);
 // Escape belongs to the browser while exiting full screen. Do not also send
 // Android Back and inadvertently leave the map on the same keystroke.
 let escapeHeld=false;
 on(windowTarget,'keydown',event=>{
  if(event.key!=='Escape'||!active()&&performance.now()-exitTime>=350)return;
  escapeHeld=true;event.stopImmediatePropagation();
  // Some browsers deliver Escape to the page (including automated Chrome),
  // while others exit before dispatch. Support both without navigating Back.
  if(active()&&!event.repeat){event.preventDefault();Promise.resolve(documentTarget.exitFullscreen()).catch(()=>{if(active())onUnavailable();});}
 },true);
 on(windowTarget,'keyup',event=>{if(event.key==='Escape'&&escapeHeld){escapeHeld=false;event.stopImmediatePropagation();}},true);
 update();
 return {
  enabled:supported,
  label:()=>active()?'Exit Full Screen':'Full Screen',
  pressed:()=>pointer!==null&&inside||focused,
  setBounds(value){bounds=value;button.classList.toggle('native-fullscreen',!!bounds);if(!bounds){reset();canvas.style.cursor='';}},
  get bounds(){return bounds;},
  close(){reset();listeners.forEach(remove=>remove());button.classList.remove('native-fullscreen');canvas.style.cursor='';},
 };
}
