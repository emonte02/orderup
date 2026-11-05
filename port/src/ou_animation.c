/* Original packed quaternion keys and bone quaternion/vector interpolation.
 * Pinned ARM SoftFloat retains float32 operation order, rounding and FPSCR.
 * Bone/key/output aliases, changed key callbacks and unusual layouts fall back. */
#include <stdint.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include "fpu/softfloat.h"
extern float32 int32_to_float32_arm(int32_t,float_status *);
extern float32 uint32_to_float32_arm(uint32_t,float_status *);
extern float32 float32_mul_arm(float32,float32,float_status *);
extern float32 float32_add_arm(float32,float32,float_status *);
extern float32 float32_sub_arm(float32,float32,float_status *);
extern float32 float32_div_arm(float32,float32,float_status *);
extern float32 float32_sqrt_arm(float32,float_status *);
extern int float32_compare_arm(float32,float32,float_status *);
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
static int finite(uint32_t v){return(v&0x7f800000u)!=0x7f800000u;}
static uint32_t compare_flags(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
static uint32_t relation_flags(int n){return n==float_relation_less?0x80000000u:n==float_relation_equal?0x60000000u:n==float_relation_greater?0x20000000u:0x30000000u;}
#define ADD(a,b) float32_add_arm((a),(b),status)
#define SUB(a,b) float32_sub_arm((a),(b),status)
#define MUL(a,b) float32_mul_arm((a),(b),status)
#define DIV(a,b) float32_div_arm((a),(b),status)
static int quat_key(uc_engine *e,uint32_t key,uint32_t stride,uint32_t q[4],float_status *status,uint32_t *result,uint32_t *comparison){
 int error=0;*result=key;*comparison=compare_flags(stride,8);
 if(stride!=8)return uc_mem_read(e,key+4,q,16);
 int8_t packed[4];if((error=uc_mem_read(e,key+4,packed,4)))return error;*result=(uint32_t)(int32_t)packed[0];
 for(unsigned i=0;i<4;i++)q[i]=MUL(int32_to_float32_arm(packed[i],status),0x3c010204u);
 uint32_t length=MUL(q[0],q[0]);for(unsigned i=1;i<4;i++)length=ADD(length,MUL(q[i],q[i]));
 int relation=float32_compare_arm(length,0,status);*comparison=relation_flags(relation);
 if(relation==float_relation_greater){uint32_t scale=DIV(0x3f800000u,float32_sqrt_arm(length,status));for(unsigned i=0;i<4;i++)q[i]=MUL(scale,q[i]);}
 return 0;
}
static int find_key(uc_engine *e,uint32_t base,uint32_t count,uint32_t stride,uint32_t time,uint32_t time_offset,uint32_t *index){
 int error=0,low=0,high=(int)count-1;uint32_t value=0;
 if(high>0)while(low<high){int middle=(low+high+1)>>1;if((error=uc_mem_read(e,base+(uint32_t)middle*stride+time_offset,&value,4)))return error;if(time<value)high=middle-1;else low=middle;}
 *index=(uint32_t)low;return 0;
}
int ou_guest_animation(uc_engine *e,uint32_t kind,const uint32_t args[4],const uint32_t targets[6],uint32_t *result,uint32_t *handled){
 *handled=0;*result=args[0];uint32_t fpscr=0,cpsr=0,sp=0;int error=0;if(kind>3)return UC_ERR_ARG;
 if((error=uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr)))return error;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;
 uint32_t out=kind?args[2]:args[1],key=args[0],stride=args[2],index=0,time=args[1],count=0,comparison=0,output[4]={0},bytes=16;int compared=0;
 if(((args[0]|out)&3)||overlap(out,16,0xfffffff0u,16)||(fpscr&((7u<<16)|(3u<<20)|0x1f00u)))return 0;
 float_status state={0},*status=&state;const signed char rounds[4]={0,2,1,3};state.float_detect_tininess=float_tininess_before_rounding;state.float_rounding_mode=rounds[(fpscr>>22)&3];state.flush_to_zero=state.flush_inputs_to_zero=(fpscr>>24)&1;state.default_nan_mode=(fpscr>>25)&1;
 if(!kind){if((error=quat_key(e,key,stride,output,status,result,&comparison)))return error;compared=stride==8;}
 else{
  uint32_t bone=args[0],base=0;uint16_t n=0,step=0;
  if((error=uc_mem_read(e,bone+(kind==1?0:kind==2?2:4),&n,2)))return error;count=n;if(count>4096)return 0;
  if((error=uc_mem_read(e,bone+(kind==1?8:kind==2?12:16),&base,4)))return error;stride=16;
  if(kind==1){if((error=uc_mem_read(e,bone+6,&step,2)))return error;stride=step;if(stride!=8&&stride!=20)return 0;uint32_t code[2];if((error=uc_mem_read(e,targets[4],code,8)))return error;if(!((code[0]==0xe3520008u&&code[1]==0xe2803004u)||(code[0]==0xe51ff004u&&code[1]==targets[5])))return 0;}
  uint32_t span=((count?count:1)+(kind==1?0:1))*stride;
  if((base&3)||overlap(out,16,bone,20)||overlap(out,16,base,span)||overlap(out,16,sp-96,96)||overlap(bone,20,sp-96,96)||overlap(base,span,sp-96,96))return 0;
  if((error=find_key(e,base,count,stride,time,kind==1?0:12,&index)))return error;key=base+index*stride;uint32_t key_time=0;if((error=uc_mem_read(e,key+(kind==1?0:12),&key_time,4)))return error;
  if(kind==1){
   if(time<=key_time||index+1>=count){if((error=quat_key(e,key,stride,output,status,result,&comparison)))return error;compared=stride==8;}
   else{
    uint32_t a[4],b[4],next=key+stride,next_time=0,unused=0;if((error=quat_key(e,key,stride,a,status,&unused,&comparison)))return error;if((error=quat_key(e,next,stride,b,status,result,&comparison)))return error;
    for(unsigned i=0;i<4;i++)if(!finite(a[i])||!finite(b[i]))return 0;
    if((error=uc_mem_read(e,next,&next_time,4)))return error;
    uint32_t dot=MUL(b[0],a[0]);for(unsigned i=1;i<4;i++)dot=ADD(dot,MUL(b[i],a[i]));uint32_t numerator=uint32_to_float32_arm(time-key_time,status),denominator=uint32_to_float32_arm(next_time-key_time,status);int negative=float32_compare_arm(dot,0,status)==float_relation_less;uint32_t blend=DIV(numerator,denominator);
    for(unsigned i=0;i<4;i++){uint32_t delta=negative?(i==3?SUB(b[i]^0x80000000u,a[i]):SUB(a[i]^0x80000000u,b[i])):SUB(b[i],a[i]);output[i]=ADD(a[i],MUL(blend,delta));}
    uint32_t length=MUL(output[0],output[0]);for(unsigned i=1;i<4;i++)length=ADD(length,MUL(output[i],output[i]));if(!finite(length))return 0;int relation=float32_compare_arm(length,0,status);comparison=relation_flags(relation);compared=1;
    if(relation==float_relation_greater){uint32_t scale=DIV(0x3f800000u,float32_sqrt_arm(length,status));for(unsigned i=0;i<4;i++)output[i]=MUL(output[i],scale);}
   }
  }else{
   comparison=compare_flags(time,key_time);*result=index;
   if(time<=key_time){if((error=uc_mem_read(e,key,output,12)))return error;output[3]=0x3f800000u;}
   else{uint32_t next[4],current[4];if((error=uc_mem_read(e,key,current,16)))return error;if((error=uc_mem_read(e,key+16,next,16)))return error;for(unsigned i=0;i<3;i++)if(!finite(current[i])||!finite(next[i]))return 0;*result=next[3]-key_time;uint32_t blend=DIV(uint32_to_float32_arm(time-key_time,status),uint32_to_float32_arm(*result,status));for(unsigned i=0;i<3;i++)output[i]=ADD(current[i],MUL(blend,SUB(next[i],current[i])));bytes=12;}
  }
 }
 if(kind==1)for(unsigned i=0;i<4;i++)if(!finite(output[i]))return 0;
 uint32_t flags=state.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1),control=(compared?(fpscr&0x0fffffffu)|comparison:fpscr)|raised;
 if((error=uc_mem_write(e,out,output,bytes)))return error;if((error=uc_reg_write(e,UC_ARM_REG_FPSCR,&control)))return error;cpsr=(cpsr&0x0fffffffu)|comparison;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}
