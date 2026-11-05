import assert from 'node:assert/strict';
import {createTutorialControls,readTutorialPreference,writeTutorialPreference,tutorialPreferenceKey} from '../web/tutorial.mjs';

const storage=()=>({values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,value);}});
const first=storage(),other=storage();
assert.equal(readTutorialPreference(first),false);
writeTutorialPreference(first,true);
assert.equal(readTutorialPreference(first),true);
assert.equal(readTutorialPreference(other),false,'Different browser players keep separate preferences');
first.setItem(tutorialPreferenceKey,'corrupt');assert.equal(readTutorialPreference(first),false);
const blocked={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}};
assert.equal(readTutorialPreference(blocked),false);assert.equal(writeTutorialPreference(blocked,true),false);

class Button extends EventTarget {
  attributes=new Map();disabled=false;textContent='';
  setAttribute(key,value){this.attributes.set(key,value);}
  click(){this.dispatchEvent(new Event('click'));}
}
function controls(store=storage()) {
  const overlay={hidden:true},skipButton=new Button(),preferenceButton=new Button(),state={state:'running',input:[]};
  let active=true,calls=0,failure=false,message='';
  const ui=createTutorialControls({overlay,skipButton,preferenceButton,state,storage:store,say:text=>message=text,tutorial:{active:()=>active,async skip(){calls++;if(failure)throw Error('Exit failed');active=false;return true;}}});
  return {ui,overlay,skipButton,preferenceButton,state,store,get calls(){return calls;},get message(){return message;},set active(value){active=value;},set failure(value){failure=value;}};
}
const manual=controls();await manual.ui.afterFrame();assert.equal(manual.calls,0);assert.equal(manual.overlay.hidden,false);
manual.skipButton.click();assert.equal(manual.calls,0,'DOM handlers must not enter a running guest frame');
let released=false;
await manual.ui.afterFrame({releaseInput:async()=>{assert.equal(manual.calls,0);released=true;}});assert(released,'Release held input before ending the scene');assert.equal(manual.calls,1);assert.equal(readTutorialPreference(manual.store),true);assert.equal(manual.overlay.hidden,true);
await manual.ui.afterFrame();assert.equal(manual.calls,1,'No duplicate exit');
const returning=controls(manual.store);await returning.ui.afterFrame();assert.equal(returning.calls,1,'Saved preference applies to the next tutorial');
returning.preferenceButton.click();assert.equal(readTutorialPreference(manual.store),false);
returning.active=true;await returning.ui.afterFrame();assert.equal(returning.calls,1,'Player can re-enable the next tutorial');
const paused=controls();paused.state.state='paused';paused.skipButton.click();await paused.ui.afterFrame();assert.equal(paused.calls,0);assert.equal(paused.overlay.hidden,true);
paused.state.state='running';await paused.ui.afterFrame();assert.equal(paused.calls,1);
const gone=controls();gone.skipButton.click();gone.active=false;await gone.ui.afterFrame();assert.equal(gone.calls,0);assert.equal(readTutorialPreference(gone.store),false,'Stale click does not change preferences');
const failed=controls();failed.failure=true;failed.skipButton.click();await assert.rejects(failed.ui.afterFrame(),/Exit failed/);assert.equal(readTutorialPreference(failed.store),false);
const unavailable=controls(blocked);unavailable.skipButton.click();await unavailable.ui.afterFrame();assert.equal(unavailable.calls,1);assert.match(unavailable.message,/could not save/);
console.log('Tutorial preference, player isolation, frame serialization, opt-in, reset, and failure checks passed.');
