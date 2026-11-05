export function installThreads(r){
 const f=(n,fn)=>r.function(n,fn),a=i=>r.arg(i);const mutexes=new Map(),attrs=new Map(),conditions=new Map(),semaphores=new Map(),futexes=new Map();
 const mutex=p=>{if(!mutexes.has(p))mutexes.set(p,{owner:0,count:0,type:0,waiting:[]});return mutexes.get(p);};
 const block=(kind,key,list)=>{const t=r.active;r.ret(0);t.state='blocked';t.wait={kind,key};list.push(t);return undefined;};
 const ready=t=>{const blocked=t.state==='blocked';t.state='ready';delete t.wait;
  // An actual grant can hand execution from main to its waiting worker. Sleeping
  // threads retain their deadlines; ordinary round-robin turns still advance.
  if(blocked&&r.workerHandoff&&r.active===r.main&&t!==r.main){if(!r.handoff||r.handoff.state!=='ready')r.handoff=t;r.active.forceYield=true;}
 };
 const release=p=>{const m=mutex(p);if(m.count>1){m.count--;return;}m.owner=0;m.count=0;const t=m.waiting.shift();if(t){m.owner=t.id;m.count=1;ready(t);}};
 const acquireFor=(t,p)=>{const m=mutex(p);if(!m.owner){m.owner=t.id;m.count=1;ready(t);}else{t.wait={kind:'mutex',key:p};m.waiting.push(t);}};
 f('pthread_self',()=>r.active.id);
 f('pthread_mutexattr_init',()=>{attrs.set(a(0),{type:0});return 0;});f('pthread_mutexattr_settype',()=>{attrs.get(a(0)).type=a(1);return 0;});f('pthread_mutexattr_destroy',()=>{attrs.delete(a(0));return 0;});
 f('pthread_mutex_init',()=>{mutexes.set(a(0),{owner:0,count:0,type:a(1)?attrs.get(a(1))?.type||0:0,waiting:[]});return 0;});
 f('pthread_mutex_lock',()=>{const m=mutex(a(0));if(!m.owner||m.owner===r.active.id&&m.type===1){m.owner=r.active.id;m.count++;return 0;}return block('mutex',a(0),m.waiting);});
 f('pthread_mutex_unlock',()=>{const m=mutex(a(0));if(m.owner!==r.active.id)throw Error('Mutex unlock by non-owner');release(a(0));return 0;});f('pthread_mutex_destroy',()=>{const m=mutex(a(0));if(m.owner||m.waiting.length)return 16;mutexes.delete(a(0));return 0;});
 f('pthread_cond_init',()=>{conditions.set(a(0),[]);return 0;});f('pthread_cond_wait',()=>{const p=a(0),mp=a(1),list=conditions.get(p)||[];conditions.set(p,list);const t=r.active;t.conditionMutex=mp;release(mp);return block('condition',p,list);});
 f('pthread_cond_signal',()=>{const t=conditions.get(a(0))?.shift();if(t){acquireFor(t,t.conditionMutex);delete t.conditionMutex;}return 0;});
 f('sem_init',()=>{semaphores.set(a(0),{count:a(2),waiting:[]});return 0;});f('sem_wait',()=>{const s=semaphores.get(a(0));if(!s)throw Error('Uninitialized semaphore');if(s.count){s.count--;return 0;}return block('semaphore',a(0),s.waiting);});f('sem_post',()=>{const s=semaphores.get(a(0));if(!s)throw Error('Uninitialized semaphore');const t=s.waiting.shift();if(t)ready(t);else s.count++;return 0;});f('sem_destroy',()=>{const s=semaphores.get(a(0));if(s?.waiting.length)return -1;semaphores.delete(a(0));return 0;});
 f('pthread_attr_init',()=>{attrs.set(a(0),{});return 0;});f('pthread_attr_setstackaddr',()=>{attrs.get(a(0)).stack=a(1);return 0;});f('pthread_attr_setstacksize',()=>{attrs.get(a(0)).size=a(1);return 0;});f('pthread_attr_setschedparam',()=>0);
 f('pthread_create',()=>{const ptr=a(0),attr=attrs.get(a(1))||{},entry=a(2),arg=a(3),id=r.threads.length+1;const parent=r.engine.context_alloc();r.engine.context_save(parent);try{const stack=attr.stack?attr.stack+(attr.size||0x10000):0x20000000+id*0x100000;if(stack>0x21000000)throw Error('Guest stack arena exhausted');const t=r.createThreadState(id,stack);r.prepare(t,entry,[arg],r.exitTrap);r.u32(ptr,id);r.events.push({type:'thread-created',id,entry,stack});}finally{r.engine.context_restore(parent);r.engine.context_free(parent);}return 0;});
 f('pthread_join',()=>{const target=r.threads.find(t=>t.id===a(0));if(!target)return 3;if(target.state==='exited'){if(a(1))r.u32(a(1),target.result);return 0;}target.joiners??=[];r.active.joinResult=a(1);return block('join',a(0),target.joiners);});
 r.threadExited=t=>{if(t.state!=='exited')return;for(const w of t.joiners||[]){if(w.joinResult)r.u32(w.joinResult,t.result);ready(w);}t.joiners=[];};
 f('__atomic_cmpxchg',()=>{const old=a(0),next=a(1),p=a(2);if(r.u32(p)!==old)return 1;r.u32(p,next);return 0;});
 f('__futex_wait',()=>{const p=a(0);if(r.u32(p)!==a(1))return -11;const list=futexes.get(p)||[];futexes.set(p,list);return block('futex',p,list);});
 f('__futex_wake',()=>{const list=futexes.get(a(0))||[];let n=0;while(n<a(1)&&list.length){ready(list.shift());n++;}return n;});
 f('sched_yield',()=>{r.active.forceYield=true;return 0;});f('usleep',()=>{const t=r.active,delay=a(0)/1000;r.ret(0);t.state='sleep';t.wake=r.virtualMs+Math.max(0.001,delay);return undefined;});
 r.wakeSleepers=()=>{for(const t of r.threads)if(t.state==='sleep'&&t.wake<=r.virtualMs)ready(t);};
}

/** Yield to the browser without a nested zero-delay timer's 4ms clamp. */
export function createTaskQueue(){
 let sequence=0,closed=false;const pending=new Map(),channel=typeof MessageChannel==='function'?new MessageChannel():null;
 if(channel){channel.port1.onmessage=({data})=>{const fn=pending.get(data);pending.delete(data);if(fn)fn();if(!pending.size)channel.port1.unref?.();};channel.port1.unref?.();channel.port2.unref?.();}
 const queue={schedule(fn){if(closed)throw Error('Task queue is closed');const id=++sequence;if(channel){pending.set(id,fn);channel.port1.ref?.();channel.port2.postMessage(id);}else pending.set(id,setTimeout(()=>{pending.delete(id);fn();},0));return id;},cancel(id){if(!channel)clearTimeout(pending.get(id));pending.delete(id);},yield(){return new Promise(resolve=>queue.schedule(resolve));},close(){closed=true;if(!channel)for(const timer of pending.values())clearTimeout(timer);pending.clear();channel?.port1.close();channel?.port2.close();}};return queue;
}
