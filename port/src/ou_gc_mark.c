/* Bounded equivalents of original CVM Array/Assoc marking (ARM 0x3ce704,
 * 0x3ccb58). Unknown child marks and virtual getters still execute original ARM.
 * AAPCS-preserving guest continuations retain exact depth-first traversal order.
 */
#include "ou_gc_mark.h"
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include <unicorn/arm.h>
extern int ou_guest_variant_equal(uc_engine *,uint32_t,uint32_t,uint32_t *);
extern int ou_guest_variant_mark(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t *);
typedef struct {uint32_t kind,p,n,mask;} Job;
typedef struct Frame {struct Frame *next;Job *jobs;uint32_t used,capacity,sp,lr,r4,entered,entry_n,entry_mask,bank,bank_kind,result,awaiting,phase,query,lookup_object,lookup_output,lookup_table,lookup_index;double phase_started;} Frame;
struct OUGC {uc_engine *engine;uint32_t bindings[10],machine[16],module_iter[4],menu_marks[2],menu_find[2],script_inline,script_objects,resume,containers,variants,delegates;double phase_ms[20],phase_max[20];Frame *frames;};
static int read32(OUGC *gc,uint32_t p,uint32_t *v){return uc_mem_read(gc->engine,p,v,4);}
static int write32(OUGC *gc,uint32_t p,uint32_t v){return uc_mem_write(gc->engine,p,&v,4);}
static int reg(OUGC *gc,int id,uint32_t *v){return uc_reg_read(gc->engine,id,v);}
static int setreg(OUGC *gc,int id,uint32_t v){return uc_reg_write(gc->engine,id,&v);}
static int push(Frame *f,Job job){if(f->used==f->capacity){uint32_t n=f->capacity?f->capacity*2:64;if(n>1048576)return UC_ERR_NOMEM;Job *p=realloc(f->jobs,n*sizeof(Job));if(!p)return UC_ERR_NOMEM;f->jobs=p;f->capacity=n;}f->jobs[f->used++]=job;return UC_ERR_OK;}
static void drop(OUGC *gc,Frame *f){Frame **p=&gc->frames;while(*p&&*p!=f)p=&(*p)->next;if(*p)*p=f->next;free(f->jobs);free(f);}
static int delegate(OUGC *gc,Frame *f,uint32_t target,uint32_t object){
 int error;if(!f->entered){uint32_t saved[2]={f->r4,f->lr};error=uc_mem_write(gc->engine,f->sp-8,saved,8);if(error)return error;error=setreg(gc,UC_ARM_REG_SP,f->sp-24);if(error)return error;error=setreg(gc,UC_ARM_REG_R4,(uint32_t)(uintptr_t)f);if(error)return error;f->entered=1;}
 gc->delegates++;if((error=setreg(gc,UC_ARM_REG_R0,object)))return error;if((error=setreg(gc,UC_ARM_REG_LR,gc->resume)))return error;return setreg(gc,UC_ARM_REG_R12,target);
}
static int finish(OUGC *gc,Frame *f){int error=0;if(f->bank_kind&&((error=setreg(gc,UC_ARM_REG_R0,f->result))))return error;if(f->entered){if((error=setreg(gc,UC_ARM_REG_SP,f->sp)))return error;if((error=setreg(gc,UC_ARM_REG_R4,f->r4)))return error;if((error=setreg(gc,UC_ARM_REG_LR,f->lr)))return error;}uint32_t lr=f->lr;drop(gc,f);return setreg(gc,UC_ARM_REG_R12,lr);}
static int next_item(OUGC *gc,uint32_t object,uint32_t *next){uint32_t handle=0;int error=read32(gc,object+0xc,&handle);if(error)return error;*next=0;return handle?read32(gc,handle,next):UC_ERR_OK;}
static int first_item(OUGC *gc,uint32_t machine,uint32_t offset,uint32_t *object){uint32_t handle=0;int error=read32(gc,machine+offset,&handle);if(error)return error;*object=0;return handle?read32(gc,handle,object):UC_ERR_OK;}
static int mark_target(OUGC *gc,Frame *f,uint32_t target,uint32_t object){
 if(target==gc->bindings[3])return push(f,(Job){2,object,0,0});
 if(target==gc->bindings[4])return push(f,(Job){1,object,0,0});
 if(gc->script_inline&&target==gc->bindings[0])return push(f,(Job){17,object,0,0});
 if(gc->script_inline&&target==gc->bindings[1])return push(f,(Job){18,object,0,0});
 return -1;
}
static int drive(OUGC *gc,Frame *f){
 int error;uint32_t steps=0;
 while(f->used){if(++steps>4194304)return UC_ERR_ARG;Job j=f->jobs[--f->used];
  if(j.kind==0){uint32_t out[2]={0};gc->variants++;error=ou_guest_variant_mark(gc->engine,j.p,gc->bindings[0],gc->bindings[1],gc->bindings[2],out);if(error)return error;if(!out[1])continue;
   int queued=mark_target(gc,f,out[1],out[0]);if(queued!=-1){if(queued)return queued;continue;}
   return delegate(gc,f,out[1],out[0]);
  }
  if(j.kind==3){if(!j.n)continue;uint32_t stride=j.mask==0xffffffffu?8:16;if(j.n>1&&((error=push(f,(Job){3,j.p+stride,j.n-1,j.mask}))))return error;
   if(j.mask==0xffffffffu){if((error=push(f,(Job){0,j.p,0,0})))return error;}
   else if(j.mask==0){if((error=push(f,(Job){0,j.p,0,0})))return error;if((error=push(f,(Job){0,j.p+8,0,0})))return error;}
   else if(!(j.mask&0x80)){if((error=push(f,(Job){0,j.p,0,0})))return error;}
   else if(!(j.mask&0x100)){if((error=push(f,(Job){0,j.p+8,0,0})))return error;}
   continue;
  }
  if(j.kind==33){uint32_t count=0;if((error=read32(gc,f->lookup_object+0x1c,&count)))return error;if((int32_t)count<=(int32_t)f->lookup_index)continue;if(f->lookup_index>=1048576)return UC_ERR_ARG;uint32_t entry=f->lookup_table+f->lookup_index*16,match=0;if((error=ou_guest_variant_equal(gc->engine,entry,f->query,&match)))return error;if(match){if((error=write32(gc,f->lookup_output,f->lookup_index)))return error;f->result=entry;f->used=0;continue;}f->lookup_index++;if((error=push(f,j)))return error;continue;}
  if(j.kind==30){uint32_t name=0,node=0,head=j.p+0x18c;if((error=read32(gc,j.p+0x14c,&name)))return error;if(name==f->query){f->result=j.p;f->used=0;continue;}if((error=read32(gc,head+(j.mask?0:8),&node)))return error;if((error=push(f,(Job){31,node,head,j.mask})))return error;continue;}
  if(j.kind==31){if(j.p==j.n)continue;uint32_t object=0,vt=0,target=0;if((error=read32(gc,j.p+4,&object)))return error;if(!object)continue;if((error=read32(gc,object,&vt)))return error;if((error=read32(gc,vt+0x120,&target)))return error;if((error=push(f,(Job){32,j.p,j.n,j.mask})))return error;if(target==gc->menu_find[0]){uint32_t name=0;if((error=read32(gc,object+0x14c,&name)))return error;if(name==f->query){f->result=object;f->used=0;}continue;}if(target==gc->menu_find[1]){if((error=push(f,(Job){30,object,0,j.mask})))return error;continue;}f->awaiting=4;if((error=delegate(gc,f,target,object)))return error;if((error=setreg(gc,UC_ARM_REG_R1,f->query)))return error;return setreg(gc,UC_ARM_REG_R2,j.mask);}
  if(j.kind==32){uint32_t node=0;if((error=read32(gc,j.p+(j.mask?0:8),&node)))return error;if((error=push(f,(Job){31,node,j.n,j.mask})))return error;continue;}
  if(j.kind==27){uint8_t flags=0;if((error=uc_mem_read(gc->engine,j.p+0x180,&flags,1)))return error;flags|=8;if((error=uc_mem_write(gc->engine,j.p+0x180,&flags,1)))return error;if(j.n)continue;uint32_t node=0,head=j.p+0x18c;if((error=read32(gc,head,&node)))return error;if((error=push(f,(Job){28,node,head,0})))return error;continue;}
  if(j.kind==28){if(j.p==j.n)continue;uint32_t object=0,vt=0,target=0;if((error=read32(gc,j.p+4,&object)))return error;if(!object)continue;if((error=read32(gc,object,&vt)))return error;if((error=read32(gc,vt+0x3c,&target)))return error;if((error=push(f,(Job){29,j.p,j.n,0})))return error;if(target==gc->menu_marks[0]||target==gc->menu_marks[1]){if((error=push(f,(Job){27,object,target==gc->menu_marks[0],0})))return error;continue;}return delegate(gc,f,target,object);}
  if(j.kind==29){uint32_t next=0;if((error=read32(gc,j.p,&next)))return error;if((error=push(f,(Job){28,next,j.n,0})))return error;continue;}
  if(j.kind==17){uint32_t flags=0,module=0;if((error=read32(gc,j.p+0x2c,&flags)))return error;if(flags&8)continue;if((error=write32(gc,j.p+0x2c,flags|8)))return error;gc->script_objects++;if((error=push(f,(Job){19,j.p,0,0})))return error;if((error=read32(gc,j.p+0x18,&module)))return error;if(module&&((error=push(f,(Job){18,module,0,0}))))return error;continue;}
  if(j.kind==19){uint32_t count=0,offset=0;if((error=read32(gc,j.p+0x40,&count)))return error;if(!count)continue;if(count>1048576)return UC_ERR_ARG;if((error=read32(gc,j.p+0x68,&offset)))return error;if((error=push(f,(Job){20,j.p+0x74+offset,count,0})))return error;continue;}
  if(j.kind==20){uint32_t handle=0,child=0;if(j.n>1&&((error=push(f,(Job){20,j.p+4,j.n-1,0}))))return error;if((error=read32(gc,j.p,&handle)))return error;if((error=read32(gc,handle,&child)))return error;if((error=push(f,(Job){17,child,0,0})))return error;continue;}
  if(j.kind==18){uint32_t marked=0,handle=0,object=0,vt=0,target=0;if((error=read32(gc,j.p+0x2c,&marked)))return error;if(marked)continue;if((error=write32(gc,j.p+0x2c,1)))return error;gc->script_objects++;if((error=read32(gc,j.p+0x10,&handle)))return error;if(!handle)continue;if((error=read32(gc,handle,&object)))return error;if((error=read32(gc,object,&vt)))return error;if((error=read32(gc,vt+0x10,&target)))return error;int queued=mark_target(gc,f,target,object);if(queued!=-1){if(queued)return queued;continue;}return delegate(gc,f,target,object);}
  if(j.kind==21){if((error=push(f,(Job){22,0,0,0})))return error;if((error=delegate(gc,f,gc->module_iter[0],f->sp-24)))return error;return setreg(gc,UC_ARM_REG_R1,j.p+4);}
  if(j.kind==22||j.kind==23){f->awaiting=3;return delegate(gc,f,gc->module_iter[j.kind==22?1:2],f->sp-24);}
  if(j.kind==24)return delegate(gc,f,gc->module_iter[3],f->sp-24);
  if(j.kind==25){uint32_t refs=0,handle=0,object=0,vt=0,target=0;if((error=read32(gc,j.p+4,&refs)))return error;if(!(refs&0xffffu))continue;if((error=push(f,(Job){26,j.p,0,0})))return error;if((error=read32(gc,j.p+0x10,&handle)))return error;if((error=read32(gc,handle,&object)))return error;if((error=read32(gc,object,&vt)))return error;if((error=read32(gc,vt+0x10,&target)))return error;int queued=mark_target(gc,f,target,object);if(queued!=-1){if(queued)return queued;continue;}return delegate(gc,f,target,object);}
  if(j.kind==26){if((error=write32(gc,j.p+0x2c,1)))return error;continue;}
  if(j.kind==7){uint32_t machine=j.p,phase=j.n,object=0,target=0;double now=emscripten_get_now();if(f->phase){double ms=now-f->phase_started;gc->phase_ms[f->phase]+=ms;if(ms>gc->phase_max[f->phase])gc->phase_max[f->phase]=ms;}f->phase=phase;f->phase_started=now;
   if(phase==0){uint32_t guard=0,count=0;if((error=read32(gc,machine+0x264,&guard)))return error;if(guard)continue;if((error=read32(gc,machine+0x138,&count)))return error;if((error=write32(gc,machine+0x138,count+1)))return error;if((error=write32(gc,machine+0x264,1)))return error;for(uint32_t i=19;i>0;i--)if((error=push(f,(Job){7,machine,i,0})))return error;continue;}
   if(phase==19){if((error=write32(gc,machine+0x264,0)))return error;continue;}
   if(phase==2||phase==3||phase==4){if((error=first_item(gc,machine,phase==2?0x250:phase==3?0x254:0x258,&object)))return error;if(object&&((error=push(f,(Job){8,object,phase==4?gc->machine[1]:0,0}))))return error;continue;}
   if(phase==6||phase==7||phase==8){if((error=first_item(gc,machine,phase==6?0x250:phase==7?0x254:0x258,&object)))return error;if(object&&((error=push(f,(Job){10,object,phase==8?1:0,0}))))return error;continue;}
   if(phase==9){if((error=first_item(gc,machine,0x254,&object)))return error;if(object&&((error=push(f,(Job){11,object,0,0}))))return error;continue;}
   if(phase==12||phase==13){if((error=first_item(gc,machine,phase==12?0x25c:0x260,&object)))return error;if(object&&((error=push(f,(Job){12,object,0,0}))))return error;continue;}
   if(phase==5){if((error=push(f,(Job){13,0,0,0})))return error;if((error=delegate(gc,f,gc->machine[12],f->sp-24)))return error;return setreg(gc,UC_ARM_REG_R1,machine+0xb0);}
   if(phase==1&&gc->script_inline){if((error=read32(gc,machine+0x94,&object)))return error;if((error=push(f,(Job){21,object,0,0})))return error;continue;}
   if(phase==11){f->awaiting=1;return delegate(gc,f,gc->machine[6],machine);}
   uint32_t offset=phase==1||phase==10?0x94:phase==14?0x98:phase==15?0xa0:phase==16?0xa8:phase==17?0xa4:0xac;
   if((error=read32(gc,machine+offset,&object)))return error;target=phase==1?gc->machine[0]:phase==10?gc->machine[5]:phase==14?gc->machine[7]:phase==15?gc->machine[8]:phase==16?gc->machine[9]:phase==17?gc->machine[10]:gc->machine[11];if(phase!=1)f->awaiting=1;return delegate(gc,f,target,object);
  }
  if(j.kind==8){uint32_t refs=0;if((error=read32(gc,j.p+4,&refs)))return error;if(!(refs&0xffffu)){uint32_t next=0;if((error=next_item(gc,j.p,&next)))return error;if(next&&((error=push(f,(Job){8,next,j.n,0}))))return error;continue;}
   if((error=push(f,(Job){9,j.p,j.n,0})))return error;uint32_t target=j.n;if(!target){uint32_t vt=0;if((error=read32(gc,j.p,&vt)))return error;if((error=read32(gc,vt+0x10,&target)))return error;}
   int queued=mark_target(gc,f,target,j.p);if(queued!=-1){if(queued)return queued;continue;}return delegate(gc,f,target,j.p);
  }
  if(j.kind==9){uint32_t next=0;if((error=next_item(gc,j.p,&next)))return error;if(next&&((error=push(f,(Job){8,next,j.n,0}))))return error;continue;}
  if(j.kind==10){uint32_t next=0,flags=0,offset=j.n?0x2c:0x14,mask=j.n?8:0x820;if((error=next_item(gc,j.p,&next)))return error;if(next&&((error=push(f,(Job){10,next,j.n,0}))))return error;if((error=read32(gc,j.p+offset,&flags)))return error;
   if(flags&mask){if((error=write32(gc,j.p+offset,flags&~(j.n?8u:0x20u))))return error;continue;}
   if((error=delegate(gc,f,gc->machine[j.n?4:3],f->sp-24)))return error;return setreg(gc,UC_ARM_REG_R1,j.p);
  }
  if(j.kind==11||j.kind==12){uint32_t next=0,vt=0,target=0;if((error=next_item(gc,j.p,&next)))return error;if(next&&((error=push(f,(Job){j.kind,next,0,0}))))return error;if((error=read32(gc,j.p,&vt)))return error;if((error=read32(gc,vt+(j.kind==11?0x14:8),&target)))return error;if(j.kind==12)f->result++;return delegate(gc,f,target,j.p);}
  if(j.kind==13||j.kind==14){f->awaiting=2;return delegate(gc,f,gc->machine[j.kind==13?13:14],f->sp-24);}
  if(j.kind==15)return delegate(gc,f,gc->machine[15],f->sp-24);
  if(j.kind==16){uint32_t refs=0;if((error=read32(gc,j.p+4,&refs)))return error;if(refs&0xffffu)return delegate(gc,f,gc->machine[2],j.p);continue;}
  if(j.kind==4){uint32_t table=0,buckets=0;if((error=read32(gc,f->bank+(f->bank_kind==3?4:0),&table)))return error;if(!table)continue;if((error=read32(gc,f->bank+(f->bank_kind==3?8:4),&buckets)))return error;if((int32_t)buckets<=0||j.n>=buckets)continue;if(buckets>1048576)return UC_ERR_ARG;
   if((error=push(f,(Job){4,0,j.n+1,0})))return error;uint32_t head=0,slot=table+j.n*4;if((error=read32(gc,slot,&head)))return error;if(head&&((error=push(f,(Job){5,slot,head,0}))))return error;continue;
  }
  if(j.kind==5){uint32_t object=0,next=0,refs=0,marked=0;if((error=read32(gc,j.n,&object)))return error;if((error=read32(gc,object+0x14,&next)))return error;if((error=read32(gc,object+4,&refs)))return error;if((error=read32(gc,object+0x18,&marked)))return error;
   if((refs&0xffffu)||marked){if((error=write32(gc,object+0x18,0)))return error;if(next&&((error=push(f,(Job){5,j.p,next,j.n}))))return error;continue;}
   if(!j.mask){if((error=write32(gc,j.p,next)))return error;}else{uint32_t previous=0;if((error=read32(gc,j.mask,&previous)))return error;if((error=write32(gc,previous+0x14,next)))return error;}
   if(next&&((error=push(f,(Job){5,j.p,next,j.mask}))))return error;f->result++;uint32_t vt=0,target=0;if((error=read32(gc,object,&vt)))return error;
   if(f->bank_kind==4){uint32_t machine=0;if((error=read32(gc,f->bank+8,&machine)))return error;if((error=push(f,(Job){6,machine+0x1c8,object,0})))return error;if((error=read32(gc,vt,&target)))return error;}
   else if((error=read32(gc,vt+8,&target)))return error;
   return delegate(gc,f,target,object);
  }
  if(j.kind==6){uint32_t vt=0,target=0;if((error=read32(gc,j.p,&vt)))return error;if((error=read32(gc,vt+4,&target)))return error;if((error=delegate(gc,f,target,f->sp-24)))return error;if((error=setreg(gc,UC_ARM_REG_R1,j.p)))return error;return setreg(gc,UC_ARM_REG_R2,j.n);}
  uint32_t flags=0,n=0;if((error=read32(gc,j.p+0x14,&flags)))return error;if(flags&0x20)continue;if((error=write32(gc,j.p+0x14,flags|0x20)))return error;gc->containers++;
  if((error=read32(gc,j.p+(j.kind==1?0x18:0x1c),&n)))return error;if(!n)continue;if(n>1048576)return UC_ERR_ARG;
  if(j.kind==1){if((error=push(f,(Job){3,j.p+0x20,n,0xffffffffu})))return error;continue;}
  uint32_t vt=0,getter=0;if((error=read32(gc,j.p,&vt)))return error;if((error=read32(gc,vt+0x70,&getter)))return error;uint32_t offset=0;
  for(uint32_t i=0;i<5;i++)if(getter==gc->bindings[5+i]){offset=i==3?0x24:i==4?0x2c:0x20;break;}
  if(offset){if((error=push(f,(Job){3,j.p+offset,n,flags&0x180})))return error;}
  else{f->entry_n=n;f->entry_mask=flags&0x180;return delegate(gc,f,getter,j.p);}
 }
 return finish(gc,f);
}
OUGC *ou_gc_create(uc_engine *engine,const uint32_t bindings[10],uint32_t resume){OUGC *gc=calloc(1,sizeof(*gc));if(gc){gc->engine=engine;memcpy(gc->bindings,bindings,sizeof(gc->bindings));gc->resume=resume;}return gc;}
int ou_gc_enter(OUGC *gc,uint32_t object,uint32_t kind){if(!gc||kind<1||kind>10)return UC_ERR_ARG;if(kind==9){uint8_t flags=0;uint32_t lr=0;int e=uc_mem_read(gc->engine,object+0x180,&flags,1);if(e)return e;flags|=8;if((e=uc_mem_write(gc->engine,object+0x180,&flags,1)))return e;if((e=reg(gc,UC_ARM_REG_LR,&lr)))return e;return setreg(gc,UC_ARM_REG_R12,lr);}Frame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->next=gc->frames;gc->frames=f;int error=reg(gc,UC_ARM_REG_SP,&f->sp);if(!error)error=reg(gc,UC_ARM_REG_LR,&f->lr);if(!error)error=reg(gc,UC_ARM_REG_R4,&f->r4);if(kind>=3&&kind<=5){f->bank=object;f->bank_kind=kind;}if(!error)error=push(f,(Job){kind>=9?27:kind==8?21:kind==7?18:kind==6?17:kind==5?7:kind>=3?4:kind,object,kind==9?1:0,0});if(error){drop(gc,f);return error;}return drive(gc,f);}
int ou_gc_continue(OUGC *gc){if(!gc)return UC_ERR_ARG;uint32_t id=0,sp=0;int error=reg(gc,UC_ARM_REG_R4,&id);if(error)return error;Frame *f=gc->frames;while(f&&(uint32_t)(uintptr_t)f!=id)f=f->next;if(!f)return UC_ERR_ARG;if((error=reg(gc,UC_ARM_REG_SP,&sp)))return error;if(sp!=f->sp-24)return UC_ERR_ARG;
 if(f->awaiting){uint32_t result=0;if((error=reg(gc,UC_ARM_REG_R0,&result)))return error;uint32_t action=f->awaiting;f->awaiting=0;if(action==5)f->lookup_table=result;else if(action==4){if(result){f->result=result;f->used=0;}}else if(action==1)f->result+=result;else if(action==3){if(result){if((error=push(f,(Job){23,0,0,0})))return error;if((error=push(f,(Job){25,result,0,0})))return error;}else if((error=push(f,(Job){24,0,0,0})))return error;}else if(result){if((error=push(f,(Job){14,0,0,0})))return error;if((error=push(f,(Job){16,result,0,0})))return error;}else if((error=push(f,(Job){15,0,0,0})))return error;}
 if(f->entry_n){uint32_t p=0;if((error=reg(gc,UC_ARM_REG_R0,&p)))return error;if((error=push(f,(Job){3,p,f->entry_n,f->entry_mask})))return error;f->entry_n=0;}return drive(gc,f);}
uint32_t ou_gc_count(OUGC *gc,uint32_t index){if(!gc)return 0;if(index==0)return gc->containers;if(index==1)return gc->variants;if(index==2)return gc->delegates;if(index==4)return gc->script_objects;uint32_t n=0;for(Frame *f=gc->frames;f;f=f->next)n++;return n;}
void ou_gc_destroy(OUGC *gc){if(!gc)return;while(gc->frames)drop(gc,gc->frames);free(gc);}

void ou_gc_bind_machine(OUGC *gc,const uint32_t callbacks[16]){if(gc)memcpy(gc->machine,callbacks,sizeof(gc->machine));}

double ou_gc_phase_ms(OUGC *gc,uint32_t index,uint32_t maximum){return gc&&index<20?(maximum?gc->phase_max[index]:gc->phase_ms[index]):0;}
void ou_gc_phase_reset(OUGC *gc){if(gc){memset(gc->phase_ms,0,sizeof(gc->phase_ms));memset(gc->phase_max,0,sizeof(gc->phase_max));}}

void ou_gc_bind_script_marks(OUGC *gc,const uint32_t iterators[4]){memcpy(gc->module_iter,iterators,sizeof(gc->module_iter));gc->script_inline=1;}
void ou_gc_script_marks_enable(OUGC *gc,uint32_t enabled){if(gc)gc->script_inline=enabled;}

void ou_gc_bind_menu_marks(OUGC *gc,const uint32_t targets[2]){memcpy(gc->menu_marks,targets,sizeof(gc->menu_marks));}

void ou_gc_bind_menu_find(OUGC *gc,const uint32_t targets[2]){memcpy(gc->menu_find,targets,sizeof(gc->menu_find));}
int ou_menu_find(OUGC *gc,uint32_t object,uint32_t query,uint32_t recursive){if(!gc)return UC_ERR_ARG;int e;uint32_t name=0,node=0,head=object+0x18c,lr=0;if((e=read32(gc,object+0x14c,&name)))return e;if((e=reg(gc,UC_ARM_REG_LR,&lr)))return e;if(name==query){if((e=setreg(gc,UC_ARM_REG_R0,object)))return e;return setreg(gc,UC_ARM_REG_R12,lr);}uint32_t direction=recursive?1:0;if((e=read32(gc,head+(direction?0:8),&node)))return e;if(node==head){if((e=setreg(gc,UC_ARM_REG_R0,0)))return e;return setreg(gc,UC_ARM_REG_R12,lr);}Frame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->next=gc->frames;gc->frames=f;f->query=query;f->bank_kind=6;f->lr=lr;if((e=reg(gc,UC_ARM_REG_SP,&f->sp)))return e;if((e=reg(gc,UC_ARM_REG_R4,&f->r4)))return e;if((e=push(f,(Job){31,node,head,direction})))return e;return drive(gc,f);}

int ou_assoc_find(OUGC *gc,uint32_t object,uint32_t key,uint32_t index_output){if(!gc)return UC_ERR_ARG;int e;uint32_t count=0,lr=0,vt=0,target=0;if((e=read32(gc,object+0x1c,&count)))return e;if((e=reg(gc,UC_ARM_REG_LR,&lr)))return e;if(!count){if((e=setreg(gc,UC_ARM_REG_R0,0)))return e;return setreg(gc,UC_ARM_REG_R12,lr);}if((e=read32(gc,object,&vt)))return e;if((e=read32(gc,vt+0x70,&target)))return e;Frame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->next=gc->frames;gc->frames=f;f->query=key;f->lookup_object=object;f->lookup_output=index_output;f->bank_kind=6;f->lr=lr;f->awaiting=5;if((e=reg(gc,UC_ARM_REG_SP,&f->sp)))return e;if((e=reg(gc,UC_ARM_REG_R4,&f->r4)))return e;if((e=push(f,(Job){33,0,0,0})))return e;return delegate(gc,f,target,object);}
