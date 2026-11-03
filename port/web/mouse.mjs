/** Map browser pointer gestures to OrderUpJNILib.touch's original ABI.
 * Source: OrderUpView.java:onTouchEvent; native JNI touch at ELF 0x000e0ba4.
 * Android Back follows OrderUpActivity.java:onKeyDown/onKeyUp.
 * emit(pointerId, action, x, y, special): DOWN=0, UP=1, MOVE=2, BACK=3 (special marks the held state).
 */
export function bindMouse(canvas, emit, windowTarget=globalThis.window) {
  let pointer=null,back=null,last={x:0,y:0};
  const previousTouchAction=canvas.style.touchAction;
  canvas.style.touchAction='none';
  const listeners=[];
  const on=(target,name,fn)=>{target.addEventListener(name,fn);listeners.push([target,name,fn]);};
  const position=e=>{
    const r=canvas.getBoundingClientRect();
    if(r.width<=0||r.height<=0)return last;
    return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
  };
  const release=()=>{
    if(pointer===null)return;
    const id=pointer;pointer=null;
    emit(0,1,last.x,last.y,false);
    if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
  };
  const releaseBack=()=>{if(back===null)return;back=null;emit(0,3,0,0,false);};
  const releaseAll=()=>{release();releaseBack();};
  on(canvas,'contextmenu',e=>e.preventDefault());
  on(canvas,'pointerdown',e=>{
    if(e.isPrimary===false)return;
    if(e.button===2){e.preventDefault();release();if(back===null){back=e.pointerId;canvas.setPointerCapture?.(back);emit(0,3,0,0,true);}return;}
    if(pointer!==null||e.button!==0)return;
    e.preventDefault();pointer=e.pointerId;last=position(e);
    canvas.setPointerCapture?.(pointer);emit(0,0,last.x,last.y,false);
  });
  on(canvas,'pointermove',e=>{
    if(e.pointerId!==pointer)return;
    e.preventDefault();last=position(e);emit(0,2,last.x,last.y,false);
  });
  on(canvas,'pointerup',e=>{if(e.button===2&&e.pointerId===back){e.preventDefault();const id=back;releaseBack();if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}else if(e.pointerId===pointer){e.preventDefault();last=position(e);release();}});
  on(canvas,'pointercancel',e=>{if(e.pointerId===pointer)release();if(e.pointerId===back)releaseBack();});
  on(canvas,'lostpointercapture',e=>{if(e.pointerId===pointer)release();if(e.pointerId===back)releaseBack();});
  if(windowTarget){
    on(windowTarget,'blur',releaseAll);
    on(windowTarget,'keydown',e=>{if(e.key==='Escape'&&!e.target?.closest?.('dialog[open]')){e.preventDefault();release();if(back===null){back='keyboard';emit(0,3,0,0,true);}}});
    on(windowTarget,'keyup',e=>{if(e.key==='Escape'&&back==='keyboard'){e.preventDefault();releaseBack();}});
  }
  return ()=>{releaseAll();for(const[t,n,f]of listeners)t.removeEventListener(n,f);canvas.style.touchAction=previousTouchAction;};
}
