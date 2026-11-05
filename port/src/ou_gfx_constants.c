/* Original Gfx::Program::UpdateConstants (ARM 0x37f124), with the same
 * float32 comparisons, generation stamps, upload order and post-call flags.
 * GL callbacks still execute through their original guest import bindings. */
#include "ou_gfx_constants.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <unicorn/arm.h>
#include "fpu/softfloat-types.h"
extern float32 float32_mul_arm(float32,float32,float_status *);
extern float32 float32_add_arm(float32,float32,float_status *);
typedef struct GfxFrame {struct GfxFrame *next;uint32_t program,index,clear,sp,lr,r4,entered,mode,stage,unit,texture,manager_arg,cache_offset,matrix_args[4];} GfxFrame;
struct OUGfxConstants {uc_engine *engine;uint32_t resume,bindings[6],state[5],matrix[3],calls,state_calls;GfxFrame *frames;};
static float number(uint32_t bits){float f;memcpy(&f,&bits,4);return f;}
static int read32(OUGfxConstants *g,uint32_t p,uint32_t *v){return uc_mem_read(g->engine,p,v,4);}
static int write32(OUGfxConstants *g,uint32_t p,uint32_t v){return uc_mem_write(g->engine,p,&v,4);}
static int reg(OUGfxConstants *g,int id,uint32_t *v){return uc_reg_read(g->engine,id,v);}
static int setreg(OUGfxConstants *g,int id,uint32_t v){return uc_reg_write(g->engine,id,&v);}
static int set_value(OUGfxConstants *g,uint32_t manager,uint32_t destination,const uint32_t *source,uint32_t bytes){
 int e;uint32_t stamp;uint8_t dirty=1;if((e=read32(g,manager+0xb28,&stamp)))return e;
 if((e=uc_mem_write(g->engine,destination,source,bytes)))return e;
 if((e=write32(g,manager+0xb28,stamp+1)))return e;
 if((e=write32(g,destination+bytes,stamp)))return e;
 return uc_mem_write(g->engine,destination+bytes+4,&dirty,1);
}
static int prepare(OUGfxConstants *g,uint32_t program){
 int e;uint32_t manager=0,p[0x13c0/4],m[0xb2c/4];
 if((e=read32(g,g->bindings[0],&manager)))return e;
 if((e=uc_mem_read(g->engine,program,p,sizeof(p))))return e;
 if((e=uc_mem_read(g->engine,manager,m,sizeof(m))))return e;
 for(uint32_t i=0;i<39;i++){
  uint32_t a=(0x48+i*24)/4,b=(0x5e0+i*24)/4;
  if((int32_t)p[0x1318/4+i]<0||p[a+4]>=m[b+4])continue;
  int equal=1;for(uint32_t k=0;k<4;k++)if(number(p[a+k])!=number(m[b+k])){equal=0;break;}
  if(!equal&&((e=set_value(g,manager,program+a*4,m+b,16))))return e;
 }
 for(uint32_t i=0;i<2;i++){
  uint32_t a=(0x30+i*12)/4,b=(0x5c8+i*12)/4;
  if((int32_t)p[0x1310/4+i]>=0&&p[a+1]<m[b+1]){
   float difference=number(p[a])-number(m[b]);
   if(fabsf(difference)>number(g->bindings[4])&&((e=set_value(g,manager,program+a*4,m+b,4))))return e;
  }
 }
 for(uint32_t i=0;i<3;i++){
  uint32_t a=(0x3f0+i*72)/4,b=(0x988+i*72)/4;
  if((int32_t)p[0x13b4/4+i]<0||p[a+16]>=m[b+16])continue;
  int equal=1;
  for(uint32_t row=0;row<4;row++){
   float d=number(m[b+row*4])-number(p[a+row*4]);float sum=d*d;
   for(uint32_t k=1;k<4;k++){d=number(m[b+row*4+k])-number(p[a+row*4+k]);float square=d*d;sum=sum+square;}
   /* Original BGE treats an unordered comparison as approximately equal. */
   if(sum>=number(g->bindings[5])){equal=0;break;}
  }
  if(!equal&&((e=set_value(g,manager,program+a*4,m+b,64))))return e;
 }
 return 0;
}
static void drop(OUGfxConstants *g,GfxFrame *f){GfxFrame **p=&g->frames;while(*p&&*p!=f)p=&(*p)->next;if(*p)*p=f->next;free(f);}
static int finish_frame(OUGfxConstants *g,GfxFrame *f){int e;uint32_t lr=f->lr;if(f->entered){if((e=setreg(g,UC_ARM_REG_SP,f->sp)))return e;if((e=setreg(g,UC_ARM_REG_R4,f->r4)))return e;if((e=setreg(g,UC_ARM_REG_LR,f->lr)))return e;}drop(g,f);return setreg(g,UC_ARM_REG_R12,lr);}
static int state_delegate(OUGfxConstants *g,GfxFrame *f,uint32_t target,uint32_t a,uint32_t b){int e;if(!f->entered){uint32_t saved[2]={f->r4,f->lr};if((e=uc_mem_write(g->engine,f->sp-8,saved,8)))return e;if((e=setreg(g,UC_ARM_REG_SP,f->sp-8)))return e;if((e=setreg(g,UC_ARM_REG_R4,(uint32_t)(uintptr_t)f)))return e;f->entered=1;}if((e=setreg(g,UC_ARM_REG_R0,a)))return e;if((e=setreg(g,UC_ARM_REG_R1,b)))return e;if((e=setreg(g,UC_ARM_REG_LR,g->resume)))return e;return setreg(g,UC_ARM_REG_R12,target);}
static int texture_drive(OUGfxConstants *g,GfxFrame *f){int e;if(f->stage==0){f->stage=1;return state_delegate(g,f,g->state[1],f->manager_arg,f->unit);}if(f->stage==1){f->stage=2;return state_delegate(g,f,g->state[4],0xde1,f->texture);}uint32_t cache=0;if((e=read32(g,g->state[0],&cache)))return e;if((e=write32(g,cache+f->cache_offset,f->texture)))return e;return finish_frame(g,f);}
/* Reuse the pinned ARM SoftFloat implementation, including rounding, flush,
 * NaN propagation and exception flags. This avoids a second math convention. */
static void matrix_product(uint32_t out[16],const uint32_t a[16],const uint32_t b[16],float_status *status){
 for(uint32_t row=0;row<4;row++)for(uint32_t column=0;column<4;column++){uint32_t value=float32_mul_arm(a[row*4],b[column],status);for(uint32_t k=1;k<4;k++)value=float32_add_arm(value,float32_mul_arm(a[row*4+k],b[k*4+column],status),status);out[row*4+column]=value;}
}
static int matrix_delegate(OUGfxConstants *g,GfxFrame *f,uint32_t target,const uint32_t args[4]){
 int e;if(!f->entered){uint32_t saved[2]={f->r4,f->lr};if((e=uc_mem_write(g->engine,f->sp-8,saved,8)))return e;if((e=setreg(g,UC_ARM_REG_SP,f->sp-96)))return e;if((e=setreg(g,UC_ARM_REG_R4,(uint32_t)(uintptr_t)f)))return e;f->entered=1;}
 const int ids[4]={UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3};for(uint32_t i=0;i<4;i++)if((e=setreg(g,ids[i],args[i])))return e;if((e=setreg(g,UC_ARM_REG_LR,g->resume)))return e;return setreg(g,UC_ARM_REG_R12,target);
}
static int matrix_drive(OUGfxConstants *g,GfxFrame *f){
 int e;uint32_t *a=f->matrix_args,args[4]={0};
 if(f->stage==0){f->stage=1;return matrix_delegate(g,f,g->matrix[0],a);}
 if(f->stage==1){uint32_t cache=0;if((e=read32(g,g->state[0],&cache)))return e;for(uint32_t i=0;i<16;i++){uint32_t value;if((e=read32(g,a[2]+i*4,&value)))return e;if((e=write32(g,cache+0x40+a[1]*64+i*4,value)))return e;}f->stage=2;if(a[1]<2){args[0]=a[0];args[1]=a[1]==0?1:2;args[2]=a[2];return matrix_delegate(g,f,g->matrix[1],args);}}
 if(f->stage==2){uint32_t m[48],temp[16],out[16],fpscr=0;if((e=uc_mem_read(g->engine,a[0]+0xc,m,sizeof(m))))return e;if((e=reg(g,UC_ARM_REG_FPSCR,&fpscr)))return e;float_status status={0};const signed char rounds[4]={0,2,1,3};status.float_detect_tininess=float_tininess_before_rounding;status.float_rounding_mode=rounds[(fpscr>>22)&3];status.flush_to_zero=status.flush_inputs_to_zero=(fpscr>>24)&1;status.default_nan_mode=(fpscr>>25)&1;matrix_product(temp,m,m+16,&status);matrix_product(out,temp,m+32,&status);uint32_t flags=status.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1);if((e=setreg(g,UC_ARM_REG_FPSCR,fpscr|raised)))return e;if((e=uc_mem_write(g->engine,f->sp-80,out,64)))return e;f->stage=3;args[0]=a[0];args[1]=0;args[2]=f->sp-80;return matrix_delegate(g,f,g->matrix[1],args);}
 if((e=setreg(g,UC_ARM_REG_R0,1)))return e;return finish_frame(g,f);
}
void ou_gfx_matrix_bind(OUGfxConstants *g,const uint32_t targets[3]){if(g)memcpy(g->matrix,targets,12);}
int ou_gfx_matrix_enter(OUGfxConstants *g,const uint32_t args[4]){
 if(!g)return UC_ERR_ARG;int e;uint32_t fpscr=0;if((e=reg(g,UC_ARM_REG_FPSCR,&fpscr)))return e;
 if(args[1]>2||(fpscr&((7u<<16)|(3u<<20)|0x1f00u)))return setreg(g,UC_ARM_REG_R12,g->matrix[2]);
 GfxFrame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->mode=2;memcpy(f->matrix_args,args,16);f->next=g->frames;g->frames=f;if((e=reg(g,UC_ARM_REG_SP,&f->sp)))return e;if((e=reg(g,UC_ARM_REG_LR,&f->lr)))return e;if((e=reg(g,UC_ARM_REG_R4,&f->r4)))return e;g->state_calls++;return matrix_drive(g,f);
}
/* Original UniformMatrix::SetValue performs sequential word copies, with its
 * manager/stamp reads after words2/4. Preserve overlapping-buffer behavior. */
int ou_gfx_matrix_value(OUGfxConstants *g,uint32_t destination,uint32_t source){
 if(!g)return UC_ERR_ARG;int e;uint32_t manager=0,stamp=0;for(uint32_t i=0;i<16;i++){uint32_t value;if((e=read32(g,source+i*4,&value)))return e;if((e=write32(g,destination+i*4,value)))return e;if(i==2&&((e=read32(g,g->bindings[0],&manager))))return e;if(i==4&&((e=read32(g,manager+0xb28,&stamp))))return e;}
 if((e=write32(g,manager+0xb28,stamp+1)))return e;if((e=write32(g,destination+0x40,stamp)))return e;uint8_t dirty=1;g->state_calls++;return uc_mem_write(g->engine,destination+0x44,&dirty,1);
}
static int drive(OUGfxConstants *g,GfxFrame *f){
 if(f->mode==1)return texture_drive(g,f);
 if(f->mode==2)return matrix_drive(g,f);
 int e;uint8_t zero=0;if(f->clear){if((e=uc_mem_write(g->engine,f->clear,&zero,1)))return e;f->clear=0;}
 while(f->index<44){
  uint32_t i=f->index++,value,flag,location,target,pointer_arg=2;uint8_t dirty;
  if(i<39){value=f->program+0x48+i*24;flag=value+20;location=f->program+0x1318+i*4;target=g->bindings[1];}
  else if(i<41){value=f->program+0x30+(i-39)*12;flag=value+8;location=f->program+0x1310+(i-39)*4;target=g->bindings[2];}
  else{value=f->program+0x3f0+(i-41)*72;flag=value+68;location=f->program+0x13b4+(i-41)*4;target=g->bindings[3];pointer_arg=3;}
  if((e=uc_mem_read(g->engine,flag,&dirty,1)))return e;if(!dirty)continue;
  uint32_t id;if((e=read32(g,location,&id)))return e;
  if(!f->entered){uint32_t saved[2]={f->r4,f->lr};if((e=uc_mem_write(g->engine,f->sp-8,saved,8)))return e;if((e=setreg(g,UC_ARM_REG_SP,f->sp-8)))return e;if((e=setreg(g,UC_ARM_REG_R4,(uint32_t)(uintptr_t)f)))return e;f->entered=1;}
  f->clear=flag;if((e=setreg(g,UC_ARM_REG_R0,id)))return e;if((e=setreg(g,UC_ARM_REG_R1,1)))return e;
  if((e=setreg(g,UC_ARM_REG_R2,pointer_arg==2?value:0)))return e;
  if(pointer_arg==3&&((e=setreg(g,UC_ARM_REG_R3,value))))return e;
  if((e=setreg(g,UC_ARM_REG_LR,g->resume)))return e;return setreg(g,UC_ARM_REG_R12,target);
 }
 uint32_t lr=f->lr;if(f->entered){if((e=setreg(g,UC_ARM_REG_SP,f->sp)))return e;if((e=setreg(g,UC_ARM_REG_R4,f->r4)))return e;if((e=setreg(g,UC_ARM_REG_LR,f->lr)))return e;}drop(g,f);return setreg(g,UC_ARM_REG_R12,lr);
}
OUGfxConstants *ou_gfx_constants_create(uc_engine *engine,uint32_t resume,const uint32_t bindings[6]){OUGfxConstants *g=calloc(1,sizeof(*g));if(g){g->engine=engine;g->resume=resume;memcpy(g->bindings,bindings,sizeof(g->bindings));}return g;}
int ou_gfx_constants_enter(OUGfxConstants *g,uint32_t program){if(!g)return UC_ERR_ARG;int e=prepare(g,program);if(e)return e;GfxFrame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->program=program;f->next=g->frames;g->frames=f;
 if((e=reg(g,UC_ARM_REG_SP,&f->sp)))return e;if((e=reg(g,UC_ARM_REG_LR,&f->lr)))return e;if((e=reg(g,UC_ARM_REG_R4,&f->r4)))return e;g->calls++;return drive(g,f);
}
int ou_gfx_constants_continue(OUGfxConstants *g){if(!g)return UC_ERR_ARG;uint32_t id=0,sp=0;int e=reg(g,UC_ARM_REG_R4,&id);if(e)return e;GfxFrame *f=g->frames;while(f&&(uint32_t)(uintptr_t)f!=id)f=f->next;if(!f)return UC_ERR_ARG;if((e=reg(g,UC_ARM_REG_SP,&sp)))return e;if(sp!=f->sp-(f->mode==2?96:8))return UC_ERR_ARG;return drive(g,f);}
uint32_t ou_gfx_constants_count(OUGfxConstants *g){return g?g->calls:0;}
void ou_gfx_constants_destroy(OUGfxConstants *g){if(g){while(g->frames)drop(g,g->frames);free(g);}}

/* Integer render queues and float32 constant assignment, selected from the
 * measured ARM block profile. These routines do not call guest callbacks. */
int ou_gfx_constants_pure(OUGfxConstants *g,uint32_t kind,uint32_t values[4]){
 if(!g)return UC_ERR_ARG;int e;uint32_t object=values[0];
 if(kind==0){
  uint32_t source[4],old[4],destination=object+0x5e0+values[1]*24,manager=0;
  if((e=uc_mem_read(g->engine,values[2],source,16)))return e;if((e=uc_mem_read(g->engine,destination,old,16)))return e;
  int equal=1;for(uint32_t i=0;i<4;i++)if(number(source[i])!=number(old[i])){equal=0;break;}
  if(equal)return 0;if((e=read32(g,g->bindings[0],&manager)))return e;return set_value(g,manager,destination,source,16);
 }
 if(kind==1){
  uint32_t heads=0;if((e=read32(g,object+0x14,&heads)))return e;values[0]=0;if(!heads)return 0;
  for(uint32_t list=0;list<2;list++){
   uint32_t head=heads+list*12,node=0;if((e=read32(g,head,&node)))return e;
   uint32_t count=0;while(node!=head){if(++count>1048576)return UC_ERR_ARG;uint32_t pair[2],checksum=0;if((e=uc_mem_read(g->engine,node,pair,8)))return e;if(!pair[1])break;if((e=read32(g,pair[1]+0x1c,&checksum)))return e;if(checksum==values[1]){values[0]=pair[1];return 0;}node=pair[0];}
  }return 0;
 }
 if(kind==2){
  uint32_t fields[4];if((e=uc_mem_read(g->engine,object,fields,16)))return e;uint32_t total=fields[2]+fields[3];if(!fields[2]||!total||total>1048576)return UC_ERR_ARG;
  uint32_t nodes[512];for(uint32_t first=0;first<total;){uint32_t count=total-first;if(count>256)count=256;for(uint32_t i=0;i<count;i++){uint32_t n=first+i;nodes[i*2]=0;nodes[i*2+1]=n+1==total?0:fields[0]+(n+1)*8;}if((e=uc_mem_write(g->engine,fields[0]+first*8,nodes,count*8)))return e;first+=count;}
  if((e=write32(g,object+4,fields[0]+fields[2]*8)))return e;return write32(g,fields[0]+fields[2]*8-4,0);
 }
 if(kind==3){
  uint32_t node=0;if((e=read32(g,object,&node)))return e;
  for(uint32_t i=0;i<1048576;i++){if((e=read32(g,node+4,&node)))return e;if(!node){values[0]=0;return write32(g,object,0);}uint32_t value=0;if((e=read32(g,node,&value)))return e;if(value){values[0]=value;return write32(g,object,node);}}
  return UC_ERR_ARG;
 }
 if(kind==4){uint32_t a[16],b[16];if((e=uc_mem_read(g->engine,values[0],a,64)))return e;if((e=uc_mem_read(g->engine,values[1],b,64)))return e;values[0]=1;for(uint32_t row=0;row<4;row++){float d=number(a[row*4])-number(b[row*4]),sum=d*d;for(uint32_t k=1;k<4;k++){d=number(a[row*4+k])-number(b[row*4+k]);float square=d*d;sum=sum+square;}if(sum>=number(g->bindings[5])){values[0]=0;break;}}return 0;}
 if(kind==5){uint32_t head=object+0x5a4,node=0;if((e=read32(g,head,&node)))return e;values[0]=0;for(uint32_t count=0;node!=head;count++){if(count>=1048576)return UC_ERR_ARG;uint32_t pair[2],crc=0;if((e=uc_mem_read(g->engine,node,pair,8)))return e;if(!pair[1])return 0;if((e=read32(g,pair[1]+0x20,&crc)))return e;if(crc==values[1]){values[0]=pair[1];return 0;}node=pair[0];}return 0;}
 return UC_ERR_ARG;
}

void ou_gfx_state_bind(OUGfxConstants *g,const uint32_t targets[5]){memcpy(g->state,targets,sizeof(g->state));}
uint32_t ou_gfx_state_count(OUGfxConstants *g,uint32_t active){if(!g)return 0;if(!active)return g->state_calls;uint32_t n=0;for(GfxFrame *f=g->frames;f;f=f->next)n++;return n;}
int ou_gfx_state_tail(OUGfxConstants *g,uint32_t kind,uint32_t values[4]){if(!g||kind)return UC_ERR_ARG;int e;uint32_t target=0;if((e=reg(g,UC_ARM_REG_LR,&target)))return e;g->state_calls++;if(values[1]<=15){uint32_t cache=0;if((e=read32(g,g->state[0],&cache)))return e;uint8_t old=0;if((e=uc_mem_read(g->engine,cache+0x378+values[1],&old,1)))return e;values[0]=old;if(old!=values[2]){uint8_t next=(uint8_t)values[2];if((e=uc_mem_write(g->engine,cache+0x378+values[1],&next,1)))return e;values[0]=values[1];target=g->state[values[2]?2:3];}}return setreg(g,UC_ARM_REG_R12,target);}
int ou_gfx_state_texture(OUGfxConstants *g,uint32_t values[4]){if(!g)return UC_ERR_ARG;int e;uint32_t cache=0,units=0,old=0,lr=0,offset=(values[1]+0x46)*4+4;g->state_calls++;if((e=reg(g,UC_ARM_REG_LR,&lr)))return e;if((e=read32(g,g->state[0],&cache)))return e;if((e=read32(g,cache+0x114,&units)))return e;if((int32_t)units<=(int32_t)values[1])return setreg(g,UC_ARM_REG_R12,lr);if((e=read32(g,cache+offset,&old)))return e;if(old==values[2]){if((e=read32(g,g->state[0],&cache)))return e;if((e=write32(g,cache+offset,values[2])))return e;return setreg(g,UC_ARM_REG_R12,lr);}GfxFrame *f=calloc(1,sizeof(*f));if(!f)return UC_ERR_NOMEM;f->mode=1;f->unit=values[1];f->texture=values[2];f->manager_arg=values[0];f->cache_offset=offset;f->lr=lr;f->next=g->frames;g->frames=f;if((e=reg(g,UC_ARM_REG_SP,&f->sp)))return e;if((e=reg(g,UC_ARM_REG_R4,&f->r4)))return e;return texture_drive(g,f);}


/* Original bind_bones stack preparation. Every call initializes all 56
 * matrices, then copies selected bone matrices over that buffer. Batch only
 * disjoint layouts; aliases and unusual loop entries stay in original ARM. */
static int bone_overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
int ou_guest_bone_matrices(uc_engine *e,const uint32_t args[4],uint32_t *handled,uint32_t *copied){
 *handled=0;*copied=0;uint32_t sp=0,identity=0,zero=0,base=0,cpsr=0;uint16_t count=0;int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;
 if((sp&3)||bone_overlap(args[0]+0x5c,2,sp,0xe00))return 0;
 if((error=uc_mem_read(e,args[0]+0x5c,&count,2)))return error;if(count>56||bone_overlap(args[0]+0x64,count,sp,0xe00))return 0;
 if(count){if(bone_overlap(args[1]+0x88,4,sp,0xe00))return 0;if((error=uc_mem_read(e,args[1]+0x88,&base,4)))return error;if(base&3)return 0;}
 uint32_t matrices[56][16];uint8_t indices[56];if(count&&((error=uc_mem_read(e,args[0]+0x64,indices,count))))return error;
 if((error=uc_reg_read(e,UC_ARM_REG_S14,&identity)))return error;if((error=uc_reg_read(e,UC_ARM_REG_S15,&zero)))return error;
 for(unsigned i=0;i<56;i++)for(unsigned k=0;k<16;k++)matrices[i][k]=(k%5)==0?identity:zero;
 for(unsigned i=0;i<count;i++){uint32_t source=base+(uint32_t)indices[i]*0x140+0xa0;if(bone_overlap(source,64,sp,0xe00))return 0;if((error=uc_mem_read(e,source,matrices[i],64)))return error;}
 if((error=uc_mem_write(e,sp,matrices,sizeof(matrices))))return error;
 uint32_t n=count;if((error=uc_reg_write(e,UC_ARM_REG_R6,args+2)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R3,&sp)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R2,&n)))return error;
 if(count){uint32_t end=sp+count*64;if((error=uc_reg_write(e,UC_ARM_REG_R4,&end)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R5,&base)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S15,&matrices[count-1][15])))return error;}
 if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;*copied=count;return 0;
}
