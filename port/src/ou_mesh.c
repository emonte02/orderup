/* Original GLES2 mesh attribute setup. Only the standard deferred, void GL
 * bindings use this batch; custom graphics, aliases and disabled batching
 * execute the original function, retaining callback mutation behavior. */
#include <stdint.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include "ou_gl_batch.h"
static uint32_t word(const uint8_t *p){uint32_t v;memcpy(&v,p,4);return v;}
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
typedef struct {uint32_t id,args[6];} Command;
typedef struct {Command calls[64];uint32_t used,ids[3];uint8_t enabled[16];} Plan;
static void enable(Plan *p,uint32_t unit,uint32_t value){if(unit<16&&p->enabled[unit]!=value){p->enabled[unit]=(uint8_t)value;Command *c=p->calls+p->used++;memset(c,0,sizeof(*c));c->id=p->ids[value?0:1];c->args[0]=unit;}}
static void attribute(Plan *p,uint32_t unit,uint32_t count,uint32_t type,uint32_t stride,uint32_t offset){enable(p,unit,1);Command *c=p->calls+p->used++;c->id=p->ids[2];c->args[0]=unit;c->args[1]=count;c->args[2]=type;c->args[3]=0;c->args[4]=stride;c->args[5]=offset;}
int ou_guest_mesh_buffers(uc_engine *e,OUGLBatch *batch,uint32_t mesh,uint32_t cache_slot,const uint32_t targets[3],uint32_t *handled){
 *handled=0;Plan plan={0};if(!batch||!ou_gl_batch_attribute_plan(batch,targets,plan.ids,64))return 0;int error;uint32_t sp=0,cache=0;if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;if((error=uc_mem_read(e,cache_slot,&cache,4)))return error;
 if((mesh|cache)&3||cache>0xfffffc73u||overlap(cache_slot,4,cache+0x378,16)||overlap(cache_slot,4,sp-40,40)||overlap(mesh,0x110,sp-40,40)||overlap(mesh,0x110,cache+0x378,16)||overlap(cache+0x378,16,sp-40,40))return 0;
 uint8_t fields[0x110];if((error=uc_mem_read(e,mesh,fields,sizeof(fields))))return error;uint32_t buffer=word(fields+0xcc),stride=word(fields+0xc4),maximum=0;
 if((buffer&3)||overlap(buffer,0x120,cache+0x378,16)||overlap(buffer,0x120,sp-40,40))return 0;
 uint32_t data[11],base=0;if((error=uc_mem_read(e,buffer,data,sizeof(data))))return error;if(data[0]>64)return 0;
 uint32_t selected=buffer+(data[0]+2)*4;if(overlap(selected,4,cache+0x378,16)||overlap(selected,4,sp-40,40))return 0;
 if(!data[4]){uint32_t handle=0;if((error=uc_mem_read(e,selected,&handle,4)))return error;if(!handle)base=data[6];}
 if((error=uc_mem_read(e,cache+0x104,&maximum,4)))return error;if(maximum>16)return 0;
 if((error=uc_mem_read(e,cache+0x378,plan.enabled,16)))return error;
 int16_t normals=0;memcpy(&normals,fields+0x60,2);uint32_t uv=fields[0x62];if(uv>8)return 0;
 uint32_t attributes=1+(normals>=1)+(normals>1)+(word(fields+0xec)>0&&!(word(fields+0xec)&0x80000000u))+(word(fields+0xe8)>0&&!(word(fields+0xe8)&0x80000000u))+uv+(word(fields+0xf4)>0&&!(word(fields+0xf4)&0x80000000u));if(attributes>16)return 0;
 attribute(&plan,0,4,data[7],stride,base);uint32_t next=1;
 if(normals>=1){uint32_t unit=1;if(normals>1){attribute(&plan,1,(uint32_t)(normals-1),0x1406,stride,base+word(fields+0xd8));unit=2;}attribute(&plan,unit,4,0x1406,stride,base+word(fields+0xe0));next=unit+1;}
 if((int32_t)word(fields+0xec)>0){attribute(&plan,next++,4,data[8],stride,base+word(fields+0xec));}
 if((int32_t)word(fields+0xe8)>0){attribute(&plan,next++,4,data[9],stride,base+word(fields+0xe8));}
 for(unsigned i=0;i<uv;i++)attribute(&plan,next++,2,data[10],stride,base+fields[0xf8+i]);
 if((int32_t)word(fields+0xf4)>0)attribute(&plan,next++,4,0x1406,stride,base+word(fields+0xf4));
 uint32_t compared=next;while(compared<maximum)enable(&plan,compared++,0);
 if((error=uc_mem_write(e,cache+0x378,plan.enabled,16)))return error;
 for(unsigned i=0;i<plan.used;i++)if((error=ou_gl_batch_append_void(batch,plan.calls[i].id,plan.calls[i].args)))return error;
 uint32_t cpsr=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|(compared==maximum?0x60000000u:0x20000000u);if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}
