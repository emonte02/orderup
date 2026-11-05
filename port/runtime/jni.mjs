export function installJNI(r){
 r.preferences={achievements:{}};try{if(globalThis.localStorage)r.preferences=JSON.parse(localStorage.getItem('orderup-browser-preferences')||'{"achievements":{}}');}catch{}
 r.javaObjects=new Map();r.javaClasses=new Map();r.javaMethods=new Map();r.jniFrame=null; const local=p=>{if(r.jniFrame)r.jniFrame.set(p,(r.jniFrame.get(p)||0)+1);};
 r.beginJNIFrame=()=>{if(r.jniFrame)throw Error('Overlapping JNI local frames');r.jniFrame=new Map();};
 r.jobject=o=>{const p=r.malloc(16);o.localRefs=1;o.globalRefs=0;o.parentRefs=0;r.javaObjects.set(p,o);local(p);return p;};
 const collect=p=>{const o=r.javaObjects.get(p);if(!o||o.localRefs||o.globalRefs||o.parentRefs||['class','method','activity'].includes(o.kind))return;
  r.javaObjects.delete(p);if(o.utf)r.free(o.utf);if(o.kind==='bytes'||o.kind==='int-array')r.free(o.address);if(o.kind==='array')for(const element of o.elements){const child=r.javaObjects.get(element);if(child){child.parentRefs--;collect(element);}}r.free(p);
 };
 const reference=(p,kind,delta)=>{const o=r.javaObjects.get(p);if(!o)return 0;if(kind==='localRefs'&&r.jniFrame){if(delta>0)local(p);else{const count=r.jniFrame.get(p)||0;if(count>1)r.jniFrame.set(p,count-1);else r.jniFrame.delete(p);}}o[kind]=Math.max(0,o[kind]+delta);if(delta<0)collect(p);return p;};
 r.endJNIFrame=()=>{const frame=r.jniFrame;r.jniFrame=null;if(frame)for(const[p,count]of frame)reference(p,'localRefs',-count);};
 r.jclass=name=>{if(!r.javaClasses.has(name))r.javaClasses.set(name,r.jobject({kind:'class',name}));return r.javaClasses.get(name);};
 const table=r.malloc(240*4);r.jniEnv=r.malloc(4);r.u32(r.jniEnv,table);for(let i=0;i<240;i++)r.u32(table+i*4,r.trap('jni:'+i));
 r.activity=r.jobject({kind:'activity'});r.javaClass=r.jclass('com/svsgames/orderup/OrderUpJNILib');installPlatformServices(r);
 const call=(method,args)=>{
  const m=r.javaObjects.get(method);if(!m||m.kind!=='method')throw Error('Invalid Java method handle '+method);
  r.events.push({type:'java-call',class:m.className,name:m.name,signature:m.signature});
  const str=value=>r.jobject({kind:'string',value});
  if(m.className==='com/svsgames/sys/XSysAudioStreamer'&&!['getStreamer','setActivity'].includes(m.name)){if(!r.audio)return r.unsupported('Original audio service '+m.name);return r.audio.call(r,m.name,args);}
  if(m.name==='checkForEconomyUpdate'||m.name==='checkForGoldCredit'){r.events.push({type:'unavailable-service',service:'legacy economy server',operation:m.name,behavior:'Use bundled economy and existing saved balance; no remote credit.'});r.reachedMainMenu=true;return 0;}
  if(m.name==='processQueue')return 0;
  const platform=r.platformCall(m,args);if(platform!==undefined)return platform;
  if(m.name==='getAchievementUnlocked')return r.preferences.achievements[r.javaObjects.get(args[0])?.value]?1:0;
  if(m.name==='setAchievementUnlocked'){r.preferences.achievements[r.javaObjects.get(args[0])?.value]=true;try{globalThis.localStorage?.setItem('orderup-browser-preferences',JSON.stringify(r.preferences));}catch{}return 0;}
  if(m.name==='getInstance'||m.name==='getStreamer')return r.jobject({kind:'instance',className:m.className});
  if(m.name==='showActivityIndicator'){r.onActivityIndicator?.(!!args[0]);return 0;}
  if(['init','setActivity','showLoadingIndicator','mainMenuReached','postAnalytics','displayLoadingIndicator','setMusicVolume','playSound','playMusic','stopMusic','pauseMusic','resumeMusic'].includes(m.name))return 0;
  if(['showPromoBannerAd','showBannerAd','showInterstitialAd'].includes(m.name)){r.events.push({type:'unavailable-service',service:'legacy advertising',operation:m.name});return 0;}
  if(m.name==='setServerVerify'){r.serverVerify=!!args[0];return 0;}
  if(m.name==='isFreemiumBuild')return 1;
  if(m.name==='getLanguage')return str('en');
  if(m.name==='getLanguageCode')return str('English');
  if(m.name==='getEconomyFolder')return str('');
  if(m.name==='putPreferencesBool'){r.preferences.booleans??={};const key=r.javaObjects.get(args[0])?.value,previous=!!r.preferences.booleans[key];r.preferences.booleans[key]=!!args[1];try{globalThis.localStorage?.setItem('orderup-browser-preferences',JSON.stringify(r.preferences));}catch{}return Number(previous);}
  if(m.name==='swapBuffers'){r.graphics?.present();return 0;}
  if(['servedTutorialBurger','startedTutorial'].includes(m.name))return 0;
  if(['bannerAd','postAnalytics','postLeaderboardScore','scheduleReopenNotification','cancelReopenNotification'].includes(m.name)){r.events.push({type:'unavailable-service',service:'legacy platform integration',operation:m.name});return 0;}
  if(m.name==='getPropertyValue'){
   const o=r.javaObjects.get(args[0]),key=o?.value;const values={googlePlay:'true',freemium:'true',language:'en',amazon:'false',joymoa:'false',tstore:'false',kddi:'false'};
   if(key in values)return str(values[key]);return 0;
  }
  if(['isAmazonBuild','isJoymoaBuild','isTStoreBuild','isNStoreBuild','isKDDIBuild','isKoreanBuild','isJapaneseBuild','isTAdRewardEnabled','getDisabledAds','getPermanentDoubleSilverCoins'].includes(m.name))return 0;
  return r.unsupported('Java '+m.className+'.'+m.name+m.signature);
 };
 r.jniCall=index=>{
  const a=i=>r.arg(i),obj=p=>r.javaObjects.get(p);
  if(index===6)return r.jclass(r.str(a(1)));
  if(index===21)return reference(a(1),'globalRefs',1);
  if(index===25)return reference(a(1),'localRefs',1);
  if(index===22){reference(a(1),'globalRefs',-1);return 0;}
  if(index===23){reference(a(1),'localRefs',-1);return 0;}
  if(index===170){const o=obj(a(1));if(o?.utf&&o.utf===a(2)){o.utfUsers--;if(!o.utfUsers){r.free(o.utf);delete o.utf;}}return 0;}
  if([192,215].includes(index))return 0;
  if(index===24)return a(1)===a(2)?1:0;
  if(index===31)return r.jclass(obj(a(1))?.className||'com/svsgames/orderup/OrderUpActivity');
  if([33,113].includes(index)){
   const className=obj(a(1))?.name||'unknown',name=r.str(a(2)),signature=r.str(a(3)),key=className+'.'+name+signature;
   if(!r.javaMethods.has(key))r.javaMethods.set(key,r.jobject({kind:'method',className,name,signature}));return r.javaMethods.get(key);
  }
  if(index===167)return r.jobject({kind:'string',value:r.str(a(1))});
  if(index===169){const o=obj(a(1));if(o?.kind!=='string')throw Error('GetStringUTFChars non-string');o.utf??=r.cstring(o.value);o.utfUsers=(o.utfUsers||0)+1;if(a(2))r.u8(a(2),1);return o.utf;}
  if(index===168)return new TextEncoder().encode(obj(a(1))?.value||'').length;
  if(index===171)return obj(a(1))?.length||0;
  if(index===172){const n=a(1),initial=a(3);if(initial){const child=obj(initial);if(child)child.parentRefs+=n;}return r.jobject({kind:'array',length:n,elements:Array(n).fill(initial)});}
  if(index===173)return reference(obj(a(1)).elements[a(2)],'localRefs',1);
  if(index===174){const array=obj(a(1)),i=a(2),value=a(3),previous=array.elements[i];if(value){const child=obj(value);if(child)child.parentRefs++;}array.elements[i]=value;if(previous){const child=obj(previous);if(child){child.parentRefs--;collect(previous);}}return 0;}
  const platformArray=platformArrayCall(r,index);if(platformArray!==undefined)return platformArray;
  if(index===176){const n=a(1),p=r.malloc(n);return r.jobject({kind:'bytes',length:n,address:p});}
  if(index===184){const o=obj(a(1));if(o?.kind!=='bytes')throw Error('GetByteArrayElements non-array');if(a(2))r.u8(a(2),0);return o.address;}
  if([15,17,228].includes(index))return 0;
  if([35,38,50,62,115,118,130,142].includes(index)){
   const method=obj(a(2)),signature=method?.signature||'',args=[];let p=a(3);
   for(let i=1;signature[i]&&signature[i]!==')';i++){
    let type=signature[i];if(type==='['){while(signature[i+1]==='[')i++;type=signature[++i];if(type==='L')i=signature.indexOf(';',i);type='L';}else if(type==='L')i=signature.indexOf(';',i);
    if(type==='J'||type==='D'||type==='F'){p=Math.ceil(p/8)*8;const low=r.u32(p),high=r.u32(p+4);p+=8;if(type==='J')args.push({low,high});else{const v=new DataView(new ArrayBuffer(8));v.setUint32(0,low,true);v.setUint32(4,high,true);args.push(v.getFloat64(0,true));}}
    else{args.push(r.u32(p));p+=4;}
   }
   return call(a(2),args);
  }
  if(index===215){return 0;} // RegisterNatives: entry points are explicitly selected by the host.
  return r.unsupported('JNI table index '+index);
 };
}

/** Retired Android services use the original unavailable-service callbacks. */
export function installPlatformServices(r){
 r.hostCallbacks=[];
 r.pumpHostCallbacks=async()=>{for(const callback of r.hostCallbacks.splice(0))await r.call(callback.name,[r.jniEnv,0,...callback.args]);};
 const notice=detail=>{r.events.push({type:'platform-notice',...detail});r.onNotice?.(detail);};
 r.platformCall=(m,args)=>{
  if(m.name==='interstitialAd'){
   r.events.push({type:'unavailable-service',service:'legacy advertising',operation:m.name,behavior:'Original ad-unavailable completion callback.'});
   r.hostCallbacks.push({name:'Java_com_svsgames_orderup_OrderUpJNILib_interstitialAdDone',args:[args[0]]});return 0;
  }
  if(['moveTaskToBack','openURL','openAppLink','launchGameCircle'].includes(m.name)){notice({kind:'dialog',title:'Order Up!! To Go',message:m.name==='moveTaskToBack'?'You can close this tab to leave the game. Your latest saved progress stays on this computer.':'The original online service is no longer available. Your game progress and achievements are saved on this computer.'});return 0;}
  if(m.name==='showAchievement'){notice({kind:'achievement',id:args[0]});return 0;}
  if(m.name==='showAchievementsUI'){const array=r.javaObjects.get(args[0]);notice({kind:'achievements',unlocked:array?Array.from({length:array.length},(_,i)=>r.u32(array.address+i*4)):[]});return 0;}
  if(['showGoldIAP','showSilverIAP','showOfferWall'].includes(m.name)){notice({kind:'coin-store',title:'Order Up!! Purchases',silverOnly:m.name==='showSilverIAP'});return 0;}
  if(['disableAds','purchaseMysteryGift'].includes(m.name)){notice({kind:'dialog',title:'Purchases unavailable',message:'The original purchase service is no longer available. You can still earn coins by playing.'});return 0;}
  if(m.name==='displayGenericDialog'||m.name==='displayIAPConfirmationDialog'){notice({kind:'dialog',title:'Order Up!! To Go',message:r.javaObjects.get(args[0])?.value||''});return 0;}
  if(m.name==='displayDialog'){notice({kind:'dialog',title:'Order Up!! To Go',message:args[0]===3?'Double Silver Coins purchased.':args[0]===4?'Double Silver Coins - 5 Shifts purchased.':args[0]===5?'Double Silver Coins - 15 Shifts purchased.':args[0]===8?'The original purchase service is no longer available. Your saved progress is kept on this computer.':args[0]===11?'To leave the game, close this tab. Your latest saved progress will be here when you return.':'This online service is no longer available.'});return 0;}

  if(m.name==='fetchLink')return r.jobject({kind:'string',value:''});
 };
}

export function platformArrayCall(r,index){
 const a=i=>r.arg(i),obj=p=>r.javaObjects.get(p);
  if(index===179){const n=a(1),p=r.malloc(n*4);r.write(p,new Uint8Array(n*4));return r.jobject({kind:'int-array',length:n,address:p});}
  if(index===187){const o=obj(a(1));if(o?.kind!=='int-array')throw Error('GetIntArrayElements non-array');if(a(2))r.u8(a(2),0);return o.address;}
  if(index===195)return 0;
  if(index===211){const o=obj(a(1)),start=a(2),count=a(3);if(o?.kind!=='int-array'||start+count>o.length)throw Error('SetIntArrayRegion out of range');r.write(o.address+start*4,r.read(a(4),count*4));return 0;}
}
