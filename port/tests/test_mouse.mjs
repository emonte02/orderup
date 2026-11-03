import assert from 'node:assert/strict';
import {bindMouse} from '../web/mouse.mjs';
class Canvas extends EventTarget {
  width=960;height=640;style={touchAction:'auto'};captured=null;
  getBoundingClientRect(){return {left:10,top:20,width:480,height:320};}
  setPointerCapture(id){this.captured=id;}
  hasPointerCapture(id){return this.captured===id;}
  releasePointerCapture(){this.captured=null;}
}
const c=new Canvas(),w=new EventTarget(),received=[];
const unbind=bindMouse(c,(...args)=>received.push(args),w);
function event(type,props={}){
  const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:7,button:0,isPrimary:true,clientX:110,clientY:70},props);c.dispatchEvent(e);
}
event('pointermove');assert.equal(received.length,0);
event('pointerdown',{button:1});assert.equal(received.length,0);
event('pointerdown');assert.deepEqual(received.at(-1),[0,0,200,100,false]);
event('pointerdown',{pointerId:8,isPrimary:false});assert.equal(received.length,1);
event('pointermove',{clientX:250,clientY:180});assert.deepEqual(received.at(-1),[0,2,480,320,false]);
event('pointerup',{clientX:510,clientY:360});assert.deepEqual(received.at(-1),[0,1,1000,680,false]);
assert.equal(c.captured,null);
event('pointerdown');w.dispatchEvent(new Event('blur'));assert.equal(received.at(-1)[1],1);
event('pointerdown');event('pointercancel');assert.equal(received.at(-1)[1],1);
event('pointerdown');event('lostpointercapture');assert.equal(received.at(-1)[1],1);
event('pointerdown',{button:2});assert.deepEqual(received.at(-1),[0,3,0,0,true]);
event('pointerup',{button:2});assert.deepEqual(received.at(-1),[0,3,0,0,false]);
event('pointerdown',{button:2});w.dispatchEvent(new Event('blur'));assert.deepEqual(received.at(-1),[0,3,0,0,false]);
const key=(type,repeat=false)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{key:'Escape',repeat});w.dispatchEvent(e);};
key('keydown');assert.deepEqual(received.at(-1),[0,3,0,0,true]);const heldCount=received.length;key('keydown',true);assert.equal(received.length,heldCount);key('keyup');assert.deepEqual(received.at(-1),[0,3,0,0,false]);
const context=new Event('contextmenu',{cancelable:true});c.dispatchEvent(context);assert.equal(context.defaultPrevented,true);
event('pointerdown');unbind();assert.equal(received.at(-1)[1],1);assert.equal(c.style.touchAction,'auto');
const n=received.length;event('pointerdown');assert.equal(received.length,n);
console.log('Mouse adapter: press, drag, release, scaling, capture, cancel, blur, Android Back, Escape, cleanup passed.');
