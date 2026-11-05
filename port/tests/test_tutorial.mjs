import assert from 'node:assert/strict';
import {createTutorialControls} from '../web/tutorial.mjs';

class Button extends EventTarget {
  disabled=false;textContent='';
  click(){this.dispatchEvent(new Event('click'));}
}
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
function controls(storage=memoryStorage()) {
  const overlay={hidden:true},skipButton=new Button(),state={state:'running',input:[]};
  let active=false,calls=0,failure=false;
  const ui=createTutorialControls({overlay,skipButton,state,storage,tutorial:{active:()=>active,async skip(){calls++;if(failure)throw Error('Exit failed');active=false;return true;}}});
  return {ui,overlay,skipButton,state,storage,get calls(){return calls;},set active(value){active=value;},set failure(value){failure=value;}};
}
const player=controls();
assert.equal(player.overlay.hidden,true,'No button before the tutorial starts');
assert.equal(player.skipButton.textContent,'Skip Tutorial');
player.skipButton.click();player.active=true;await player.ui.afterFrame();
assert.equal(player.calls,0,'A click outside the tutorial cannot skip it later');
assert.equal(player.overlay.hidden,false);
player.skipButton.click();player.skipButton.click();
assert.equal(player.calls,0,'DOM handlers must not enter a running guest frame');
let released=false;
await player.ui.afterFrame({releaseInput:async()=>{assert.equal(player.calls,0);assert.equal(player.overlay.hidden,true);released=true;}});
assert(released,'Release held input before ending the scene');
assert.equal(player.calls,1,'Repeated clicks produce one exit');
assert.equal(player.overlay.hidden,true);
assert.equal(player.storage.getItem('orderup-skip-tutorial'),'true','Remember the successful click');
await player.ui.afterFrame();assert.equal(player.calls,1);
player.active=true;await player.ui.afterFrame();
assert.equal(player.calls,2,'The remembered choice skips the next tutorial');
assert.equal(player.overlay.hidden,true);
const returning=controls(player.storage);await returning.ui.afterFrame();assert.equal(returning.calls,0,'A remembered skip waits for the tutorial to start');
returning.active=true;await returning.ui.afterFrame();assert.equal(returning.calls,1,'Remember the choice after reload');
const otherPlayer=controls();otherPlayer.active=true;await otherPlayer.ui.afterFrame();assert.equal(otherPlayer.calls,0,'Other players start with a visible skip button');assert.equal(otherPlayer.overlay.hidden,false);

const paused=controls();paused.active=true;paused.state.state='paused';
paused.skipButton.click();await paused.ui.afterFrame();assert.equal(paused.calls,0);assert.equal(paused.overlay.hidden,true);
paused.state.state='running';await paused.ui.afterFrame();assert.equal(paused.calls,0);
const gone=controls();gone.active=true;await gone.ui.afterFrame();gone.skipButton.click();gone.active=false;
await gone.ui.afterFrame();gone.active=true;await gone.ui.afterFrame();assert.equal(gone.calls,0,'Discard a click when its tutorial has already ended');
const failed=controls();failed.active=true;failed.failure=true;failed.skipButton.click();
await assert.rejects(failed.ui.afterFrame(),/Exit failed/);assert.equal(failed.skipButton.disabled,false);
await failed.ui.afterFrame();assert.equal(failed.calls,1,'A failed exit is not retried automatically');
assert.equal(failed.storage.getItem('orderup-skip-tutorial'),null,'Do not remember a failed skip');
const blocked=controls({getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}});blocked.active=true;blocked.skipButton.click();await blocked.ui.afterFrame();assert.equal(blocked.calls,1,'Storage failure does not prevent skipping');
console.log('Tutorial visibility, one-shot clicks, remembered choice, input release, and frame serialization checks passed.');
