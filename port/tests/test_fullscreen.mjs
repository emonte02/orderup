import assert from 'node:assert/strict';
import {bindFullscreen} from '../web/fullscreen.mjs';
import {bindMouse} from '../web/mouse.mjs';

class Element extends EventTarget{
 style={};width=960;height=640;attrs={};classes=new Set();captured=null;
 classList={toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name),remove:name=>this.classes.delete(name)};
 setAttribute(name,value){this.attrs[name]=value;}
 getBoundingClientRect(){return {left:100,top:50,width:480,height:320};}
 setPointerCapture(id){this.captured=id;}
 hasPointerCapture(id){return this.captured===id;}
 releasePointerCapture(){this.captured=null;}
}
const canvas=new Element(),button=new Element(),label={},doc=new EventTarget(),win=new EventTarget();
let entries=0,exits=0,unavailable=0;
doc.fullscreenEnabled=true;doc.documentElement={requestFullscreen(){entries++;doc.fullscreenElement=this;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();}};
doc.exitFullscreen=()=>{exits++;doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
const control=bindFullscreen(canvas,button,label,{documentTarget:doc,windowTarget:win,onUnavailable:()=>unavailable++});
const input=[];bindMouse(canvas,(...args)=>input.push(args),win);
const event=(type,x=850,y=600,extra={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{clientX:100+x/2,clientY:50+y/2,pointerId:1,button:0,isPrimary:true,...extra});canvas.dispatchEvent(e);return e;};
const bounds={x:700,y:550,width:250,height:80};control.setBounds(bounds);
assert(button.classes.has('native-fullscreen'));
event('pointerdown');assert.equal(control.pressed(),true);event('pointerup');assert.equal(entries,1);assert.equal(input.length,0);assert.equal(button.attrs['aria-pressed'],'true');assert.equal(label.textContent,'Exit Full Screen');
event('pointerdown');event('pointerup');assert.equal(exits,1);
event('pointerdown');event('pointermove',600);event('pointerup',600);assert.equal(entries,1,'Dragging off cancels activation');
event('pointerdown');event('pointercancel');event('pointerup');assert.equal(entries,1);
event('pointerdown');win.dispatchEvent(new Event('blur'));event('pointerup');assert.equal(entries,1);
event('pointerdown');control.setBounds(null);event('pointerup');assert.equal(entries,1,'Leaving the map cancels a held button');
control.setBounds(bounds);event('pointerdown',300,300);event('pointermove');event('pointerup');assert.equal(entries,1,'A cooking drag ending over the button does not activate it');assert.deepEqual(input.map(row=>row[1]),[0,2,1]);input.length=0;
event('pointerdown',850,600,{isPrimary:false});event('pointerup',850,600,{pointerId:2,isPrimary:false});assert.equal(entries,1);
button.dispatchEvent(new Event('click'));assert.equal(entries,2,'Keyboard-accessible button uses the same action');
for(const name of ['keydown','keyup']){const e=new Event(name,{cancelable:true});Object.assign(e,{key:'Escape'});win.dispatchEvent(e);}assert.equal(input.length,0,'Full-screen Escape must not send Android Back');
button.dispatchEvent(new Event('focus'));assert.equal(control.pressed(),true);button.dispatchEvent(new Event('blur'));assert.equal(control.pressed(),false);
await doc.exitFullscreen();doc.documentElement.requestFullscreen=()=>Promise.reject(Error('Denied'));button.dispatchEvent(new Event('click'));await Promise.resolve();assert.equal(unavailable,1);
control.close();assert(!button.classes.has('native-fullscreen'));
console.log('Native full-screen activation: click, scaled coordinates, drag cancellation, blur, scene exit, keyboard, Escape and denied requests passed.');
