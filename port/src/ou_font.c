#include "ou_font.h"
#include "ou_hot.h"
#include <unicorn/arm.h>
#include <stdlib.h>
#include <string.h>
#include "fpu/softfloat-types.h"
extern float32 float32_mul_arm(float32,float32,float_status *);
extern float32 float32_add_arm(float32,float32,float_status *);
extern float32 helper_vfp_sitos_arm(uint32_t,void *);
extern uint32_t helper_vfp_tosizs_arm(float32,void *);
static int read32(uc_engine *e,uint32_t p,uint32_t *v){return uc_mem_read(e,p,v,4);}
static int overlap(uint32_t p,uint32_t n,uint32_t q,uint32_t m){return (uint64_t)p+n>q&&(uint64_t)q+m>p;}
static int stable(uint32_t p,uint32_t n,uint32_t out,uint32_t capacity,uint32_t sp){return (uint64_t)p+n<=0x100000000ull&&!overlap(p,n,out,capacity)&&!overlap(p,n,sp,0x4c);}
int ou_font_layout(uc_engine *e,const uint32_t targets[5],uint32_t *handled){
 *handled=0;uint32_t r[8],fp[5],frame[18],font[72],fpscr=0,cpsr=0,vtable[4],scale=0,global=0,ui=0,ui_scale=0;
 const int ids[8]={UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R9,UC_ARM_REG_R10,UC_ARM_REG_R11,UC_ARM_REG_SP};void *p[8];for(unsigned i=0;i<8;i++)p[i]=r+i;
 if(uc_reg_read_batch(e,ids,p,8)||uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr)||uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr))return 0;
 if(fpscr&((7u<<16)|(3u<<20)|0x1f00u))return 0;
 const uint32_t object=r[0],start=r[1],text=r[2],length=r[3],sp=r[7];if(start>=length||length>2048||(object|text|r[6]|sp)&3)return 0;
 if(uc_mem_read(e,sp,frame,sizeof(frame))||uc_mem_read(e,object,font,sizeof(font)))return 0;
 if(uc_mem_read(e,font[0],vtable,16)||vtable[1]!=targets[0]||vtable[3]!=targets[1])return 0;
 if(frame[10]!=sp+0x44)return 0;
 const uint32_t out=frame[8],capacity=(length-start)*192,last=font[6]&65535,table_bytes=(last+1)*2;if(out&3||(uint64_t)out+capacity>0x100000000ull||overlap(out,capacity,sp,0x4c))return 0;
 if(!stable(font[0],16,out,capacity,sp)||!stable(object,sizeof(font),out,capacity,sp)||!stable(text,length*4+4,out,capacity,sp)||!stable(r[6],4,out,capacity,sp))return 0;
 if(read32(e,targets[2],&global)||read32(e,global,&ui)||read32(e,ui+0x14,&ui_scale)||read32(e,r[6],&scale))return 0;
 if(!stable(targets[2],4,out,capacity,sp)||!stable(global,4,out,capacity,sp)||!stable(ui+0x14,4,out,capacity,sp))return 0;
 const uint32_t tables[8]={font[15],font[14],font[16],font[10],font[11],font[12],font[13],font[70]};
 const uint32_t sizes[8]={table_bytes,(last+1)*4,last+1,(last+1)*4,(last+1)*4,(last+1)*4,(last+1)*4,last};
 for(unsigned i=0;i<8;i++)if(tables[i]&&(!stable(tables[i],sizes[i],out,capacity,sp)||(i>=3&&i<=6&&(tables[i]&3))))return 0;
 if(font[71]&&!stable(font[71],last,out,capacity,sp))return 0;
 uint32_t *letters=malloc((length+1)*4),*vertices=malloc(capacity);uint16_t *characters=malloc(table_bytes);
 if(!letters||!vertices||!characters){free(letters);free(vertices);free(characters);return UC_ERR_NOMEM;}
 int error=0;if(uc_mem_read(e,text,letters,(length+1)*4)||uc_mem_read(e,font[15],characters,table_bytes)||uc_mem_read(e,out,vertices,capacity))goto done;
 for(uint32_t i=start;i<length;i++)if(letters[i]==47)goto done;
 const int sids[5]={UC_ARM_REG_S16,UC_ARM_REG_S17,UC_ARM_REG_S18,UC_ARM_REG_S19,UC_ARM_REG_S20};void *ps[5];for(unsigned i=0;i<5;i++)ps[i]=fp+i;if(uc_reg_read_batch(e,sids,ps,5))goto done;
 float_status status={0};const signed char rounds[4]={0,2,1,3};status.float_detect_tininess=float_tininess_before_rounding;status.float_rounding_mode=rounds[(fpscr>>22)&3];status.flush_to_zero=status.flush_inputs_to_zero=(fpscr>>24)&1;status.default_nan_mode=(fpscr>>25)&1;
 uint32_t used=0,previous=frame[3],kind=r[4],last_pointer=r[5];int processed=0;
 for(uint32_t i=start;i<length;i++){
  last_pointer=text+i*4;if(letters[i]<=31)continue;processed=1;kind=0;
  uint32_t glyph=ou_font_char_index(characters,(uint16_t)last,letters[i]),width=0;int32_t kern=0;int8_t k=0;uint8_t page=0;
  if(previous<last&&font[71]){if(uc_mem_read(e,font[71]+previous,&k,1))goto done;kern=k;}
  if(glyph<last&&font[70]){if(uc_mem_read(e,font[70]+glyph,&k,1))goto done;kern+=k;}
  uint32_t factor=float32_mul_arm(fp[0],scale,&status),kern_float=helper_vfp_sitos_arm((uint32_t)kern,&status);
  fp[1]=float32_add_arm(fp[1],float32_mul_arm(factor,kern_float,&status),&status);
  if(read32(e,font[14]+glyph*4,&width)||uc_mem_read(e,font[16]+glyph,&page,1))goto done;
  factor=float32_mul_arm(fp[0],scale,&status);fp[4]=float32_mul_arm(factor,helper_vfp_sitos_arm(width,&status),&status);
  if(page==frame[4]){
   fp[4]=float32_add_arm(fp[1],fp[4],&status);uint32_t uv[4];for(unsigned j=0;j<4;j++)if(read32(e,font[10+j]+glyph*4,uv+j))goto done;
   const unsigned xs[6]={1,1,4,1,4,4},ys[6]={2,3,2,3,3,2},us[6]={0,0,1,0,1,1},vs[6]={2,3,2,3,3,2};
   for(unsigned j=0;j<6;j++){uint32_t *q=vertices+used*48+j*8;q[0]=fp[xs[j]];q[1]=fp[ys[j]];q[2]=uv[us[j]];q[3]=uv[vs[j]];memcpy(q+4,font+63,16);}used++;last_pointer=font[12]+glyph*4;
  }else fp[1]=float32_add_arm(fp[1],fp[4],&status);
  uint32_t extra=helper_vfp_tosizs_arm(float32_mul_arm(helper_vfp_sitos_arm(font[68],&status),ui_scale,&status),&status),extra_float=helper_vfp_sitos_arm(extra,&status);
  fp[1]=page==frame[4]?float32_add_arm(extra_float,fp[4],&status):float32_add_arm(fp[1],extra_float,&status);previous=glyph;
 }
 if(used&&(error=uc_mem_write(e,out,vertices,used*192)))goto done;
 if(processed){uint32_t zero=0;if((error=uc_mem_write(e,sp+0xc,&previous,4))||(error=uc_mem_write(e,sp+0x44,&zero,4)))goto done;}
 if(used){uint32_t next=out+used*192,count=frame[11]+used*6;if((error=uc_mem_write(e,sp+0x20,&next,4))||(error=uc_mem_write(e,sp+0x2c,&count,4)))goto done;}
 uint32_t flags=status.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1),final_fpscr=fpscr|raised,final_cpsr=(cpsr&0x0fffffff)|0x60000000;
 if((error=uc_reg_write(e,UC_ARM_REG_FPSCR,&final_fpscr))||(error=uc_reg_write(e,UC_ARM_REG_CPSR,&final_cpsr))||(error=uc_reg_write(e,UC_ARM_REG_R6,&length))||(error=uc_reg_write(e,UC_ARM_REG_R9,&kind))||(error=uc_reg_write(e,UC_ARM_REG_R10,&last_pointer)))goto done;
 for(unsigned i=0;i<5;i++)if((error=uc_reg_write(e,sids[i],fp+i)))goto done;*handled=1;
done:free(letters);free(vertices);free(characters);return error;
}
